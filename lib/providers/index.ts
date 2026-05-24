/**
 * Unified AI provider interface.
 * Swap Claude / Gemini / OpenAI by changing ProviderConfig.provider.
 * The rest of the app never imports a specific provider directly.
 *
 * getNewsAnalysis() now accepts pre-fetched news text (from RSS feeds)
 * instead of performing its own web search — keeps the app free to use.
 */

import type { AISignal, NewsAnalysis, ProviderConfig } from "./types";
import * as claude from "./claude";
import * as gemini from "./gemini";
import * as openai from "./openai";

export type { AISignal, NewsAnalysis, ProviderConfig };
export { DEFAULT_MODELS } from "./types";

/** Pass 1: Reason over pre-fetched news text → sector signals. */
export async function getNewsAnalysis(
  config: ProviderConfig,
  newsText: string
): Promise<NewsAnalysis> {
  switch (config.provider) {
    case "claude":
      return claude.getNewsAnalysis(config, newsText);
    case "gemini":
      return gemini.getNewsAnalysis(config, newsText);
    case "openai":
      return openai.getNewsAnalysis(config, newsText);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/** Pass 2: Technical data + news context → final buy/watch picks. */
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
