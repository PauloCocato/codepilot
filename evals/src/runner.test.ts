import { describe, it, expect } from 'vitest';
import { runEvalSuite } from './runner.js';
import type { EvalSuite, EvalRunnerConfig } from './types.js';

const MOCK_SUITE: EvalSuite = {
  name: 'test-suite',
  description: 'Test suite for runner tests',
  cases: [
    {
      id: 'test-001',
      repo: 'local:test-repo',
      issueNumber: 1,
      issueUrl: 'local:test-repo#1',
      title: 'Fix a bug',
      difficulty: 'easy',
      category: 'bug',
      expectedFiles: ['src/file.ts'],
    },
    {
      id: 'test-002',
      repo: 'local:test-repo',
      issueNumber: 2,
      issueUrl: 'local:test-repo#2',
      title: 'Add feature',
      difficulty: 'medium',
      category: 'feature',
      expectedFiles: ['src/file.ts'],
    },
    {
      id: 'test-003',
      repo: 'local:test-repo',
      issueNumber: 3,
      issueUrl: 'local:test-repo#3',
      title: 'Refactor module',
      difficulty: 'hard',
      category: 'refactor',
      expectedFiles: ['src/file.ts', 'src/utils.ts'],
    },
  ],
  createdAt: '2026-03-15T00:00:00.000Z',
};

const DRY_RUN_CONFIG: EvalRunnerConfig = {
  concurrency: 1,
  llmProvider: 'claude',
  dryRun: true,
  timeout: 120_000,
};

describe('runEvalSuite', () => {
  it('should run all cases in dry run mode and return a complete report', async () => {
    const report = await runEvalSuite(MOCK_SUITE, DRY_RUN_CONFIG);

    expect(report.suiteName).toBe('test-suite');
    expect(report.totalCases).toBe(3);
    expect(report.results).toHaveLength(3);
  });

  it('should mark all dry run cases as success with zero cost', async () => {
    const report = await runEvalSuite(MOCK_SUITE, DRY_RUN_CONFIG);

    for (const result of report.results) {
      expect(result.success).toBe(true);
      expect(result.costUsd).toBe(0);
      expect(result.attempts).toBe(0);
      expect(result.patchGenerated).toBe(false);
    }
  });

  it('should compute correct aggregate metrics', async () => {
    const report = await runEvalSuite(MOCK_SUITE, DRY_RUN_CONFIG);

    expect(report.passed).toBe(3);
    expect(report.failed).toBe(0);
    expect(report.successRate).toBe(1);
    expect(report.totalCostUsd).toBe(0);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.avgDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('should group results by difficulty and category', async () => {
    const report = await runEvalSuite(MOCK_SUITE, DRY_RUN_CONFIG);

    // By difficulty
    expect(report.byDifficulty['easy']).toBeDefined();
    expect(report.byDifficulty['easy'].total).toBe(1);
    expect(report.byDifficulty['medium']).toBeDefined();
    expect(report.byDifficulty['medium'].total).toBe(1);
    expect(report.byDifficulty['hard']).toBeDefined();
    expect(report.byDifficulty['hard'].total).toBe(1);

    // By category
    expect(report.byCategory['bug']).toBeDefined();
    expect(report.byCategory['bug'].total).toBe(1);
    expect(report.byCategory['feature']).toBeDefined();
    expect(report.byCategory['feature'].total).toBe(1);
    expect(report.byCategory['refactor']).toBeDefined();
    expect(report.byCategory['refactor'].total).toBe(1);
  });
});
