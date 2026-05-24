import { GoogleGenerativeAI } from "@google/generative-ai";
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
 * Pass 1: Reason over pre-fetched Pakistan news headlines.
 * Uses gemini-1.5-flash by default — free tier (15 RPM, 1M tokens/day).
 * No Google Search grounding = no paid quota consumed.
 */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({
    model: config.model ?? "gemini-1.5-flash",
    // No tools = no paid Google Search grounding
  });

  const prompt = `You are a Pakistan stock market analyst. Based on the following news headlines fetched from Pakistani news sources today, identify macro conditions and which PSX sectors are affected.

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
- sectorCode must be one of: 0801 0804 0805 0807 0808 0809 0810 0812 0819 0820 0821 0822 0823 0824 0825 0826 0828 0829`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to analyze news via Gemini.",
      affectedSectors: [],
      globalFactors: [],
    }
  );
}

/** Pass 2: AI reasons over provided technical data + news context. */
export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({
    model: config.model ?? "gemini-1.5-flash",
  });

  const prompt = `You are a PSX Shariah-compliant swing trading analyst. Select the BEST 1-8 stocks for short-term swing trades (days to 2 weeks).

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
signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return extractJSON<AISignal[]>(text) ?? [];
}
