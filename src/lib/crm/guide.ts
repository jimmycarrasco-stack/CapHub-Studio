import "server-only";
import { z } from "zod";
import type { Ctx } from "../auth";
import { db } from "../db";
import { HttpError } from "../errors";
import { getProvider } from "../llm";
import type { AgentMessage, LlmProvider, ToolDef, ToolResult } from "../llm/types";
import { createSite, listSites } from "../repo";
import { automationInputSchema, describeStep, STEPS, TRIGGERS } from "./automation-defs";
import { createAutomation, listAutomations } from "./automations";
import { addActivity, addTag, contactName, createContact, createTask, getContact, listContacts, listLocationTags, removeTag } from "./contacts";
import { smtpStatus } from "./email";
import { createFunnel, listFunnels } from "./funnels";
import { createProduct, formatMoney, listProducts, stripeStatus } from "./payments";
import { createOpportunity, createPipeline, getPipeline, listPipelines } from "./pipelines";

/**
 * The AI Guide: a chat assistant on every page that explains CapHub Studio and can do common setup
 * work for the user through tools. It acts with the signed-in user's permissions in the current
 * sub-account. It cannot delete anything, send emails, or change billing/integration settings, and
 * automations it builds are saved switched off so the user reviews them first.
 */

export type GuideEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; label: string }
  | { type: "tool_result"; ok: boolean; label: string }
  | { type: "navigate"; href: string }
  | { type: "done"; text: string; actions: string[] }
  | { type: "error"; error: string };

const MAX_STEPS = 10;
const NAV_PREFIXES = ["/", "/contacts", "/conversations", "/pipelines", "/payments", "/automations", "/sites", "/funnels", "/apps", "/agents", "/settings", "/agency"];

const money = z.number().min(0).max(1e8);

