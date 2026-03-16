import type { SafetyConfig, SafetyReport, SafetyRule, SafetyViolation } from './types.js';
import { DEFAULT_SAFETY_CONFIG } from './types.js';
import { allRules } from './rules/index.js';

const SEVERITY_PENALTIES: Record<SafetyViolation['severity'], number> = {
  critical: 30,
  high: 20,
  medium: 10,
  low: 5,
};

function filterRulesByConfig(
  rules: readonly SafetyRule[],
  config: SafetyConfig,
): readonly SafetyRule[] {
  return rules.filter((rule) =>
    config.enabledCategories.includes(rule.category),
  );
}

function calculateScore(violations: readonly SafetyViolation[]): number {
  const totalPenalty = violations.reduce(
    (sum, v) => sum + SEVERITY_PENALTIES[v.severity],
    0,
  );
  return Math.max(0, 100 - totalPenalty);
}

function buildSummary(
  violations: readonly SafetyViolation[],
  score: number,
  passed: boolean,
): string {
  if (violations.length === 0) {
    return 'No security violations detected. All checks passed.';
  }

  const criticalCount = violations.filter((v) => v.severity === 'critical').length;
  const highCount = violations.filter((v) => v.severity === 'high').length;
  const mediumCount = violations.filter((v) => v.severity === 'medium').length;
  const lowCount = violations.filter((v) => v.severity === 'low').length;

  const parts: string[] = [];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (highCount > 0) parts.push(`${highCount} high`);
  if (mediumCount > 0) parts.push(`${mediumCount} medium`);
  if (lowCount > 0) parts.push(`${lowCount} low`);

  const status = passed ? 'PASSED' : 'FAILED';
  return `Safety check ${status} (score: ${score}/100). Found ${violations.length} violation(s): ${parts.join(', ')}.`;
}

export function evaluatePatch(
  patch: string,
  config?: Partial<SafetyConfig>,
): SafetyReport {
  const resolvedConfig: SafetyConfig = {
    ...DEFAULT_SAFETY_CONFIG,
    ...config,
  };

  const enabledRules = filterRulesByConfig(allRules, resolvedConfig);
  const customRules = resolvedConfig.customRules
    ? filterRulesByConfig(resolvedConfig.customRules, resolvedConfig)
    : [];
  const rulesToRun = [...enabledRules, ...customRules];

  const violations: SafetyViolation[] = [];

  for (const rule of rulesToRun) {
    const violation = rule.check(patch);
    if (violation !== null) {
      violations.push(violation);
    }
  }

  const score = calculateScore(violations);
  const passed = score >= resolvedConfig.threshold;
  const summary = buildSummary(violations, score, passed);

  return {
    score,
    passed,
    threshold: resolvedConfig.threshold,
    violations,
    summary,
    checkedAt: new Date(),
    ruleCount: rulesToRun.length,
  };
}
