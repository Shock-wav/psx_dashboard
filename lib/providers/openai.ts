import OpenAI from "openai";
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

export async function getNewsAnalysis(
  config: ProviderConfig
): Promise<NewsAnalysis> {
  const client = new OpenAI({ apiKey: config.apiKey });

  // Use Responses API with web_search_preview for current news
  const resp = await client.responses.create({
    model: config.model ?? "gpt-4o-mini",
    tools: [{ type: "web_search_preview" }],
    input: `You are a Pakistan stock market analyst. Search for latest Pakistan economic news (SBP rates, IMF, oil prices, USD/PKR) and global news affecting PSX.

Return ONLY this JSON (no markdown):
{
  "summary": "2-3 sentence macro overview",
  "affectedSectors": [
    { "sectorName": "Oil & Gas", "sectorCode": "0820", "impact": "NEGATIVE", "reason": "..." }
  ],
  "globalFactors": ["Oil -3%", "USD/PKR 278"]
}
Max 5 sectors. Codes: 0801=Auto 0804=Cement 0807=Banking 0820=Oil&Gas 0824=Power 0828=Tech 0829=Textile`,
  });

  const text = resp.output_text ?? "";
  return (
    extractJSON<NewsAnalysis>(text) ?? {
      summary: "Unable to fetch news via OpenAI.",
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
  const client = new OpenAI({ apiKey: config.apiKey });

  const resp = await client.responses.create({
    model: config.model ?? "gpt-4o-mini",
    tools: [{ type: "web_search_preview" }],
    input: `You are a PSX Shariah-compliant swing trading analyst.

MACRO CONTEXT:
${newsContext}

TECHNICALLY FILTERED STOCKS:
${stockContext}

Search for latest company-specific news for top candidates.
Select BEST 1-8 stocks for short-term swing trades (days to 2 weeks).

Return ONLY a JSON array (no markdown):
[{
  "ticker": "MEBL",
  "signal": "BUY",
  "confidence": 78,
  "reason": "Islamic bank benefits from rate cut, volume spike confirms",
  "newsHeadline": "SBP cuts rate 100bps",
  "catalysts": ["Rate cut reduces costs", "Volume 2.3x average"],
  "risks": ["Market weakness"],
  "suggestedEntry": "PKR 308-312"
}]
signal: BUY | STRONG_BUY | WATCH | HOLD | SELL | AVOID`,
  });

  const text = resp.output_text ?? "";
  return extractJSON<AISignal[]>(text) ?? [];
}
