/** Safety evaluator (to be implemented in prompt-08) */
export interface SafetyReport {
  readonly score: number;
  readonly passed: boolean;
  readonly issues: readonly string[];
}
