import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, parseBody, requireAdmin } from "@/lib/http";
import { PROVIDERS } from "@/lib/llm/catalog";
import { getAiSettings, updateAiSettings } from "@/lib/settings";

const providerPatch = z
  .object({
    model: z.string().max(200).optional(),
    apiKey: z.string().max(500).nullable().optional(),
  })
  .optional();

const schema = z.object({
  activeProvider: z.enum(PROVIDERS).optional(),
  providers: z.object({ anthropic: providerPatch, openai: providerPatch }).optional(),
});

export const GET = handle(async () => {
  await requireAdmin();
  return NextResponse.json(getAiSettings());
});

export const PUT = handle(async (req: Request) => {
  await requireAdmin();
  updateAiSettings(await parseBody(req, schema));
  return NextResponse.json(getAiSettings());
});
