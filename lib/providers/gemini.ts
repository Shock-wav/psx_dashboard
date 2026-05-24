import { GoogleGenerativeAI, type Tool } from "@google/generative-ai";
import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";

// Google Search grounding tool (type varies across SDK versions)
const GOOGLE_SEARCH_TOOL = { googleSearch: {} } as unknown as Tool;

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

export async function getNewsAnalysis(
  config: ProviderConfig
): Promise<NewsAnalysis> {
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({
    model: config.model ?? "gemini-2.0-flash",
    tools: [GOOGLE_SEARCH_TOOL],
  });

  const prompt = `You are a Pakistan stock market analyst. Search for:
1. Latest Pakistan economic news (SBP rates, inflation, IMF, PMEX, rupee)
2. Global news affecting Pakistan stocks (oil prices, US tensions, Fed rates)
3. PSX sector news today

Return ONLY this JSON (no markdown):
{
  "summary": "2-3 sentence macro overview",
  "affectedSectors": [
    { "sectorName": "Oil & Gas", "sectorCode": "0820", "impact": "NEGATIVE", "reason": "..." }
  ],
  "globalFactors": ["Oil -3%", "USD/PKR 278"]
}
Max 5 sectors. sectorCode: 0801 0804 0805 0807 0808 0809 0810 0812 0820 0821 0823 0824 0825 0826 0828 0829`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to fetch news via Gemini.",
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
  const genai = new GoogleGenerativeAI(config.apiKey);
  const model = genai.getGenerativeModel({
    model: config.model ?? "gemini-2.0-flash",
    tools: [GOOGLE_SEARCH_TOOL],
  });

  const prompt = `You are a PSX Shariah-compliant swing trading analyst.

MACRO CONTEXT:
${newsContext}

TECHNICALLY FILTERED STOCKS:
${stockContext}

Search for latest company news for the top candidates.
Select the BEST 1-8 stocks for short-term swing trades (days to 2 weeks).

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
