export type SafetyCategory =
  | 'injection'
  | 'secrets'
  | 'filesystem'
  | 'network'
  | 'crypto'
  | 'dependencies'
  | 'general';

export interface SafetyRule {
  readonly id: string;
  readonly name: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly category: SafetyCategory;
  readonly check: (patch: string, context?: string) => SafetyViolation | null;
}

export interface SafetyViolation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: SafetyRule['severity'];
  readonly category: SafetyCategory;
  readonly description: string;
  readonly line?: number;
  readonly file?: string;
  readonly suggestion?: string;
}

export interface SafetyReport {
  readonly score: number;
  readonly passed: boolean;
  readonly threshold: number;
  readonly violations: readonly SafetyViolation[];
  readonly summary: string;
  readonly checkedAt: Date;
  readonly ruleCount: number;
}

export interface SafetyConfig {
  readonly threshold: number;
  readonly enabledCategories: readonly SafetyCategory[];
  readonly customRules?: readonly SafetyRule[];
}

export const DEFAULT_SAFETY_CONFIG: SafetyConfig = {
  threshold: 70,
  enabledCategories: [
    'injection',
    'secrets',
    'filesystem',
    'network',
    'crypto',
    'dependencies',
    'general',
  ],
} as const;
