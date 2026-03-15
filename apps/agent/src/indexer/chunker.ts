/** Code chunker (to be implemented in prompt-04) */
export interface CodeChunk {
  readonly filePath: string;
  readonly content: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly language: string;
  readonly type: 'function' | 'class' | 'module' | 'config' | 'test' | 'docs';
}

export async function chunkCodebase(_repoPath: string): Promise<readonly CodeChunk[]> {
  return [];
}
