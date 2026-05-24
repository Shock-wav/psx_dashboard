import { NextRequest, NextResponse } from "next/server";
import { runNewsRefresh } from "@/lib/scanner";
import type { ProviderConfig } from "@/lib/providers";

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, model } = await req.json() as ProviderConfig;
    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
    }
    const news = await runNewsRefresh({ provider, apiKey, model });
    return NextResponse.json(news);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "News fetch failed" },
      { status: 500 }
    );
  }
}
