import { describe, it, expect } from 'vitest';
import { generateReport, generateReportJson } from './report.js';
import type { EvalReport } from './types.js';

const MOCK_REPORT: EvalReport = {
  suiteName: 'test-suite',
  totalCases: 3,
  passed: 2,
  failed: 1,
  successRate: 2 / 3,
  totalCostUsd: 0.15,
  totalDurationMs: 30_000,
  avgDurationMs: 10_000,
  results: [
    {
      caseId: 'test-001',
      success: true,
      patchGenerated: true,
      testsPass: true,
      filesCorrect: true,
      attempts: 1,
      costUsd: 0.05,
      durationMs: 10_000,
    },
    {
      caseId: 'test-002',
      success: true,
      patchGenerated: true,
      testsPass: true,
      filesCorrect: true,
      attempts: 1,
      costUsd: 0.07,
      durationMs: 12_000,
    },
    {
      caseId: 'test-003',
      success: false,
      patchGenerated: false,
      testsPass: false,
      filesCorrect: false,
      attempts: 2,
      costUsd: 0.03,
      durationMs: 8_000,
      error: 'Timeout exceeded',
    },
  ],
  byDifficulty: {
    easy: { total: 2, passed: 2, rate: 1.0 },
    medium: { total: 1, passed: 0, rate: 0.0 },
  },
  byCategory: {
    bug: { total: 1, passed: 1, rate: 1.0 },
    feature: { total: 1, passed: 1, rate: 1.0 },
    refactor: { total: 1, passed: 0, rate: 0.0 },
  },
};

describe('generateReport', () => {
  it('should generate a markdown report with all required sections', () => {
    const markdown = generateReport(MOCK_REPORT);

    expect(markdown).toContain('# Eval Report: test-suite');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('## Results by Difficulty');
    expect(markdown).toContain('## Results by Category');
    expect(markdown).toContain('## Detailed Results');
    expect(markdown).toContain('## Cost Breakdown');
  });

  it('should include correct metrics in summary', () => {
    const markdown = generateReport(MOCK_REPORT);

    expect(markdown).toContain('| Total Cases | 3 |');
    expect(markdown).toContain('| Passed | 2 |');
    expect(markdown).toContain('| Failed | 1 |');
    expect(markdown).toContain('66.7%');
    expect(markdown).toContain('$0.1500');
  });

  it('should display errors for failed cases', () => {
    const markdown = generateReport(MOCK_REPORT);

    expect(markdown).toContain('## Errors');
    expect(markdown).toContain('**test-003:** Timeout exceeded');
  });
});

describe('generateReportJson', () => {
  it('should generate valid formatted JSON', () => {
    const json = generateReportJson(MOCK_REPORT);
    const parsed = JSON.parse(json);

    expect(parsed.suiteName).toBe('test-suite');
    expect(parsed.totalCases).toBe(3);
    expect(parsed.results).toHaveLength(3);
  });
});
