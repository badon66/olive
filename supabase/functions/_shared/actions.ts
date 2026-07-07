import { z } from "npm:zod@3";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const category = z.enum(["personal", "powerplay", "alberta_premium"]);

export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1),
    category: category.default("personal"),
    due_date: isoDate.nullable().default(null),
    priority_weight: z.number().int().min(1).max(5).default(3),
  }),
  z.object({
    type: z.literal("update_task"),
    task_id: z.string().uuid(),
    title: z.string().min(1).optional(),
    category: category.optional(),
    due_date: isoDate.nullable().optional(),
    priority_weight: z.number().int().min(1).max(5).optional(),
  }),
  z.object({ type: z.literal("complete_task"), task_id: z.string().uuid() }),
  z.object({ type: z.literal("delete_task"), task_id: z.string().uuid() }),
  z.object({
    type: z.literal("add_memory"),
    content: z.string().min(1),
    date: isoDate.nullable().default(null),
    tags: z.array(z.string()).default([]),
  }),
]);
export const PlanSchema = z.object({ actions: z.array(ActionSchema).max(10), reply: z.string().min(1) });
export type Plan = z.infer<typeof PlanSchema>;

// JSON Schema handed to Claude as the tool's input_schema (kept in sync with the zod above).
export const APPLY_ACTIONS_TOOL = {
  name: "apply_actions",
  description: "Apply the user's requested task/memory changes and compose a short plain reply.",
  input_schema: {
    type: "object",
    required: ["actions", "reply"],
    properties: {
      reply: {
        type: "string",
        description: "Short plain-language response. If no action fits, explain or ask.",
      },
      actions: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          required: ["type"],
          properties: {
            type: {
              type: "string",
              enum: ["create_task", "update_task", "complete_task", "delete_task", "add_memory"],
            },
            title: { type: "string" },
            category: { type: "string", enum: ["personal", "powerplay", "alberta_premium"] },
            due_date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
            priority_weight: { type: "integer", minimum: 1, maximum: 5 },
            task_id: { type: "string", description: "uuid of an existing task from the OPEN TASKS list" },
            content: { type: "string" },
            date: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;
