import { useEffect, useState, type ReactNode } from "react";
import type { Reminder } from "../../hooks/useReminders";
import { agoLabel } from "../../lib/cache";
import { countdownLabel, cycleSeconds, describeRecurrence, nextFireAt, secondsUntil } from "../../lib/reminders";
import { CountdownRing } from "../CountdownRing";
import { SkeletonRows } from "../Skeleton";
import { TaskList } from "../TaskList";
import { WeeklyTasksView } from "../WeeklyTasksView";
import { UpcomingDaysPanel } from "../board/DayBlocksPanel";
import { JobsList } from "./JobsPhone";
import { usePhone, type MorePage } from "./PhoneContext";
import { IconChevron, IconJobs, IconList, IconPlus, IconSettings, IconUpcoming, IconWeekly } from "./icons";
import { daysBetween } from "../../lib/dates";

// ── Reminders ────────────────────────────────────────────────────────────────
// Each reminder: its live countdown ring, its name, and "Every 30 min · next in
// 9 min". Turned-off reminders sit at the bottom, dimmed. Tap → edit sheet.

function reminderLine(r: Reminder, now: Date): string {
  const rec = describeRecurrence(r);
  if (!r.active) return `${rec} · off`;
  const left = secondsUntil(nextFireAt(r, now), now);
  return left === null ? `${rec} · done` : `${rec} · next in ${countdownLabel(left)}`;
}