const TOOLS = {
  search_contacts: {
    description: "Find contacts by name/email/phone/company text and/or tag. Returns up to 20 with ids.",
    schema: z.object({
      query: z.string().max(200).optional(),
      tag: z.string().max(50).optional(),
    }),
  },
  create_contact: {
    description: "Create a contact. Fails if the email already exists (then use search_contacts).",
    schema: z.object({
      first_name: z.string().max(100).optional(),
      last_name: z.string().max(100).optional(),
      email: z.string().email().max(200).optional(),
      phone: z.string().max(40).optional(),
      company: z.string().max(200).optional(),
      tags: z.array(z.string().max(50)).max(20).optional(),
    }),
  },
  update_tags: {
    description: "Add and/or remove tags on a contact. Adding a tag can start automations that use the 'Tag added' trigger.",
    schema: z.object({
      contact_id: z.string(),
      add: z.array(z.string().max(50)).max(20).optional(),
      remove: z.array(z.string().max(50)).max(20).optional(),
    }),
  },
  add_note: {
    description: "Add a note to a contact's timeline.",
    schema: z.object({
      contact_id: z.string(),
      text: z.string().min(1).max(5000),
    }),
  },
  create_task: {
    description: "Create a to-do task, optionally for a contact, with an optional due date (YYYY-MM-DD).",
    schema: z.object({
      title: z.string().min(1).max(300),
      contact_id: z.string().optional(),
      due_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  },
  create_pipeline: {
    description: "Create a sales pipeline with ordered stage names.",
    schema: z.object({
      name: z.string().min(1).max(100),
      stages: z.array(z.string().min(1).max(60)).min(2).max(15),
    }),
  },
  create_deal: {
    description: "Create a deal (opportunity) in a pipeline. Omit stage_id for the first stage. value is in major currency units (e.g. dollars).",
    schema: z.object({
      pipeline_id: z.string(),
      stage_id: z.string().optional(),
      title: z.string().min(1).max(200),
      value: money.optional(),
      contact_id: z.string().optional(),
    }),
  },
  create_product: {
    description:
      "Create a product the business sells. price is in major units (e.g. 49.99). interval 'month' or 'year' makes it a subscription. If Stripe is connected it's synced automatically and gets a payment link.",
    schema: z.object({
      name: z.string().min(1).max(120),
      description: z.string().max(2000).optional(),
      price: z.number().min(0.5).max(1e8),
      currency: z
        .string()
        .regex(/^[a-zA-Z]{3}$/)
        .optional(),
      interval: z.enum(["month", "year"]).optional(),
    }),
  },
  create_automation: {
    description:
      "Create an automation (saved switched OFF so the user can review it, then switch it on). Use real ids from the account overview for pipelines/stages/products/sites. Merge fields for email text: {{contact.first_name}}, {{contact.last_name}}, {{contact.name}}, {{contact.email}}, {{business.name}}.\n" +
      `Triggers: ${Object.entries(TRIGGERS)
        .map(([k, v]) => `${k} (${v.help})`)
        .join("; ")}.\n` +
      `Steps: ${Object.entries(STEPS)
        .map(([k, v]) => `${k} (${v.help})`)
        .join("; ")}.`,
    schema: automationInputSchema.omit({ enabled: true }),
  },
  build_site: {
    description:
      "Start building a website, landing page or funnel page with the AI site builder. Write a detailed prompt (business, audience, sections, form fields, style, and any product checkout buttons). The user is taken to the builder, where it generates.",
    schema: z.object({
      name: z.string().min(1).max(100),
      prompt: z.string().min(20).max(8000),
    }),
  },
  create_funnel: {
    description: "Create a funnel from existing site pages, in order (e.g. opt-in page → thank-you/offer page).",
    schema: z.object({
      name: z.string().min(1).max(100),
      site_ids: z.array(z.string()).min(1).max(20),
    }),
  },
  navigate: {
    description: `Open a page in the app for the user, e.g. /contacts, /contacts/<id>, /pipelines, /payments, /automations, /automations/<id>, /sites, /funnels, /apps, /agents, /settings, /settings/team.`,
    schema: z.object({ path: z.string().max(200) }),
  },
} satisfies Record<string, { description: string; schema: z.ZodType }>;

type ToolName = keyof typeof TOOLS;

export const GUIDE_TOOLS: ToolDef[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  parameters: z.toJSONSchema(t.schema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>,
}));

const LABELS: Record<ToolName, string> = {
  search_contacts: "Searching contacts",
  create_contact: "Creating contact",
  update_tags: "Updating tags",
  add_note: "Adding note",
  create_task: "Creating task",
  create_pipeline: "Creating pipeline",
  create_deal: "Creating deal",
  create_product: "Creating product",
  create_automation: "Building automation",
  build_site: "Starting site builder",
  create_funnel: "Creating funnel",
  navigate: "Opening page",
};

/** Compact snapshot of the sub-account so the model can use real ids. */
export function accountOverview(ctx: Ctx) {
  const loc = ctx.location.id;
  const count = (sql: string) => (db().prepare(sql).get(loc) as { n: number }).n;
  const stripe = stripeStatus(loc);
  const lines = [
    `Sub-account: ${ctx.location.name} (time zone ${ctx.location.timezone})`,
    `User: ${ctx.user.name}, role ${ctx.role}${ctx.isAgencyAdmin ? " (agency admin)" : ""}`,
    `Contacts: ${count("SELECT COUNT(*) AS n FROM contacts WHERE location_id = ?")}. Tags in use: ${
      listLocationTags(loc)
        .slice(0, 40)
        .map((t) => `${t.tag} (${t.count})`)
        .join(", ") || "none"
    }`,
    `Stripe: ${stripe.connected ? `connected (${stripe.mode} mode${stripe.webhookConfigured ? ", webhook set" : ", webhook not set"})` : "not connected"}. Email sending: ${smtpStatus(loc).configured ? "set up" : "not set up"}.`,
    "Pipelines:",
    ...listPipelines(loc).map((p) => `- ${p.name} [id ${p.id}] stages: ${p.stages.map((s) => `${s.name} [${s.id}]`).join(", ")}`),
    "Products:",
    ...listProducts(loc).map(
      (p) => `- ${p.name} [id ${p.id}] ${formatMoney(p.price_cents, p.currency)}${p.interval ? `/${p.interval}` : ""}${p.active ? "" : " (inactive)"} — payment link /pay/${p.id}`,
    ),
    "Sites:",
    ...listSites(loc)
      .slice(0, 30)
      .map((s) => `- ${s.name} [id ${s.id}] ${s.published ? `published at /p/${s.slug}` : "draft"}`),
    "Funnels:",
    ...listFunnels(loc).map((f) => `- ${f.name} [id ${f.id}] /f/${f.slug} (${f.steps.length} steps)`),
    "Automations:",
    ...listAutomations(loc).map((a) => `- ${a.name} [id ${a.id}] ${a.enabled ? "on" : "off"}, trigger ${a.trigger.type}: ${a.steps.map(describeStep).join(" → ")}`),
  ];
  return lines.join("\n");
}

function systemPrompt(ctx: Ctx, page: string) {
  return `You are the CapHub Guide, a friendly, concise assistant inside CapHub Studio — a simple CRM for small businesses and agencies.

What the app does (sidebar sections):
- Contacts: people with tags, notes, tasks, deals, payments and email history; CSV import/export.
- Conversations: every email sent from the CRM.
- Pipelines: drag-and-drop deal boards with stages; mark deals won/lost.
- Payments: products (one-time or subscription) synced to Stripe, payment links (/pay/<id>), orders and revenue.
- Automations: trigger → steps (emails incl. AI-written, tags, deals, tasks, waits, conditions, webhooks).
- Sites & Funnels: AI site builder (describe a page, AI builds it; forms create contacts automatically; buttons can start Stripe checkout) and funnels that chain pages.
- App Builder: AI builds full-stack Next.js + Postgres apps. AI Agents: chatbots that can be embedded on sites.
- Settings: business profile, team members, Stripe and email (SMTP) connections. Agency admins also manage sub-accounts and AI provider keys.

How to help:
- Explain things in plain language, step by step, and keep replies short (a few sentences or a short list).
- When the user asks you to set something up, do it with your tools instead of describing clicks. Use real ids from the overview below. After acting, say what you did and where to find it (and use navigate if it helps).
- Before doing something big or ambiguous (several records at once, guessing at prices or email wording that will go to customers), ask one quick question first.
- You can't delete anything, send emails, or change Stripe/email/AI settings — guide the user to the right Settings page for those. Never ask for or repeat API keys or passwords.
- Automations you create are saved OFF; tell the user to review and switch them on.
- Money values you pass to tools are in major units (dollars), not cents.

The user is currently on page: ${page}

Account overview:
${accountOverview(ctx)}`;
}

async function runTool(ctx: Ctx, name: string, rawInput: Record<string, unknown> | null, emit: (e: GuideEvent) => void): Promise<{ output: string; action?: string }> {
  const tool = TOOLS[name as ToolName];
  if (!tool) throw new HttpError(400, `Unknown tool ${name}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input = tool.schema.parse(rawInput ?? {}) as any;
  const loc = ctx.location.id;
  const meta = { userId: ctx.user.id };
  const ownContact = (id: string | undefined) => {
    if (!id) return null;
    const c = getContact(id);
    if (!c || c.location_id !== loc) throw new HttpError(404, `No contact with id ${id} in this sub-account`);
    return c;
  };

  switch (name as ToolName) {
    case "search_contacts": {
      const { query, tag } = input as z.infer<typeof TOOLS.search_contacts.schema>;
      const r = listContacts(loc, { q: query, tag, limit: 20 });
      if (!r.contacts.length) return { output: "No matching contacts." };
      return {
        output: `${r.total} match(es):\n${r.contacts.map((c) => `- ${contactName(c)} [id ${c.id}] ${c.email ?? ""} ${c.phone ?? ""} tags: ${c.tags.join(", ") || "none"}`).join("\n")}`,
      };
    }
    case "create_contact": {
      const i = input as z.infer<typeof TOOLS.create_contact.schema>;
      const c = createContact(loc, { ...i, source: "ai guide" }, meta);
      return {
        output: `Created contact ${contactName(c)} [id ${c.id}] — page /contacts/${c.id}`,
        action: `Created contact ${contactName(c)}`,
      };
    }
    case "update_tags": {
      const i = input as z.infer<typeof TOOLS.update_tags.schema>;
      const c = ownContact(i.contact_id)!;
      for (const t of i.add ?? []) addTag(loc, c.id, t, meta);
      for (const t of i.remove ?? []) removeTag(loc, c.id, t, meta);
      return {
        output: `Tags now: ${getContact(c.id)!.tags.join(", ") || "none"}`,
        action: `Updated tags on ${contactName(c)}`,
      };
    }
    case "add_note": {
      const i = input as z.infer<typeof TOOLS.add_note.schema>;
      const c = ownContact(i.contact_id)!;
      addActivity(loc, c.id, "note", i.text, undefined, ctx.user.id);
      return {
        output: "Note added.",
        action: `Added a note to ${contactName(c)}`,
      };
    }
    case "create_task": {
      const i = input as z.infer<typeof TOOLS.create_task.schema>;
      ownContact(i.contact_id);
      createTask(loc, {
        title: i.title,
        contactId: i.contact_id ?? null,
        dueAt: i.due_date ?? null,
      });
      return { output: "Task created.", action: `Created task “${i.title}”` };
    }
    case "create_pipeline": {
      const i = input as z.infer<typeof TOOLS.create_pipeline.schema>;
      const p = createPipeline(loc, i.name, i.stages);
      return {
        output: `Created pipeline [id ${p.id}] stages: ${p.stages.map((s) => `${s.name} [${s.id}]`).join(", ")}`,
        action: `Created pipeline “${p.name}”`,
      };
    }
    case "create_deal": {
      const i = input as z.infer<typeof TOOLS.create_deal.schema>;
      const p = getPipeline(i.pipeline_id);
      if (!p || p.location_id !== loc) throw new HttpError(404, "No such pipeline in this sub-account");
      ownContact(i.contact_id);
      const o = createOpportunity(
        loc,
        {
          pipelineId: p.id,
          stageId: i.stage_id,
          title: i.title,
          valueCents: Math.round((i.value ?? 0) * 100),
          contactId: i.contact_id ?? null,
        },
        meta,
      );
      return {
        output: `Created deal [id ${o.id}] in ${p.name}.`,
        action: `Created deal “${o.title}”`,
      };
    }
    case "create_product": {
      const i = input as z.infer<typeof TOOLS.create_product.schema>;
      const p = await createProduct(loc, {
        name: i.name,
        description: i.description,
        priceCents: Math.round(i.price * 100),
        currency: i.currency?.toLowerCase(),
        interval: i.interval ?? null,
      });
      const sync = p.stripe_price_id ? "synced to Stripe" : p.sync_error ? `not synced to Stripe: ${p.sync_error}` : "not synced (Stripe isn't connected yet)";
      return {
        output: `Created product [id ${p.id}], ${sync}. Payment link: /pay/${p.id}`,
        action: `Created product “${p.name}”`,
      };
    }
    case "create_automation": {
      const a = createAutomation(loc, { ...(input as object), enabled: false });
      return {
        output: `Created automation [id ${a.id}] (switched off). Page: /automations/${a.id}`,
        action: `Built automation “${a.name}” (off — review it)`,
      };
    }
    case "build_site": {
      const i = input as z.infer<typeof TOOLS.build_site.schema>;
      const s = createSite(i.name, loc, i.prompt);
      emit({ type: "navigate", href: `/sites/${s.id}` });
      return {
        output: `Created site [id ${s.id}]; the user is now in the builder and generation has started.`,
        action: `Started building “${s.name}”`,
      };
    }
    case "create_funnel": {
      const i = input as z.infer<typeof TOOLS.create_funnel.schema>;
      const mine = new Set(listSites(loc).map((s) => s.id));
      if (i.site_ids.some((id) => !mine.has(id))) throw new HttpError(404, "One of those sites isn't in this sub-account");
      const f = createFunnel(loc, i.name, i.site_ids);
      return {
        output: `Created funnel [id ${f.id}] at /f/${f.slug}`,
        action: `Created funnel “${f.name}”`,
      };
    }
    case "navigate": {
      const { path } = input as z.infer<typeof TOOLS.navigate.schema>;
      const clean = path.startsWith("/") && !path.startsWith("//") ? path : `/${path}`;
      if (!NAV_PREFIXES.some((p) => clean === p || clean.startsWith(p === "/" ? "/?" : `${p}/`) || clean.startsWith(`${p}?`) || clean.startsWith(`${p}#`)))
        throw new HttpError(400, "That isn't a page in the app");
      emit({ type: "navigate", href: clean });
      return { output: `Opened ${clean}.` };
    }
  }
}

