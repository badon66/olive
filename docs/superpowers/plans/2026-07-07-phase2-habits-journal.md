# Olive Phase 2 — Habits + Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habit check-offs with streaks (correct across week boundaries, shown in the daily brief) and a journal where dictated/pasted raw text gets a faithful Claude-cleaned version — both stored, both viewable, editable after the fact.

**Architecture:** Two new UI surfaces (Habits, Journal) on both layouts — new tabs on mobile, new panels on the desktop dashboard. Streaks are pure client-side functions over `habit_checkins` (TDD'd — this is the "survives week boundaries" done-when). Journal cleaning is a new `journal-clean` Edge Function: pure transform (raw → {cleaned_text, tags} via Claude tool-use + zod), the client previews then saves the row itself under RLS — no server-side write, so the user judges faithfulness before anything persists, and cleaning can be retried on old entries.

**Tech Stack:** Same as Phase 1 — React/Vite/Tailwind v4, supabase-js, Vitest; Edge Function reuses `_shared/anthropic.ts` (Vault key) + zod. Model `claude-sonnet-4-6`.

## Global Constraints (inherit all of Phase 1's; deltas only)

- Cleaning rewrites for coherence ONLY — never adds content, never changes meaning. Both raw and cleaned stored and viewable.
- Check-in details (note/duration) are OFFERED, never required — one tap to skip.
- Timezone: America/Edmonton for all day/week logic. Weeks start Monday.
- Streak definitions (locked here):
  - Daily habit: consecutive days with a completed check-in ending today, or ending yesterday if today isn't checked yet (an unchecked *today* never breaks a streak in progress). 0 if neither.
  - Weekly habit: consecutive Monday-started weeks with ≥1 completed check-in, ending this week, or last week if this week isn't checked yet.
- Graceful degradation: if `journal-clean` fails (e.g. no API credits yet), the user can still save the raw entry (`cleaned_text` null, shown as "raw — not cleaned yet") and re-run cleaning later.
- NL habit/journal commands via the chat bar are OUT of scope (Phase 9 unifies routing). Habit UI is manual; journal input is its own composer.
- Phase 2 ONLY. Stop after Task 7. No jobs, no calendar.

## File Structure

```
src/lib/streaks.ts + streaks.test.ts     # pure: addDays, mondayOf, dailyStreak, weeklyStreak, last7Days
src/lib/dates.ts                          # + addDays (moved here, streaks re-exports nothing)
src/hooks/useHabits.ts                    # habits + checkins CRUD, checkIn/uncheck/saveDetail
src/hooks/useJournal.ts                   # entries list, save, update, cleanEntry (edge call)
src/components/HabitsView.tsx             # habit rows: streak chip, 7-day strip, check ring, detail expand; add/edit/delete
src/components/JournalView.tsx            # composer (raw → clean preview → save) + list + detail/edit modal
src/lib/api.ts                            # + cleanJournal(raw): Promise<{cleaned_text, tags}>
supabase/functions/journal-clean/index.ts # Claude tool-use transform, zod-gated
supabase/migrations/20260707000005_phase2_habits_journal.sql
src/App.tsx                               # mobile nav: Brief | Tasks | Habits | Journal
src/components/DesktopDashboard.tsx       # + Habits panel (left), Journal panel (right)
src/components/BriefView.tsx              # + streak chips row (mobile brief)
```

---

### Task 1: Migration — habits, habit_checkins, journal_entries + RLS + types

**Files:**
- Create: `supabase/migrations/20260707000005_phase2_habits_journal.sql`
- Modify: `src/lib/database.types.ts` (regenerate via MCP)

**Interfaces:**
- Produces tables used verbatim by all later tasks: `habits(id, user_id, name, frequency, created_at)`, `habit_checkins(id, user_id, habit_id, date, completed, note, duration_minutes, created_at)` unique `(habit_id, date)`, `journal_entries(id, user_id, date, raw_transcript, cleaned_text, tags, created_at)`.

- [ ] **Step 1: Write migration file**

```sql
-- Phase 2: habits + journal
create type habit_frequency as enum ('daily', 'weekly');

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency habit_frequency not null default 'daily',
  created_at timestamptz not null default now()
);

create table habit_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references habits(id) on delete cascade,
  date date not null,
  completed boolean not null default true,
  note text,
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  raw_transcript text not null,
  cleaned_text text,               -- null = not cleaned yet (e.g. API unavailable); UI shows raw
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index habit_checkins_habit_date_idx on habit_checkins (habit_id, date desc);
create index journal_entries_user_date_idx on journal_entries (user_id, date desc);

alter table habits enable row level security;
alter table habit_checkins enable row level security;
alter table journal_entries enable row level security;

create policy "own habits" on habits for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own checkins" on habit_checkins for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own journal" on journal_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply via MCP `apply_migration`** (project `dpkdsmvskryettdxcvpp`, name `phase2_habits_journal`, identical SQL). Verify with `list_tables` (3 new tables, RLS on).
- [ ] **Step 3: Regenerate types** via MCP `generate_typescript_types` → replace `src/lib/database.types.ts`. `npm run build` passes.
- [ ] **Step 4: `get_advisors` (security)** — expect clean.
- [ ] **Step 5: Commit** — `git commit -m "feat: phase 2 schema (habits, habit_checkins, journal_entries) with RLS"`

---

### Task 2: Streak logic (TDD — the week-boundary done-when lives here)

**Files:**
- Modify: `src/lib/dates.ts` (add `addDays`)
- Create: `src/lib/streaks.ts`, `src/lib/streaks.test.ts`

**Interfaces:**
- Produces:
  - `addDays(iso: string, n: number): string` (in dates.ts)
  - `mondayOf(iso: string): string` — Monday of that date's week
  - `dailyStreak(checkedDates: Set<string>, today: string): number`
  - `weeklyStreak(checkedDates: Iterable<string>, today: string): number`
  - `last7Days(today: string): string[]` — oldest→newest, ends with today

- [ ] **Step 1: Write failing tests — `streaks.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { dailyStreak, last7Days, mondayOf, weeklyStreak } from "./streaks";

describe("mondayOf", () => {
  it("maps any weekday to that week's Monday", () => {
    expect(mondayOf("2026-07-07")).toBe("2026-07-06"); // Tue → Mon
    expect(mondayOf("2026-07-06")).toBe("2026-07-06"); // Mon → itself
    expect(mondayOf("2026-07-12")).toBe("2026-07-06"); // Sun → previous Mon
  });
  it("crosses month and year boundaries", () => {
    expect(mondayOf("2026-01-01")).toBe("2025-12-29"); // Thu Jan 1 → Mon Dec 29
  });
});

describe("dailyStreak", () => {
  const TODAY = "2026-07-07";
  it("counts consecutive days ending today", () => {
    expect(dailyStreak(new Set(["2026-07-05", "2026-07-06", "2026-07-07"]), TODAY)).toBe(3);
  });
  it("unchecked today doesn't break a streak (grace until day ends)", () => {
    expect(dailyStreak(new Set(["2026-07-05", "2026-07-06"]), TODAY)).toBe(2);
  });
  it("a gap before yesterday breaks it", () => {
    expect(dailyStreak(new Set(["2026-07-04", "2026-07-06"]), TODAY)).toBe(1);
  });
  it("zero when neither today nor yesterday checked", () => {
    expect(dailyStreak(new Set(["2026-07-04"]), TODAY)).toBe(0);
  });
  it("survives month boundaries", () => {
    expect(dailyStreak(new Set(["2026-06-29", "2026-06-30", "2026-07-01"]), "2026-07-01")).toBe(3);
  });
});

describe("weeklyStreak", () => {
  const TODAY = "2026-07-07"; // Tue of week starting Mon 2026-07-06
  it("counts consecutive weeks ending this week", () => {
    expect(weeklyStreak(["2026-06-24", "2026-07-01", "2026-07-07"], TODAY)).toBe(3);
  });
  it("unchecked current week doesn't break (grace until week ends)", () => {
    expect(weeklyStreak(["2026-06-24", "2026-07-01"], TODAY)).toBe(2);
  });
  it("a skipped week breaks it", () => {
    expect(weeklyStreak(["2026-06-17", "2026-07-01"], TODAY)).toBe(1);
  });
  it("zero when neither this week nor last week checked", () => {
    expect(weeklyStreak(["2026-06-17"], TODAY)).toBe(0);
  });
  it("multiple check-ins in one week count once", () => {
    expect(weeklyStreak(["2026-07-06", "2026-07-07", "2026-07-01"], TODAY)).toBe(2);
  });
  it("survives year boundaries", () => {
    // weeks: Mon 2025-12-22, Mon 2025-12-29, Mon 2026-01-05
    expect(weeklyStreak(["2025-12-23", "2025-12-31", "2026-01-06"], "2026-01-06")).toBe(3);
  });
});

describe("last7Days", () => {
  it("returns 7 dates oldest-first ending today", () => {
    const days = last7Days("2026-07-07");
    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-07-01");
    expect(days[6]).toBe("2026-07-07");
  });
});
```

- [ ] **Step 2: `npm run test`** — FAIL (module missing).
- [ ] **Step 3: Implement.** In `dates.ts` add:

```ts
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
```

`streaks.ts`:

```ts
import { addDays } from "./dates";

export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

// Consecutive checked days ending today (or yesterday — an unchecked today
// never breaks a streak in progress).
export function dailyStreak(checkedDates: Set<string>, today: string): number {
  let cursor = checkedDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (checkedDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

// Consecutive Monday-weeks with ≥1 check-in ending this week (or last week —
// same grace rule as daily).
export function weeklyStreak(checkedDates: Iterable<string>, today: string): number {
  const weeks = new Set([...checkedDates].map(mondayOf));
  const thisWeek = mondayOf(today);
  let cursor = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export function last7Days(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
}
```

- [ ] **Step 4: `npm run test`** — all PASS (existing 14 + new).
- [ ] **Step 5: Commit** — `git commit -m "feat: daily/weekly streak logic with week-boundary tests"`

---

### Task 3: useHabits hook

**Files:**
- Create: `src/hooks/useHabits.ts`

**Interfaces:**
- Consumes: schema (Task 1), `edmontonToday`/`addDays` (existing), `last7Days` (Task 2).
- Produces: `useHabits()` → `{ habits: Habit[]; checkins: Checkin[]; loading: boolean; refresh(): Promise<void>; addHabit(name: string, frequency: "daily" | "weekly"): Promise<void>; updateHabit(id: string, patch: { name?: string; frequency?: "daily" | "weekly" }): Promise<void>; deleteHabit(id: string): Promise<void>; checkIn(habitId: string, date: string): Promise<Checkin | null>; uncheck(habitId: string, date: string): Promise<void>; saveDetail(checkinId: string, detail: { note: string | null; duration_minutes: number | null }): Promise<void> }` where `Habit = Database["public"]["Tables"]["habits"]["Row"]`, `Checkin = Database["public"]["Tables"]["habit_checkins"]["Row"]`.

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";
import { addDays, edmontonToday } from "../lib/dates";

export type Habit = Database["public"]["Tables"]["habits"]["Row"];
export type Checkin = Database["public"]["Tables"]["habit_checkins"]["Row"];

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // 120 days of history is plenty for streaks + week strips
    const since = addDays(edmontonToday(), -120);
    const [h, c] = await Promise.all([
      supabase.from("habits").select("*").order("created_at"),
      supabase.from("habit_checkins").select("*").gte("date", since),
    ]);
    if (!h.error && h.data) setHabits(h.data);
    if (!c.error && c.data) setCheckins(c.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    habits,
    checkins,
    loading,
    refresh,
    addHabit: async (name: string, frequency: "daily" | "weekly") => {
      await supabase.from("habits").insert({ name, frequency, user_id: await userId() });
      await refresh();
    },
    updateHabit: async (id: string, patch: { name?: string; frequency?: "daily" | "weekly" }) => {
      await supabase.from("habits").update(patch).eq("id", id);
      await refresh();
    },
    deleteHabit: async (id: string) => {
      await supabase.from("habits").delete().eq("id", id); // checkins cascade
      await refresh();
    },
    checkIn: async (habitId: string, date: string) => {
      const { data } = await supabase
        .from("habit_checkins")
        .insert({ habit_id: habitId, date, user_id: await userId() })
        .select("*")
        .single();
      await refresh();
      return data ?? null;
    },
    uncheck: async (habitId: string, date: string) => {
      await supabase.from("habit_checkins").delete().eq("habit_id", habitId).eq("date", date);
      await refresh();
    },
    saveDetail: async (checkinId: string, detail: { note: string | null; duration_minutes: number | null }) => {
      await supabase.from("habit_checkins").update(detail).eq("id", checkinId);
      await refresh();
    },
  };
}
```

- [ ] **Step 2: `npm run build` passes. Commit** — `git commit -m "feat: habits data hook"`

---

### Task 4: HabitsView — check-off UI with optional detail

**Files:**
- Create: `src/components/HabitsView.tsx`

**Interfaces:**
- Consumes: `useHabits()` return (passed as props from shell), `dailyStreak`/`weeklyStreak`/`last7Days` (Task 2), HUD classes.
- Produces: `<HabitsView {...habitStore} />` used by both shells (Task 6/7).

Behavior contract (exact):
- Each habit row (inside one `hud-panel` list): name (font-body 600), frequency chip (`daily`/`weekly`, font-data), streak chip — `dailyStreak`/`weeklyStreak` per frequency, rendered `▮ 12d` / `▮ 3w`, signal-colored when > 0, dim when 0.
- 7-day strip: `last7Days(today)` as 7 small squares — filled signal when a completed check-in exists that day, `signal/12%` otherwise (matches reference week strips).
- Today's check control: 44px ring button (same visual as TaskCard's). Tap when unchecked → `checkIn`, then the row expands an inline detail strip: note input (placeholder "note — optional"), duration input (`type="number"`, placeholder "min"), buttons **Save** (`saveDetail`) and **Skip** (collapse, saves nothing). One tap to skip; strip also auto-collapses after Save. Tap when checked → confirm-free `uncheck` (single tap toggles; detail is lost with the row, acceptable).
- When a past check-in has note/duration, show it as a dim second line under the name (`note · 45 min`).
- "+ Add habit" `hud-button` opens a small modal (reuse `hud-panel` modal pattern from TaskForm): name (required) + frequency segmented control (daily | weekly). Editing = tap habit name → same modal prefilled + a delete button with confirm dialog ("Delete <name>? Its history goes too.").
- Empty state: "No habits yet. Add one to start a streak."

- [ ] **Step 1: Implement per contract above** (state: `expandedCheckin: Checkin | null`, `editing: Habit | null`, `adding: boolean`, `confirmDelete: Habit | null`; today from `edmontonToday()`).
- [ ] **Step 2: `npm run build` + visual check in preview** (mobile width): add habit, check off, add note, skip path, uncheck, edit, delete.
- [ ] **Step 3: Commit** — `git commit -m "feat: habits view with check-offs, optional details, streaks"`

---

### Task 5: journal-clean Edge Function + api helper

**Files:**
- Create: `supabase/functions/journal-clean/index.ts`
- Modify: `src/lib/api.ts`

**Interfaces:**
- Produces: `POST /functions/v1/journal-clean` body `{ raw: string }`, user JWT required, returns `{ cleaned_text: string, tags: string[] }` (no DB write). Frontend: `cleanJournal(raw: string): Promise<{ cleaned_text: string; tags: string[] }>`.

- [ ] **Step 1: `journal-clean/index.ts`**

```ts
import { userClient } from "../_shared/supabase.ts";
import { callClaude } from "../_shared/anthropic.ts";
import { z } from "npm:zod@3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CleanSchema = z.object({
  cleaned_text: z.string().min(1),
  tags: z.array(z.string().min(1).max(24)).max(3).default([]),
});

const CLEAN_TOOL = {
  name: "return_cleaned",
  description: "Return the cleaned journal entry and up to 3 topic tags.",
  input_schema: {
    type: "object",
    required: ["cleaned_text", "tags"],
    properties: {
      cleaned_text: { type: "string" },
      tags: { type: "array", items: { type: "string" }, maxItems: 3 },
    },
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const supabase = userClient(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: CORS });

    const { raw } = await req.json();
    if (typeof raw !== "string" || !raw.trim()) {
      return Response.json({ error: "empty entry" }, { status: 400, headers: CORS });
    }

    const system = [
      "You clean up dictated journal entries.",
      "Rewrite ONLY for coherence: fix grammar, remove filler words and false starts, join fragments.",
      "NEVER add content, NEVER change meaning, NEVER summarize away details, keep first person and the writer's tone.",
      "Keep paragraph breaks where topic shifts. Return via the return_cleaned tool with up to 3 short lowercase topic tags.",
    ].join("\n");

    const rawResult = await callClaude({ system, user: raw, tool: CLEAN_TOOL, toolName: "return_cleaned" });
    const result = CleanSchema.parse(rawResult);
    return Response.json(result, { headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "clean failed", detail: String(e) }, { status: 500, headers: CORS });
  }
});
```

- [ ] **Step 2: Deploy via MCP** (name `journal-clean`, verify_jwt ON, include `_shared/anthropic.ts` + `_shared/supabase.ts`).
- [ ] **Step 3: `api.ts` — add**

```ts
export async function cleanJournal(raw: string): Promise<{ cleaned_text: string; tags: string[] }> {
  const { data, error } = await supabase.functions.invoke("journal-clean", { body: { raw } });
  if (error) throw new Error(error.message);
  return data as { cleaned_text: string; tags: string[] };
}
```

- [ ] **Step 4: Commit** — `git commit -m "feat: journal-clean edge function (coherence-only rewrite, zod-gated)"`
  (Live verification deferred to Task 7 — requires Anthropic credits; the 500 error path is what the composer's degradation handles.)

---

### Task 6: useJournal + JournalView

**Files:**
- Create: `src/hooks/useJournal.ts`, `src/components/JournalView.tsx`

**Interfaces:**
- Consumes: schema (Task 1), `cleanJournal` (Task 5), HUD classes.
- Produces: `useJournal()` → `{ entries: Entry[]; loading: boolean; refresh(): Promise<void>; saveEntry(input: { date: string; raw_transcript: string; cleaned_text: string | null; tags: string[] }): Promise<void>; updateEntry(id: string, patch: { date?: string; cleaned_text?: string | null; tags?: string[] }): Promise<void>; deleteEntry(id: string): Promise<void> }` with `Entry = Database["public"]["Tables"]["journal_entries"]["Row"]`. `<JournalView />` self-contained (calls `useJournal` itself — journal data isn't shared with any other surface).

`useJournal` implementation:

```ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Database } from "../lib/database.types";

export type Entry = Database["public"]["Tables"]["journal_entries"]["Row"];

export function useJournal() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const userId = async () => (await supabase.auth.getUser()).data.user!.id;

  return {
    entries,
    loading,
    refresh,
    saveEntry: async (input: { date: string; raw_transcript: string; cleaned_text: string | null; tags: string[] }) => {
      await supabase.from("journal_entries").insert({ ...input, user_id: await userId() });
      await refresh();
    },
    updateEntry: async (id: string, patch: { date?: string; cleaned_text?: string | null; tags?: string[] }) => {
      await supabase.from("journal_entries").update(patch).eq("id", id);
      await refresh();
    },
    deleteEntry: async (id: string) => {
      await supabase.from("journal_entries").delete().eq("id", id);
      await refresh();
    },
  };
}
```

`JournalView` behavior contract (exact):
- **Composer** (top `hud-panel`): textarea (`hud-input`, 4 rows, placeholder "Paste or dictate your entry…"), date input defaulting to `edmontonToday()`, button **Clean up & preview** → `cleanJournal(raw)`; while busy show `pulse-live` "Olive is cleaning…". On success show preview block: cleaned text, tag chips, and the raw underneath (dim, collapsed behind "show original"); buttons **Save both** (`saveEntry` with cleaned) and **Discard cleaning** (back to editing raw). On failure show amber notice "Cleaning unavailable — <detail>" + button **Save raw anyway** (`saveEntry` with `cleaned_text: null`). Composer clears after save.
- **List** below: one row per entry — date (font-data), first ~80 chars of `cleaned_text ?? raw_transcript`, tag chips, amber `raw` chip when `cleaned_text` is null. Tap row → detail modal.
- **Detail modal** (`hud-panel`, same pattern as TaskForm): full cleaned text in an editable textarea (or raw if no cleaned), toggle "show original dictation" revealing `raw_transcript` read-only (raw is never editable — it's the source of truth), editable tags (comma-separated input), **Clean again** button when `cleaned_text` is null (calls `cleanJournal`, fills the textarea), **Save** (`updateEntry`), **Delete** with confirm.
- Empty state: "No entries yet."

- [ ] **Step 1: Implement `useJournal.ts`** (code above).
- [ ] **Step 2: Implement `JournalView.tsx`** per contract.
- [ ] **Step 3: `npm run build` + preview check** (composer failure path will show the amber degradation until credits exist — that's correct behavior, verify it renders).
- [ ] **Step 4: Commit** — `git commit -m "feat: journal composer, list, detail with raw/cleaned duality"`

---

### Task 7: Wire into both shells + brief streaks + verification + handoff

**Files:**
- Modify: `src/App.tsx` (mobile nav 4 tabs), `src/components/DesktopDashboard.tsx` (Habits panel left, Journal panel right), `src/components/BriefView.tsx` (streak chips row)

**Interfaces:**
- Consumes: `HabitsView` (Task 4), `JournalView` (Task 6), `useHabits` (Task 3), streak fns (Task 2).

- [ ] **Step 1: Mobile nav** — add entries to `NAV`: `{ view: "habits", label: "Habits", icon: "M13 2 3 14h9l-1 8 10-12h-9l1-8" }` (zap) and `{ view: "journal", label: "Journal", icon: "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" }` (book). `MobileShell` holds one `useHabits()` store; view switch renders `<HabitsView {...habitStore} />` / `<JournalView />`.
- [ ] **Step 2: Mobile brief streaks** — in `MobileShell` pass `habitStore` down; in `BriefView` accept optional prop `streaks: { name: string; label: string }[]` and render a "Streaks" `hud-panel` (chips: `name ▮ 12d`) between the ring panel and Overdue when non-empty. `MobileShell` computes labels: `dailyStreak(new Set(dates), today)` or `weeklyStreak(dates, today)` per habit frequency (dates = that habit's completed checkin dates), label `${n}d` / `${n}w`.
- [ ] **Step 3: Desktop** — `DesktopDashboard` adds `useHabits()`; left column gains `<Panel title="Habits">` under Overdue containing `<HabitsView {...habitStore} />` (it's panel-agnostic — pass a `bare` prop so it renders rows without its own outer hud-panel when embedded); right column gains `<Panel title="Journal">` under Next 7 Days containing `<JournalView compact />` (compact = composer + last 3 entries; full list still on… desktop has no tabs, so compact IS the journal surface — cap list at 5 with "older entries" expanding in place).
- [ ] **Step 4: Full verification pass (verify skill)** — drive live: add habits (one daily, one weekly), check off with a note, skip path, uncheck/recheck, streak chips correct on habits view + brief + desktop panel; seed past checkins via `execute_sql` to prove week-boundary streaks against the tested logic (e.g. checkins last Tue + this Tue → weekly streak 2); journal composer degradation path (no credits → amber + Save raw anyway → entry listed with `raw` chip); detail modal edit + tags; `npm run test` green; `get_logs` clean; mobile 375px + desktop 1600px.
- [ ] **Step 5: Update CLAUDE.md § Commands** (add `journal-clean` to the edge functions line), commit `chore: phase 2 wiring, brief streaks, docs`.
- [ ] **Step 6: Plain-language handoff** — what was built, how to test each "Done when" (including "retest journal cleaning after buying credits"), **then STOP. Phase 3 waits for explicit approval.**

---

## Self-Review Notes

- **Spec coverage:** tables incl. note/duration columns (T1), check-off UI + streaks + week-boundary correctness (T2/T4), streaks in daily brief (T7), optional detail one-tap-skip (T4), journal raw→cleaned both stored/viewable (T5/T6), list + detail editable after the fact (T6). "Assistant uses details when they exist" — deferred to the brief/assistant phases that consume them (Phase 9 routing); the data is captured now.
- **Type consistency:** `Habit`/`Checkin`/`Entry` names used consistently in T3/T4/T6/T7; `saveDetail(checkinId, {note, duration_minutes})` matches T4's Save handler; `HabitsView` `bare` prop defined in T7 step 3 and honored in T4's implementation.
- **Deliberate choices:** journal-clean is a pure transform (client saves under RLS) so the user previews faithfulness before persisting and can re-clean later; streaks computed client-side (pure, tested) rather than in the daily-brief function; NL habit/journal commands deferred to Phase 9 per spec.
