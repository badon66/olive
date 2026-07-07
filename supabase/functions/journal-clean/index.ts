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
