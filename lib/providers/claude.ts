import Anthropic from "@anthropic-ai/sdk";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

function extractJSON<T>(text: string): T | null {
  try {
    const match =
      text.match(/```json\s*([\s\S]*?)```/) ||
      text.match(/(\[[\s\S]*\])/) ||
      text.match(/(\{[\s\S]*\})/);
    if (match) return JSON.parse(match[1]);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Pass 1: Reason over pre-fetched Pakistan news headlines and
 * identify which PSX sectors are affected. No web search — free.
 */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are a Pakistan stock market analyst. Based on the following news headlines fetched from Pakistani news sources today, identify the macro conditions and which PSX sectors are affected.

NEWS HEADLINES:
${newsText}

Return ONLY this JSON (no markdown, no preamble):
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "affectedSectors": [
    {
      "sectorName": "Oil & Gas",
      "sectorCode": "0820",
      "impact": "NEGATIVE",
      "reason": "Global oil prices down 3% on demand concerns"
    }
  ],
  "globalFactors": ["Oil -3%", "USD/PKR 278 stable", "IMF tranche approved"]
}

Rules:
- Only include sectors with clear, specific news-driven impact — max 5 sectors
- impact must be: POSITIVE, NEGATIVE, or NEUTRAL
- sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829
- globalFactors: short phrases about global/macro items (oil, USD, rates, geopolitics)`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to analyze news.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

/**
 * Pass 2: Given technically-filtered stocks + news context, return final 1-8 picks.
 * No web search — AI reasons entirely over provided data.
 */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model ?? "claude-sonnet-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a PSX Shariah-compliant swing trading analyst. Select the BEST 1-8 stocks from the list below for short-term swing trades (days to 2 weeks).

MACRO CONTEXT (from today's Pakistan news):
${newsContext}

TECHNICALLY FILTERED STOCKS (already passed RSI/EMA/volume screening):
${stockContext}

Only recommend stocks where:
- The macro/news context supports the sector
- Technicals confirm the setup (strong RSI momentum, EMA trend, volume)
- There is a clear catalyst or setup reason

Return ONLY a JSON array (no markdown, no preamble):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from SBP rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate by 100bps boosting banking sector",
  "catalysts": ["Rate cut reduces funding costs", "Volume 2.3x above average", "RSI at 38 oversold"],
  "risks": ["Broader market weakness", "Rupee volatility"],
  "suggestedEntry": "PKR 308-312 on any dip"
}]

signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID
confidence: 0-100 integer
Be direct. If you would not buy a stock right now, say WATCH or AVOID.`,
      },
    ],
  });

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("");

  return extractJSON<AISignal[]>(text) ?? [];
}
