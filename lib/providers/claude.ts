import Anthropic from "@anthropic-ai/sdk";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

function extractJSON<T>(text: string): T | null {
  try {
    const match = text.match(/```json\s*([\s\S]*?)```/) ||
                  text.match(/(\[[\s\S]*\])/) ||
                  text.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Pass 1: Search for macro news and identify which PSX sectors are affected. */
export async function getNewsAnalysis(
  config: ProviderConfig
): Promise<NewsAnalysis> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 1500,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: `You are a Pakistan stock market analyst. Search for:
1. Latest Pakistan economic news (SBP interest rates, inflation, IMF, PMEX, rupee)
2. Global news affecting Pakistan stocks (oil prices, US-Iran tensions, China demand, Fed rates)
3. PSX-specific announcements or sector news today

After searching, return ONLY this JSON (no markdown, no preamble):
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "affectedSectors": [
    {
      "sectorName": "Oil & Gas",
      "sectorCode": "0820",
      "impact": "NEGATIVE",
      "reason": "Global oil prices down 3% on Iran deal speculation"
    }
  ],
  "globalFactors": ["Oil -3%", "USD/PKR 278 stable", "US-Iran ceasefire talks"]
}

Only include sectors with clear, specific news-driven impact. Max 5 sectors.
sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to fetch latest news.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

/** Pass 2: Given technically-filtered stocks + news context, return final 1-8 picks. */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 2000,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [
      {
        role: "user",
        content: `You are a PSX Shariah-compliant swing trading analyst.

MACRO CONTEXT (today):
${newsContext}

TECHNICALLY FILTERED STOCKS (these have already passed RSI/EMA/volume screening):
${stockContext}

Search for the latest company-specific news for the top candidates, then select the BEST 1-8 stocks to buy or watch RIGHT NOW for short-term swing trades (days to 2 weeks).

Only recommend stocks where:
- The macro/news context supports the sector
- Technicals confirm the setup
- There is a clear catalyst or reason to enter now

Return ONLY a JSON array (no markdown):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from SBP rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate by 100bps boosting banking sector",
  "catalysts": ["SBP rate cut reduces funding costs", "Volume 2.3x above average", "RSI at 38 — oversold"],
  "risks": ["Broader market weakness", "Rupee volatility"],
  "suggestedEntry": "PKR 308-312 on any dip"
}]

signal must be: BUY, STRONG_BUY, WATCH, HOLD, SELL, or AVOID
confidence: 0-100 integer
Be specific and direct. If you would not buy a stock yourself right now, say WATCH or AVOID.`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return extractJSON<AISignal[]>(text) ?? [];
}
