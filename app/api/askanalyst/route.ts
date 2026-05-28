import { NextRequest, NextResponse } from "next/server";
import { getAskAnalystFundamentals, getMultipleFundamentals } from "@/lib/askanalyst";
import type { AskAnalystFundamentals } from "@/lib/askanalyst";

/**
 * GET /api/askanalyst?symbol=ENGRO
 *   Returns AskAnalystFundamentals for a single PSX ticker.
 *
 * GET /api/askanalyst?symbol=ENGRO,OGDC,PPL
 *   Returns { ENGRO: {...}, OGDC: {...}, PPL: {...} }  (batch — comma-separated).
 *
 * Data: PE, PBV, dividend yield, 52-week range, 1M/3M/6M/1Y returns, market cap.
 */
export async function GET(req: NextRequest) {
  const symbolParam = req.nextUrl.searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbolParam) {
    return NextResponse.json({ error: "symbol query param required" }, { status: 400 });
  }

  const symbols = symbolParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  try {
    // ── Single ticker ──────────────────────────────────────────────────────
    if (symbols.length === 1) {
      const data = await getAskAnalystFundamentals(symbols[0]);
      if (!data) {
        return NextResponse.json({ error: `No data found for ${symbols[0]}` }, { status: 404 });
      }
      return NextResponse.json(data);
    }

    // ── Batch (up to 20 tickers) ───────────────────────────────────────────
    const batch = symbols.slice(0, 20);
    const resultMap = await getMultipleFundamentals(batch);
    const obj: Record<string, AskAnalystFundamentals> = {};
    resultMap.forEach((v, k) => { obj[k] = v; });
    return NextResponse.json(obj);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch fundamentals" },
      { status: 500 }
    );
  }
}
