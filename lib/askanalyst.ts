/**
 * AskAnalyst.com.pk API client
 * Provides fundamental data: PE, PBV, div yield, 52-week range,
 * periodic returns, and market cap for PSX-listed companies.
 *
 * All endpoints are public (no API key required).
 * Company list is cached for 24 hours; price data has no local cache
 * (callers should cache at a higher level or accept fresh-each-time).
 */

const BASE = "https://api.askanalyst.com.pk/api";
const TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Company list (ticker → numeric ID map)
// ---------------------------------------------------------------------------

interface CompanyEntry {
  id: number;
  symbol: string;
  name: string;
  sector: string;
  sector_id: number;
}

let _companyMap: Map<string, CompanyEntry> | null = null;
let _companyMapFetchedAt = 0;
const COMPANY_MAP_TTL = 24 * 60 * 60 * 1_000; // 24 h

async function getCompanyMap(): Promise<Map<string, CompanyEntry>> {
  const now = Date.now();
  if (_companyMap && now - _companyMapFetchedAt < COMPANY_MAP_TTL) {
    return _companyMap;
  }

  try {
    const res = await fetch(`${BASE}/companylistwithids`, {
      headers: { "User-Agent": "PSX-Dashboard/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return _companyMap ?? new Map();

    const list: CompanyEntry[] = await res.json();
    const map = new Map<string, CompanyEntry>();
    for (const c of list) {
      if (c.symbol) map.set(c.symbol.toUpperCase(), c);
    }
    _companyMap = map;
    _companyMapFetchedAt = now;
    return map;
  } catch {
    return _companyMap ?? new Map();
  }
}

/** Resolve a PSX ticker symbol to its askanalyst numeric company ID. */
export async function getCompanyId(symbol: string): Promise<number | null> {
  const map = await getCompanyMap();
  return map.get(symbol.toUpperCase())?.id ?? null;
}

// ---------------------------------------------------------------------------
// Fundamentals  (sharepricedatanew/{id})
// ---------------------------------------------------------------------------

export interface AskAnalystFundamentals {
  symbol: string;
  currentPrice: number;
  pe: number | null;
  pbv: number | null;
  dividendYield: number | null;   // percent
  marketCap: number | null;       // millions PKR
  shares: number | null;          // millions
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  totalReturn1M: number | null;   // percent
  totalReturn3M: number | null;
  totalReturn6M: number | null;
  totalReturn1Y: number | null;
  volume: number | null;
  sector: string;
  companyName: string;
}

function nullNum(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) || v === null || v === undefined || v === "" ? null : n;
}

/** Fetch current fundamentals for a single PSX ticker. Returns null if not found. */
export async function getAskAnalystFundamentals(
  symbol: string
): Promise<AskAnalystFundamentals | null> {
  try {
    const map = await getCompanyMap();
    const entry = map.get(symbol.toUpperCase());
    if (!entry) return null;

    const res = await fetch(`${BASE}/sharepricedatanew/${entry.id}`, {
      headers: { "User-Agent": "PSX-Dashboard/1.0" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const d = await res.json();
    const tr = d.total_return ?? {};

    return {
      symbol: symbol.toUpperCase(),
      currentPrice: nullNum(d.current) ?? 0,
      pe: nullNum(d.pe),
      pbv: nullNum(d.pbv),
      dividendYield: nullNum(d.dividend_yield),
      marketCap: nullNum(d.market_cap),
      shares: nullNum(d.shares),
      fiftyTwoWeekHigh: nullNum(d.fifty_two_week_high),
      fiftyTwoWeekLow: nullNum(d.fifty_two_week_low),
      totalReturn1M: nullNum(tr["1M"]),
      totalReturn3M: nullNum(tr["3M"]),
      totalReturn6M: nullNum(tr["6M"]),
      totalReturn1Y: nullNum(tr["1Y"]),
      volume: nullNum(d.volume),
      sector: entry.sector ?? "",
      companyName: entry.name ?? symbol,
    };
  } catch {
    return null;
  }
}

/** Fetch fundamentals for multiple tickers concurrently. */
export async function getMultipleFundamentals(
  symbols: string[]
): Promise<Map<string, AskAnalystFundamentals>> {
  const results = await Promise.allSettled(
    symbols.map((s) => getAskAnalystFundamentals(s))
  );
  const map = new Map<string, AskAnalystFundamentals>();
  for (let i = 0; i < symbols.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(symbols[i].toUpperCase(), r.value);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Helpers for building AI prompt context from fundamentals
// ---------------------------------------------------------------------------

/**
 * Format a compact one-line fundamentals summary for AI prompt injection.
 * e.g. "PE 8.2x | PBV 1.1x | Div 4.3% | 52W 62% | 1Y -12.4%"
 */
export function fundamentalsPromptLine(f: AskAnalystFundamentals): string {
  const parts: string[] = [];
  if (f.pe !== null) parts.push(`PE ${f.pe.toFixed(1)}x`);
  if (f.pbv !== null) parts.push(`PBV ${f.pbv.toFixed(1)}x`);
  if (f.dividendYield !== null && f.dividendYield > 0)
    parts.push(`Div ${f.dividendYield.toFixed(1)}%`);
  if (
    f.fiftyTwoWeekHigh !== null &&
    f.fiftyTwoWeekLow !== null &&
    f.fiftyTwoWeekHigh > f.fiftyTwoWeekLow
  ) {
    const pos = Math.round(
      ((f.currentPrice - f.fiftyTwoWeekLow) /
        (f.fiftyTwoWeekHigh - f.fiftyTwoWeekLow)) *
        100
    );
    parts.push(`52W-pos ${pos}%`);
  }
  if (f.totalReturn1Y !== null)
    parts.push(`1Y ${f.totalReturn1Y > 0 ? "+" : ""}${f.totalReturn1Y.toFixed(1)}%`);
  return parts.join(" | ");
}
