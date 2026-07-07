export async function callClaude(opts: {
  system: string;
  user: string;
  tool: unknown;
  toolName: string;
}): Promise<unknown> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
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
