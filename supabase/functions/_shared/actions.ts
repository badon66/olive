import { z } from "npm:zod@3";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSection = z.enum(["morning", "midday", "afternoon", "evening", "night", "anytime"]);

// Tasks reference user-defined categories by NAME here; the server resolves
// (or creates) the category_id at execution time.
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1),
    category_name: z.string().min(1).default("Personal"),
    due_date: isoDate.nullable().default(null),
    priority_weight: z.number().int().min(1).max(5).default(3),
    time_section: timeSection.nullable().default(null),
    duration_minutes: z.number().int().min(1).nullable().default(null),
    scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  }),
  z.object({
    type: z.literal("update_task"),
    task_id: z.string().uuid(),
    title: z.string().min(1).optional(),
    category_name: z.string().min(1).optional(),
    due_date: isoDate.nullable().optional(),
    priority_weight: z.number().int().min(1).max(5).optional(),
    time_section: timeSection.nullable().optional(),
    duration_minutes: z.number().int().min(1).nullable().optional(),
    scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  }),
  z.object({ type: z.literal("complete_task"), task_id: z.string().uuid() }),
  z.object({ type: z.literal("delete_task"), task_id: z.string().uuid() }),
  z.object({
    type: z.literal("create_category"),
    name: z.string().min(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  }),
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
  description: "Apply the user's requested task/category/memory changes and compose a short plain reply.",
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
              enum: ["create_task", "update_task", "complete_task", "delete_task", "create_category", "add_memory"],
            },
            title: { type: "string" },
            category_name: {
              type: "string",
              description: "Name of an existing category from the CATEGORIES list, or a new one being created",
            },
            due_date: { type: ["string", "null"], description: "YYYY-MM-DD or null" },
            priority_weight: { type: "integer", minimum: 1, maximum: 5 },
            time_section: {
              type: ["string", "null"],
              enum: ["morning", "midday", "afternoon", "evening", "night", "anytime", null],
            },
            duration_minutes: { type: ["integer", "null"], minimum: 1 },
            scheduled_time: { type: ["string", "null"], description: "HH:MM, only for fixed appointments/bookings" },
            task_id: { type: "string", description: "uuid of an existing task from the OPEN TASKS list" },
            name: { type: "string", description: "create_category: the new category's name" },
            color: { type: ["string", "null"], description: "create_category: hex color like #4a9eff, or null to auto-pick" },
            content: { type: "string" },
            date: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as const;
