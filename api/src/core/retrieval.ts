import type { MessageSource } from "@sitebot/shared";
import type { AiSearchNamespaceBinding } from "../env.js";

export interface RetrievedChunk {
  text: string;
  source: MessageSource;
  score: number;
}

/**
 * Dependency-injected on purpose: AI Search never runs locally (it's a
 * remote binding — see wrangler.jsonc), so it cannot be exercised in
 * automated tests. Every test that needs retrieval results supplies a
 * `StubRetriever` (test/unit/core/pipeline.test.ts) instead. Do not
 * "simplify" this back to a direct `env.AI_SEARCH.get(...)` call inside
 * pipeline.ts — that would make the pipeline untestable without live
 * Cloudflare credentials.
 */
export interface Retriever {
  retrieve(query: string, recentMessages: string[]): Promise<RetrievedChunk[]>;
}

export interface AiSearchRetrieverOptions {
  maxNumResults: number;
  matchThreshold: number;
}

export class AiSearchRetriever implements Retriever {
  constructor(
    private readonly binding: AiSearchNamespaceBinding,
    private readonly instanceName: string,
    private readonly options: AiSearchRetrieverOptions,
  ) {}

  async retrieve(query: string, recentMessages: string[]): Promise<RetrievedChunk[]> {
    const instance = this.binding.get(this.instanceName);
    // Include recent turns (not just the current message) so AI Search's query
    // rewriting can turn a follow-up like "what about mobile?" into a
    // standalone retrieval query — see docs/ARCHITECTURE.md §RAG pipeline.
    const messages = [
      ...recentMessages.slice(-2).map((content) => ({ role: "user" as const, content })),
      { role: "user" as const, content: query },
    ];

    const result = await instance.search({
      messages,
      ai_search_options: {
        retrieval: {
          max_num_results: this.options.maxNumResults,
          match_threshold: this.options.matchThreshold,
        },
        query_rewrite: {},
      },
    });

    return result.chunks.map((chunk) => ({
      text: chunk.text,
      score: chunk.score,
      source: { url: chunk.item.key },
    }));
  }
}
