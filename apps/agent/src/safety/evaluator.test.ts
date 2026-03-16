import { describe, it, expect } from 'vitest';
import { evaluatePatch } from './evaluator.js';
import type { SafetyConfig, SafetyRule } from './types.js';

describe('evaluatePatch', () => {
  it('should return score 100 for clean patch', () => {
    const patch = `const x = 1;\nconst y = 2;\nconsole.log(x + y);`;
    const report = evaluatePatch(patch);

    expect(report.score).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
    expect(report.summary).toContain('No security violations');
  });

  it('should deduct 30 points for critical violation', () => {
    const patch = `const query = "SELECT * FROM users WHERE id = " + userId;`;
    const report = evaluatePatch(patch);

    expect(report.score).toBe(70);
    expect(report.violations.length).toBeGreaterThanOrEqual(1);
    expect(report.violations[0].severity).toBe('critical');
  });

  it('should fail when score is below threshold', () => {
    // Multiple critical violations: SQL injection + hardcoded API key
    const patch = [
      `const query = "SELECT * FROM users WHERE id = " + userId;`,
      `const key = "AKIAIOSFODNN7EXAMPLE";`,
    ].join('\n');

    const report = evaluatePatch(patch, { threshold: 70 });

    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(70);
  });

  it('should respect custom threshold', () => {
    const patch = `const hash = createHash("md5").update(data).digest("hex");`;
    const report = evaluatePatch(patch, { threshold: 50 });

    // MD5 is high severity (-20 pts) => score 80, threshold 50 => pass
    expect(report.passed).toBe(true);
    expect(report.score).toBe(80);
  });

  it('should filter rules by enabled categories', () => {
    const patch = [
      `const query = "SELECT * FROM users WHERE id = " + userId;`,
      `const hash = createHash("md5").update(data).digest("hex");`,
    ].join('\n');

    const config: Partial<SafetyConfig> = {
      enabledCategories: ['crypto'],
    };
    const report = evaluatePatch(patch, config);

    // Only crypto rules should run — injection rules should be excluded
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].category).toBe('crypto');
  });

  it('should include custom rules in evaluation', () => {
    const customRule: SafetyRule = {
      id: 'CUSTOM-001',
      name: 'No console.log',
      severity: 'low',
      category: 'general',
      check(patch: string) {
        if (/console\.log/.test(patch)) {
          return {
            ruleId: 'CUSTOM-001',
            ruleName: 'No console.log',
            severity: 'low' as const,
            category: 'general' as const,
            description: 'console.log found in production code.',
          };
        }
        return null;
      },
    };

    const patch = `console.log("debug");`;
    const report = evaluatePatch(patch, { customRules: [customRule] });

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0].ruleId).toBe('CUSTOM-001');
    expect(report.score).toBe(95); // low = -5
  });

  it('should clamp score at minimum 0', () => {
    // Generate patch with many critical violations
    const patch = [
      `const query = "SELECT * FROM users WHERE id = " + userId;`,
      `const key = "AKIAIOSFODNN7EXAMPLE";`,
      `const password = "supersecret123";`,
      `-----BEGIN RSA PRIVATE KEY-----`,
      `fs.readFileSync("/etc/passwd", "utf8");`,
    ].join('\n');

    const report = evaluatePatch(patch);
    expect(report.score).toBeGreaterThanOrEqual(0);
  });

  it('should include ruleCount in report', () => {
    const patch = `const x = 1;`;
    const report = evaluatePatch(patch);

    expect(report.ruleCount).toBeGreaterThan(0);
    expect(report.checkedAt).toBeInstanceOf(Date);
    expect(report.threshold).toBe(70);
  });
});
