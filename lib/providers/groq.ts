/**
 * Groq provider — OpenAI-compatible API, completely free tier.
 * Models: Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B
 * Free limits: 14,400 requests/day, 30 req/min — more than enough.
 * Get a key at: https://console.groq.com/keys
 */
import OpenAI from "openai";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

// Groq is fully OpenAI-compatible — same SDK, different base URL
const GROQ_BASE = "https://api.groq.com/openai/v1";

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

export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: GROQ_BASE });

  const resp = await client.chat.completions.create({
    model: config.model ?? "llama-3.3-70b-versatile",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are a Pakistan stock market analyst. Based on the following news headlines fetched from Pakistani news sources today, identify macro conditions and which PSX sectors are affected.

NEWS HEADLINES:
${newsText}

Return ONLY this JSON (no markdown, no preamble):
{
  "summary": "2-3 sentence macro overview of current Pakistan market conditions",
  "affectedSectors": [
    { "sectorName": "Oil & Gas", "sectorCode": "0820", "impact": "NEGATIVE", "reason": "..." }
  ],
  "globalFactors": ["Oil -3%", "USD/PKR 278"]
}

Rules:
- Only include sectors with clear, news-driven impact — max 5 sectors
- impact: POSITIVE | NEGATIVE | NEUTRAL
- sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to analyze news via Groq.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: GROQ_BASE });

  const resp = await client.chat.completions.create({
    model: config.model ?? "llama-3.3-70b-versatile",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a PSX Shariah-compliant swing trading analyst. Select the BEST 1-8 stocks for short-term swing trades (days to 2 weeks).

MACRO CONTEXT (from today's Pakistan news):
${newsContext}

TECHNICALLY FILTERED STOCKS (passed RSI/EMA/volume screening):
${stockContext}

Only recommend stocks where macro context supports the sector AND technicals confirm the setup.

Return ONLY a JSON array (no markdown):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate 100bps",
  "catalysts": ["Rate cut reduces costs", "Volume 2.3x average", "RSI oversold"],
  "risks": ["Market weakness", "Rupee risk"],
  "suggestedEntry": "PKR 308-312"
}]
signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID`,
      },
    ],
  });

  const text = resp.choices[0]?.message?.content ?? "";
  return extractJSON<AISignal[]>(text) ?? [];
}
