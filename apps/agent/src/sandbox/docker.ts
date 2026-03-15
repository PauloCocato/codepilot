/** Docker sandbox manager (to be implemented in prompt-05) */
export interface Sandbox {
  readonly id: string;
  readonly containerId: string;
  readonly status: 'running' | 'stopped' | 'error';
  readonly createdAt: Date;
  readonly repoPath: string;
}
