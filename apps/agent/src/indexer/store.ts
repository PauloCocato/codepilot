/** Vector store interface (to be implemented in prompt-04) */
export interface VectorStore {
  upsert(chunks: readonly unknown[]): Promise<void>;
  search(query: string, topK?: number): Promise<readonly unknown[]>;
  delete(repoId: string): Promise<void>;
  stats(): Promise<{ totalChunks: number; totalFiles: number; languages: readonly string[] }>;
}
