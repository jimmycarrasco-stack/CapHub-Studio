import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { listFiles, saveFile } from "@/lib/crm/files";
import { handle, HttpError } from "@/lib/http";

export const GET = handle(async () => {
  const { location } = await requireCtx();
  return NextResponse.json(listFiles(location.id));
});

/** Upload one file (multipart field "file") to this sub-account's files library. */
export const POST = handle(async (req: Request) => {
  const { location } = await requireCtx();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Upload a file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Upload a file");
  const saved = await saveFile(location.id, file.name, file.type, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json(saved, { status: 201 });
});