export interface GuideTurn {
  role: "user" | "assistant";
  content: string;
}

/** Runs one user message through the guide, streaming events. */
export async function runGuide(ctx: Ctx, history: GuideTurn[], page: string, emit: (e: GuideEvent) => void, signal: AbortSignal, provider: LlmProvider = getProvider()) {
  const messages: AgentMessage[] = history.map((m) =>
    m.role === "user" ? { role: "user", content: m.content } : { role: "assistant", text: m.content, toolCalls: [], raw: null },
  );
  // Replayed assistant turns carry no provider-native output; providers fall back to plain text when raw is null.
  const system = systemPrompt(ctx, page);
  const actions: string[] = [];
  let text = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) return;
    const r = await provider.step({
      system,
      messages,
      tools: GUIDE_TOOLS,
      maxTokens: 4000,
      signal,
      onText: (delta) => emit({ type: "text", delta }),
    });
    messages.push({
      role: "assistant",
      text: r.text,
      toolCalls: r.toolCalls,
      raw: r.raw,
    });
    if (r.text.trim()) text += (text ? "\n\n" : "") + r.text.trim();
    if (!r.toolCalls.length) break;

    const results: ToolResult[] = [];
    for (const call of r.toolCalls) {
      const label = LABELS[call.name as ToolName] ?? call.name;
      emit({ type: "tool", label });
      try {
        const out = await runTool(ctx, call.name, call.input, emit);
        if (out.action) actions.push(out.action);
        results.push({ id: call.id, output: out.output });
        emit({ type: "tool_result", ok: true, label: out.action ?? label });
      } catch (err) {
        const msg = err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (err as Error).message;
        results.push({ id: call.id, output: `Error: ${msg}`, isError: true });
        emit({
          type: "tool_result",
          ok: false,
          label: `${label} failed: ${msg}`,
        });
      }
    }
    messages.push({ role: "tool", results });
  }
  emit({ type: "done", text, actions });
}
