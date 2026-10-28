import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, parseBody, requireAdmin } from "@/lib/http";
import { deleteAgent, getAgent, listKnowledge, updateAgent } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  await requireAdmin();
  const { id } = await ctx.params;
  const agent = getAgent(id);
  if (!agent) throw new HttpError(404, "Agent not found");
  return agent;
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const agent = await load(ctx);
  return NextResponse.json({ ...agent, knowledge: listKnowledge(agent.id) });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
  instructions: z.string().max(20_000).optional(),
  guardrails: z.string().max(5_000).optional(),
  greeting: z.string().max(500).optional(),
  provider: z.enum(["default", "anthropic", "openai"]).optional(),
  model: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v?.trim() || null)),
  temperature: z.number().min(0).max(2).nullable().optional(),
  widget_enabled: z.boolean().optional(),
  widget_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5")
    .optional(),
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const agent = await load(ctx);
  return NextResponse.json(updateAgent(agent.id, await parseBody(req, patchSchema)));
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const agent = await load(ctx);
  deleteAgent(agent.id);
  return NextResponse.json({ ok: true });
});
