import { z } from "zod";

/**
 * Automation trigger + step definitions. Shared by the API (validation), the engine, the builder UI
 * and the AI Guide. Client-safe (no server imports).
 */

export const TRIGGERS = {
  contact_created: {
    label: "Contact created",
    help: "Any new contact — manual, import, form, payment or webhook.",
  },
  tag_added: {
    label: "Tag added",
    help: "A specific tag is added to a contact.",
  },
  form_submitted: {
    label: "Form submitted",
    help: "A form on one of your sites/funnels is submitted.",
  },
  opportunity_stage_changed: {
    label: "Deal enters stage",
    help: "A deal is created in, or moved to, a pipeline stage.",
  },
  opportunity_status_changed: {
    label: "Deal won / lost",
    help: "A deal is marked won or lost.",
  },
  payment_received: {
    label: "Payment received",
    help: "A Stripe payment for a product (or any product).",
  },
  webhook: {
    label: "Inbound webhook",
    help: "Another app POSTs JSON to this automation's URL (Zapier, Make, your own code).",
  },
  manual: {
    label: "Manual",
    help: "You enroll contacts yourself from the contact page.",
  },
} as const;

export type TriggerType = keyof typeof TRIGGERS;

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contact_created") }),
  z.object({
    type: z.literal("tag_added"),
    tag: z.string().trim().min(1).max(50),
  }),
  z.object({
    type: z.literal("form_submitted"),
    siteId: z.string().max(40).optional(),
  }),
  z.object({
    type: z.literal("opportunity_stage_changed"),
    pipelineId: z.string().max(40),
    stageId: z.string().max(40).optional(),
  }),
  z.object({
    type: z.literal("opportunity_status_changed"),
    pipelineId: z.string().max(40).optional(),
    status: z.enum(["won", "lost"]),
  }),
  z.object({
    type: z.literal("payment_received"),
    productId: z.string().max(40).optional(),
  }),
  z.object({ type: z.literal("webhook") }),
  z.object({ type: z.literal("manual") }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

export const STEPS = {
  send_email: {
    label: "Send email",
    help: "Email the contact. Use {{contact.first_name}} etc. Optionally let AI write it.",
  },
  notify_team: {
    label: "Notify team",
    help: "Email your team (the sub-account's email, or an address you choose).",
  },
  add_tag: { label: "Add tag", help: "Add a tag to the contact." },
  remove_tag: { label: "Remove tag", help: "Remove a tag from the contact." },
  create_opportunity: {
    label: "Create deal",
    help: "Add the contact to a pipeline stage.",
  },
  move_opportunity: {
    label: "Move deal",
    help: "Move the contact's open deal in a pipeline to a stage (creates one if missing).",
  },
  create_task: {
    label: "Create task",
    help: "Create a follow-up task for your team.",
  },
  wait: { label: "Wait", help: "Pause before the next step." },
  if_tag: {
    label: "Continue only if…",
    help: "Stop here unless the contact has (or doesn't have) a tag.",
  },
  webhook: {
    label: "Send webhook",
    help: "POST the contact and event as JSON to a URL.",
  },
} as const;

export type StepType = keyof typeof STEPS;

const tag = z.string().trim().min(1).max(50);
export const stepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_email"),
    subject: z.string().max(300).default(""),
    body: z.string().max(20_000).default(""),
    ai: z.boolean().default(false),
    aiInstructions: z.string().max(4000).default(""),
    attachments: z.array(z.string().max(40)).max(10).default([]),
  }),
  z.object({
    type: z.literal("notify_team"),
    to: z.string().max(300).default(""),
    subject: z.string().max(300),
    body: z.string().max(20_000),
  }),
  z.object({ type: z.literal("add_tag"), tag }),
  z.object({ type: z.literal("remove_tag"), tag }),
  z.object({
    type: z.literal("create_opportunity"),
    pipelineId: z.string().max(40),
    stageId: z.string().max(40).optional(),
    title: z.string().max(200).default("{{contact.name}}"),
    valueCents: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal("move_opportunity"),
    pipelineId: z.string().max(40),
    stageId: z.string().max(40),
  }),
  z.object({
    type: z.literal("create_task"),
    title: z.string().min(1).max(300),
    dueInDays: z.number().int().min(0).max(365).default(1),
  }),
  z.object({
    type: z.literal("wait"),
    amount: z.number().int().min(1).max(10_000),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  z.object({ type: z.literal("if_tag"), tag, has: z.boolean().default(true) }),
  z.object({ type: z.literal("webhook"), url: z.string().url().max(1000) }),
]);
export type Step = z.infer<typeof stepSchema>;

export const automationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  trigger: triggerSchema,
  steps: z.array(stepSchema).max(50),
});
export type AutomationInput = z.infer<typeof automationInputSchema>;

export function waitMs(step: Extract<Step, { type: "wait" }>) {
  const unit = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[step.unit];
  return step.amount * unit;
}

/** Short human description of a step, used in run logs and the builder. */
export function describeStep(s: Step): string {
  switch (s.type) {
    case "send_email":
      return s.ai ? "Send AI-written email" : `Send email “${s.subject || "(no subject)"}”`;
    case "notify_team":
      return `Notify team: ${s.subject}`;
    case "add_tag":
      return `Add tag “${s.tag}”`;
    case "remove_tag":
      return `Remove tag “${s.tag}”`;
    case "create_opportunity":
      return "Create deal";
    case "move_opportunity":
      return "Move deal";
    case "create_task":
      return `Create task “${s.title}”`;
    case "wait":
      return `Wait ${s.amount} ${s.amount === 1 ? s.unit.replace(/s$/, "") : s.unit}`;
    case "if_tag":
      return `Continue only if contact ${s.has ? "has" : "doesn't have"} tag “${s.tag}”`;
    case "webhook":
      return `POST to ${s.url}`;
  }
}
