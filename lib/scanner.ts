/**
 * Autonomous Two-Pass Scanner
 *
 * Pass 1 — Free news fetch + AI reasoning:
 *   RSS feeds from Dawn, Geo, Profit Pakistan are fetched for free.
 *   AI reasons over the headlines to identify which PSX sectors are affected.
 *   No web search tools → no paid quota consumed.
 *
 * Pass 2 — Stock selection:
 *   Always scans KMI-30 (30 Shariah-compliant stocks).
 *   For each news-flagged sector, expands to ALL Shariah-compliant stocks in that sector.
 *   Runs technical scoring (RSI, EMA, volume) on all candidates.
 *   Filters out weak setups (score < minScore).
 *   AI reasons over survivors → returns final 1-8 picks.
 */

import {
  getAllStocks,
  getHistory,
  getStocksBySector,
  KMI30_TICKERS,
  SECTOR_NAME_TO_CODE,
  type StockQuote,
} from "./psx";
import { scoreStock, type TechnicalScore } from "./technicals";
import {
  getNewsAnalysis,
  getStockSignals,
  type AISignal,
  type NewsAnalysis,
  type ProviderConfig,
} from "./providers";
import { fetchPakistanNews } from "./news-fetcher";

export interface ScanResult {
  timestamp: string;            // ISO string
  newsAnalysis: NewsAnalysis;
  expandedSectors: string[];    // sector names that were deep-dived
  totalScanned: number;
  passedTechnicals: number;
  signals: AISignal[];
  technicalData: TechnicalScore[]; // for display in UI
}

interface ScanOptions {
  minTechnicalScore?: number;   // default 45
  minAvgVolume?: number;        // default 200_000
  maxPicks?: number;            // default 8
  skipNewsPass?: boolean;       // for faster manual refresh
}

/** Fetch history + compute technicals for a list of symbols in parallel batches. */
async function fetchAndScore(
  symbols: string[],
  minScore: number,
  minAvgVolume: number
): Promise<TechnicalScore[]> {
  const BATCH = 6; // fetch 6 at a time to avoid rate limits
  const results: TechnicalScore[] = [];

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (symbol) => {
        const history = await getHistory(symbol);
        return scoreStock(symbol, history, minAvgVolume);
      })
    );
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value !== null) {
        results.push(r.value);
      }
    }
  }

  return results
    .filter((s) => s.compositeScore >= minScore)
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/** Build the stock context string fed to the AI in Pass 2. */
function buildStockContext(
  scores: TechnicalScore[],
  quotes: Record<string, StockQuote>
): string {
  return scores
    .slice(0, 20) // cap at 20 to keep prompt manageable
    .map((s) => {
      const q = quotes[s.symbol];
      const price = q?.currentPrice ?? s.currentPrice;
      const chg = q?.changePercent ?? 0;
      const lines = [
        `${s.symbol} — PKR ${price} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}% today)`,
        `  Technical score: ${s.compositeScore}/100 [${s.technicalSignal}]`,
        `  RSI: ${s.rsi} | EMA20: ${s.ema20} | EMA50: ${s.ema50}`,
        `  Volume: ${s.volumeRatio}x 20d avg (${(s.avgVolume20d / 1000).toFixed(0)}K avg/day)`,
        `  Crossover: ${s.crossoverSignal} | Price vs EMA20: ${s.priceVsEma20} | vs EMA50: ${s.priceVsEma50}`,
        ...s.reasons.map((r) => `  • ${r}`),
      ];
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Build news context string for Pass 2. */
function buildNewsContext(news: NewsAnalysis): string {
  const sectors = news.affectedSectors
    .map((s) => `  • ${s.sectorName} [${s.impact}]: ${s.reason}`)
    .join("\n");
  const factors = news.globalFactors.map((f) => `  • ${f}`).join("\n");
  return [
    `Summary: ${news.summary}`,
    `\nAffected sectors:\n${sectors || "  • None identified"}`,
    `\nGlobal factors:\n${factors || "  • None"}`,
  ].join("\n");
}

/** Main scanner entry point. */
export async function runFullScan(
  providerConfig: ProviderConfig,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    minTechnicalScore = 45,
    minAvgVolume = 200_000,
    maxPicks = 8,
    skipNewsPass = false,
  } = options;

  // --- Pass 1: Free RSS news fetch → AI sector analysis ---
  let newsAnalysis: NewsAnalysis = {
    summary: "News scan skipped.",
    affectedSectors: [],
    globalFactors: [],
  };

  if (!skipNewsPass) {
    // Fetch Pakistan news from free RSS feeds (Dawn, Geo, Profit Pakistan)
    const rawNews = await fetchPakistanNews();
    // AI reasons over headlines — no web search needed
    newsAnalysis = await getNewsAnalysis(providerConfig, rawNews);
  }

  // Determine sector expansion
  const expandedSectors: string[] = [];
  const sectorSymbolSets: Set<string> = new Set(KMI30_TICKERS);

  for (const affected of newsAnalysis.affectedSectors) {
    if (affected.impact === "NEUTRAL") continue;

    // Find sector code
    const code =
      affected.sectorCode ||
      SECTOR_NAME_TO_CODE[affected.sectorName.toLowerCase()] ||
      "";

    if (!code) continue;

    expandedSectors.push(affected.sectorName);

    // Fetch all Shariah-compliant stocks in this sector
    try {
      const sectorStocks = await getStocksBySector(code);
      for (const s of sectorStocks) {
        sectorSymbolSets.add(s.symbol.toUpperCase());
      }
    } catch {
      // Sector fetch failed — continue with KMI-30 only
    }
  }

  const allSymbols = Array.from(sectorSymbolSets);

  // Fetch live quotes for display (price + day change)
  let quotes: Record<string, StockQuote> = {};
  try {
    const allStocks = await getAllStocks();
    const symbolSet = new Set(allSymbols.map((s) => s.toUpperCase()));
    for (const stock of allStocks) {
      if (symbolSet.has(stock.symbol.toUpperCase())) {
        quotes[stock.symbol.toUpperCase()] = stock;
      }
    }
  } catch {
    // Live quotes unavailable — technicals still work from history
  }

  // --- Pass 2: Technical scoring ---
  const scoredStocks = await fetchAndScore(
    allSymbols,
    minTechnicalScore,
    minAvgVolume
  );

  // --- Pass 2 continued: AI signal generation ---
  const stockContext = buildStockContext(scoredStocks, quotes);
  const newsContext = buildNewsContext(newsAnalysis);

  let signals: AISignal[] = [];
  if (scoredStocks.length > 0) {
    signals = await getStockSignals(providerConfig, stockContext, newsContext);
    // Cap at maxPicks and sort by confidence
    signals = signals
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxPicks);
  }

  return {
    timestamp: new Date().toISOString(),
    newsAnalysis,
    expandedSectors,
    totalScanned: allSymbols.length,
    passedTechnicals: scoredStocks.length,
    signals,
    technicalData: scoredStocks,
  };
}

/** Lightweight news-only refresh (Pass 1 only, no stock fetch). */
export async function runNewsRefresh(
  providerConfig: ProviderConfig
): Promise<NewsAnalysis> {
  const rawNews = await fetchPakistanNews();
  return getNewsAnalysis(providerConfig, rawNews);
}
