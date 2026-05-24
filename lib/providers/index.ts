/**
 * Unified AI provider interface.
 * Swap Claude / Gemini / OpenAI by changing ProviderConfig.provider.
 * The rest of the app never imports a specific provider directly.
 */

import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";
import * as claude from "./claude";
import * as gemini from "./gemini";
import * as openai from "./openai";

export type { AISignal, NewsAnalysis, ProviderConfig };
export { DEFAULT_MODELS } from "./types";

export async function getNewsAnalysis(
  config: ProviderConfig
): Promise<NewsAnalysis> {
  switch (config.provider) {
    case "claude":
      return claude.getNewsAnalysis(config);
    case "gemini":
      return gemini.getNewsAnalysis(config);
    case "openai":
      return openai.getNewsAnalysis(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

export async function getStockSignals(
  config: ProviderConfig,
  stockContext: string,
  newsContext: string
): Promise<AISignal[]> {
  switch (config.provider) {
    case "claude":
      return claude.getStockSignals(config, stockContext, newsContext);
    case "gemini":
      return gemini.getStockSignals(config, stockContext, newsContext);
    case "openai":
      return openai.getStockSignals(config, stockContext, newsContext);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
