import { serviceClient } from "./supabase.ts";

// Key resolution: Vault first (canonical — see migration 20260707000004), env
// secret as fallback. Cached for the life of the function instance.
let cachedKey: string | null = null;
async function anthropicKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const { data } = await serviceClient().rpc("get_anthropic_key");
  const key = (typeof data === "string" && data.length > 0 ? data : null) ?? Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("No Anthropic API key in Vault or env");
  cachedKey = key;
  return key;
}

export async function callClaude(opts: {
  system: string;
  user: string;
  tool: unknown;
  toolName: string;
}): Promise<unknown> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": await anthropicKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const toolUse = data.content.find((b: { type: string }) => b.type === "tool_use");
  if (!toolUse) throw new Error("No tool_use block in response");
  return toolUse.input as unknown;
}
