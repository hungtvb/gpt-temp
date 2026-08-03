import { NextRequest, NextResponse } from "next/server";
import { queryPublishedEntries } from "@/lib/cms";
import { listEntries, listModels } from "@/lib/cms";

export async function GET(request: NextRequest, { params }: { params: Promise<{ model: string }> }) {
  const { model } = await params;
  const models = await listModels();
  if (!models.some((item) => item.slug === model)) {
    return NextResponse.json({ error: { code: "MODEL_NOT_FOUND", message: `Unknown model: ${model}` } }, { status: 404 });
  }

  const locale = request.nextUrl.searchParams.get("locale") ?? undefined;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 20;
  const items = queryPublishedEntries(await listEntries(), { model, locale, limit });

  return NextResponse.json({
    data: items.map((entry) => ({ id: entry.id, locale: entry.locale, version: entry.version, publishedAt: entry.publishedAt, ...entry.data })),
    meta: { model, locale: locale ?? null, count: items.length, limit: Math.min(Math.max(limit, 1), 100) },
  });
}
