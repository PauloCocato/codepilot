/** LLM Router with primary/fallback (to be implemented in prompt-02) */
export type RouterMetrics = {
  readonly primarySuccessRate: number;
  readonly fallbackSuccessRate: number;
  readonly totalCalls: number;
  readonly totalCostUsd: number;
};
