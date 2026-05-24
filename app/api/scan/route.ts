import { NextRequest, NextResponse } from "next/server";
import { runFullScan, runNewsRefresh } from "@/lib/scanner";
import type { ProviderConfig } from "@/lib/providers";

// In-memory cache for the last scan result (survives across requests in same process)
let cachedScan: { result: Awaited<ReturnType<typeof runFullScan>>; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, apiKey, model, mode } = body as {
      provider: string;
      apiKey: string;
      model?: string;
      mode?: "full" | "news-only" | "cached";
    };

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "provider and apiKey are required" },
        { status: 400 }
      );
    }

    const config: ProviderConfig = {
      provider: provider as ProviderConfig["provider"],
      apiKey,
      model,
    };

    // Return cached result if fresh enough and mode allows it
    if (
      mode === "cached" &&
      cachedScan &&
      Date.now() - cachedScan.at < CACHE_TTL_MS
    ) {
      return NextResponse.json({ ...cachedScan.result, fromCache: true });
    }

    // News-only refresh (lightweight)
    if (mode === "news-only") {
      const news = await runNewsRefresh(config);
      return NextResponse.json({ newsAnalysis: news });
    }

    // Full scan
    const result = await runFullScan(config, {
      minTechnicalScore: 45,
      minAvgVolume: 200_000,
      maxPicks: 8,
    });

    cachedScan = { result, at: Date.now() };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/scan]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 }
    );
  }
}

// Scheduled cron hits GET (no body needed — uses server-side env API key if set)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // For scheduled scans, API key must be set server-side
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No server-side API key configured for scheduled scan" },
      { status: 503 }
    );
  }

  try {
    const result = await runFullScan(
      { provider: "claude", apiKey, model: "claude-sonnet-4-5" },
      { minTechnicalScore: 45, minAvgVolume: 200_000, maxPicks: 8 }
    );
    cachedScan = { result, at: Date.now() };
    return NextResponse.json({ ok: true, scannedAt: result.timestamp });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scheduled scan failed" },
      { status: 500 }
    );
  }
}