export function RemindersTab() {
  const { reminderStore, customize, openSheet } = usePhone();
  // A 1 Hz clock while this tab is on screen keeps "next in 9 min" honest;
  // the rings animate themselves without involving React.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  if (reminderStore.loading) {
    return (
      <div className="px-4 py-4">
        <SkeletonRows count={3} />
      </div>
    );
  }

  const on = reminderStore.reminders
    .filter((r) => r.active)
    .map((r) => ({ r, next: nextFireAt(r, now) }))
    .sort((a, b) => (a.next?.getTime() ?? Infinity) - (b.next?.getTime() ?? Infinity));
  const off = reminderStore.reminders.filter((r) => !r.active);
  const global = reminderStore.globallyEnabled;

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-28">
      {!global && (
        <p className="mx-3 mt-3 rounded-lg border border-amber/40 px-3 py-2.5 text-amber text-[14px]">
          Reminders are switched off — nothing fires until you turn them back on above.
        </p>
      )}
      {customize && (
        <div className="px-3 pt-3">
          <button
            onClick={() => openSheet({ kind: "reminder", reminder: null })}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg border border-signal/50 text-signal font-data text-[13px]"
          >
            <IconPlus className="w-4 h-4" /> New reminder
          </button>
        </div>
      )}
      {reminderStore.reminders.length === 0 ? (
        <p className="px-5 py-6 text-dim text-[15px]">
          No reminders yet — tap the mic and say "remind me to stretch every 30 minutes".
        </p>
      ) : (
        <ul className={`divide-y divide-signal-dim/15 mt-1 ${global ? "" : "opacity-60"}`}>
          {[...on.map((x) => x.r), ...off].map((r) => {
            const next = r.active ? nextFireAt(r, now) : null;
            return (
              <li key={r.id} className={r.active ? "" : "opacity-50"}>
                <button
                  onClick={() => openSheet({ kind: "reminder", reminder: r })}
                  className="w-full flex items-center gap-3 px-4 py-3 min-h-[64px] text-left focus-visible:outline-2 focus-visible:outline-signal"
                  aria-label={`Edit ${r.name}`}
                >
                  <CountdownRing target={next} cycle={r.active ? cycleSeconds(r, now) : null} size={44} stroke={3} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-body font-semibold text-[17px] text-hud truncate">{r.name}</span>
                    <span className="block font-data text-[12px] text-dim truncate">{reminderLine(r, now)}</span>
                  </span>
                  <IconChevron className="w-4 h-4 text-dim shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* The honest limits (BUILD_PLAN): sound only while Olive is open on
          screen, iPhone needs one tap first, closed-app alerts are Phase 8. */}
      <p className="px-5 pt-5 font-data text-[11px] leading-relaxed text-dim/70">
        Alerts ring while Olive is open on screen. On iPhone, tap anywhere once after opening so sound is allowed.
        Alerts with the app closed arrive with the Telegram bot (Phase 8).
      </p>
    </div>
  );
}

// ── Finance ──────────────────────────────────────────────────────────────────
// Phase 6 (YNAB) is not built — a clean placeholder, never sample numbers.
export function FinanceTab() {
  return (
    <div className="h-full grid place-items-center px-6 pb-24">
      <div className="text-center max-w-xs">
        <p className="font-display text-signal text-[15px] tracking-[0.22em] uppercase mb-3">Finance</p>
        <p className="font-body text-[18px] text-hud">Finance connects in a later phase.</p>
        <p className="font-data text-[12px] text-dim mt-2 leading-relaxed">
          Balance, today's spend and pace vs goal will show here once your YNAB budget is linked (Phase 6).
        </p>
      </div>
    </div>
  );
}

// ── More ─────────────────────────────────────────────────────────────────────

export const MORE_PAGES: { key: MorePage; label: string; hint: string; icon: ReactNode }[] = [
  { key: "weekly", label: "Weekly Tasks", hint: "The week's cubes", icon: <IconWeekly /> },
  { key: "upcoming", label: "Upcoming Days", hint: "Yesterday, today, tomorrow and on", icon: <IconUpcoming /> },
  { key: "jobs", label: "Active Jobs", hint: "Every job, with completed", icon: <IconJobs /> },
  { key: "tasks", label: "Tasks & Categories", hint: "All tasks, filters, categories", icon: <IconList /> },
  { key: "settings", label: "Settings", hint: "Data and app", icon: <IconSettings /> },
];

export function MoreTab({ page }: { page: MorePage | null }) {
  const { goTab } = usePhone();
  if (page) return <MorePageView page={page} />;
  return (
    <ul className="h-full overflow-y-auto pb-28 pt-2">
      {MORE_PAGES.map((p) => (
        <li key={p.key}>
          <button
            onClick={() => goTab("more", p.key)}
            className="w-full flex items-center gap-4 px-5 min-h-[64px] border-b border-panel-border/60 text-left focus-visible:outline-2 focus-visible:outline-signal"
          >
            <span className="w-10 h-10 grid place-items-center rounded-lg bg-signal/10 text-signal shrink-0">{p.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block font-body font-semibold text-[17px] text-hud">{p.label}</span>
              <span className="block font-data text-[12px] text-dim">{p.hint}</span>
            </span>
            <IconChevron className="w-4 h-4 text-dim" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function MorePageView({ page }: { page: MorePage }) {
  const { taskStore, weeklyStore, categoryStore, customize, today, openSheet, goTab, setDayOffset } = usePhone();
  if (page === "jobs") return <div className="h-full overflow-y-auto overscroll-contain"><JobsList /></div>;
  if (page === "weekly") {
    return (
      <div className="h-full overflow-y-auto overscroll-contain px-3 pt-3 pb-28">
        {customize && (
          <button
            onClick={() => openSheet({ kind: "addWeekly" })}
            className="w-full mb-3 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-lg border border-signal/50 text-signal font-data text-[13px]"
          >
            <IconPlus className="w-4 h-4" /> New weekly task
          </button>
        )}
        <WeeklyTasksView {...weeklyStore} bare stacked customize={customize} />
      </div>
    );
  }
  if (page === "upcoming") {
    return (
      <div className="h-full overflow-y-auto overscroll-contain px-3 pb-28">
        <UpcomingDaysPanel
          bare
          tasks={taskStore.tasks}
          today={today}
          // Tap a task → its sheet; tap a day → that day on the Today tab.
          onEdit={(t) => openSheet({ kind: "task", task: t, date: t.due_date ?? today })}
          onSelectDay={(date) => {
            setDayOffset(() => Math.max(-3, Math.min(7, daysBetween(today, date))));
            goTab("today");
          }}
          weeklyTasks={weeklyStore.weeklyTasks}
          checkins={weeklyStore.checkins}
          dayOverrides={weeklyStore.dayOverrides}
          categoryOf={(t) => categoryStore.byId.get(t.category_id)}
        />
      </div>
    );
  }
  if (page === "tasks") {
    return (
      <div className="h-full overflow-y-auto overscroll-contain px-3 pt-3 pb-28">
        <TaskList {...taskStore} categoryStore={categoryStore} customize={customize} filterable />
      </div>
    );
  }
  return <SettingsPage />;
}

function SettingsPage() {
  const { taskStore, weeklyStore, jobStore, reminderStore, categoryStore, now } = usePhone();
  const stamps = [taskStore.syncedAt, weeklyStore.syncedAt, jobStore.syncedAt, reminderStore.syncedAt, categoryStore.syncedAt].filter(
    (x): x is number => x !== null,
  );
  const oldest = stamps.length ? Math.min(...stamps) : null;
  const [busy, setBusy] = useState(false);
  return (
    <div className="h-full overflow-y-auto px-5 pt-5 pb-28 space-y-5">
      <p className="text-dim text-[15px]">Settings arrive in a later phase.</p>
      <div className="rounded-lg border border-panel-border p-4 space-y-3">
        <p className="font-data text-[11px] uppercase tracking-widest text-dim">Data</p>
        <p className="text-hud text-[15px]">{oldest ? `Updated ${agoLabel(oldest, now.getTime())}` : "Not loaded yet"}</p>
        <button
          className="hud-button w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await Promise.all([taskStore.refresh(), weeklyStore.refresh(), jobStore.refresh(), reminderStore.refresh(), categoryStore.refresh()]);
            setBusy(false);
          }}
        >
          {busy ? "Refreshing…" : "Refresh now"}
        </button>
      </div>
    </div>
  );
}
