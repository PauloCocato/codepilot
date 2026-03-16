import { describe, it, expect } from 'vitest';
import { EvalCaseSchema, EvalSuiteSchema, EvalResultSchema } from './types.js';

describe('EvalCaseSchema', () => {
  it('should validate a correct eval case', () => {
    const validCase = {
      id: 'test-001',
      repo: 'local:apps/agent/tests/e2e/test-repo',
      issueNumber: 1,
      issueUrl: 'local:apps/agent/tests/e2e/test-repo#1',
      title: 'Fix divide by zero',
      difficulty: 'easy',
      category: 'bug',
      expectedFiles: ['src/math.ts'],
    };

    const result = EvalCaseSchema.safeParse(validCase);
    expect(result.success).toBe(true);
  });

  it('should reject an eval case with missing required fields', () => {
    const invalidCase = {
      id: 'test-001',
      // missing repo, issueNumber, etc.
    };

    const result = EvalCaseSchema.safeParse(invalidCase);
    expect(result.success).toBe(false);
  });

  it('should reject an eval case with invalid difficulty', () => {
    const invalidCase = {
      id: 'test-001',
      repo: 'local:test-repo',
      issueNumber: 1,
      issueUrl: 'local:test-repo#1',
      title: 'Some issue',
      difficulty: 'impossible',
      category: 'bug',
      expectedFiles: ['src/math.ts'],
    };

    const result = EvalCaseSchema.safeParse(invalidCase);
    expect(result.success).toBe(false);
  });
});

describe('EvalSuiteSchema', () => {
  it('should validate a correct eval suite', () => {
    const validSuite = {
      name: 'test-suite',
      description: 'A test suite',
      cases: [
        {
          id: 'test-001',
          repo: 'local:test-repo',
          issueNumber: 1,
          issueUrl: 'local:test-repo#1',
          title: 'Fix bug',
          difficulty: 'easy',
          category: 'bug',
          expectedFiles: ['src/file.ts'],
        },
      ],
      createdAt: '2026-03-15T00:00:00.000Z',
    };

    const result = EvalSuiteSchema.safeParse(validSuite);
    expect(result.success).toBe(true);
  });

  it('should reject a suite with empty cases array', () => {
    const invalidSuite = {
      name: 'test-suite',
      description: 'A test suite',
      cases: [],
      createdAt: '2026-03-15T00:00:00.000Z',
    };

    const result = EvalSuiteSchema.safeParse(invalidSuite);
    expect(result.success).toBe(false);
  });
});

describe('EvalResultSchema', () => {
  it('should validate a correct eval result', () => {
    const validResult = {
      caseId: 'test-001',
      success: true,
      patchGenerated: true,
      testsPass: true,
      filesCorrect: true,
      attempts: 1,
      costUsd: 0.05,
      durationMs: 5000,
    };

    const result = EvalResultSchema.safeParse(validResult);
    expect(result.success).toBe(true);
  });

  it('should accept a result with optional error field', () => {
    const resultWithError = {
      caseId: 'test-001',
      success: false,
      patchGenerated: false,
      testsPass: false,
      filesCorrect: false,
      attempts: 1,
      costUsd: 0.02,
      durationMs: 3000,
      error: 'Timeout exceeded',
    };

    const result = EvalResultSchema.safeParse(resultWithError);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe('Timeout exceeded');
    }
  });

  it('should reject a result with negative cost', () => {
    const invalidResult = {
      caseId: 'test-001',
      success: true,
      patchGenerated: true,
      testsPass: true,
      filesCorrect: true,
      attempts: 1,
      costUsd: -0.01,
      durationMs: 5000,
    };

    const result = EvalResultSchema.safeParse(invalidResult);
    expect(result.success).toBe(false);
  });
});
