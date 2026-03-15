/** Cost tracking utility */
export interface CostEntry {
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly timestamp: Date;
}

export class CostTracker {
  private readonly entries: CostEntry[] = [];

  add(entry: CostEntry): void {
    this.entries.push(entry);
  }

  get totalCostUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  get totalEntries(): number {
    return this.entries.length;
  }
}
