/** Embedding generation (to be implemented in prompt-04) */
export interface EmbeddingAdapter {
  embed(texts: readonly string[]): Promise<readonly number[][]>;
}
