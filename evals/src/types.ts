import { z } from 'zod';

// --- Zod Schemas ---

export const EvalDifficultySchema = z.enum(['easy', 'medium', 'hard']);

export const EvalCategorySchema = z.enum(['bug', 'feature', 'refactor', 'test', 'docs']);

export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  issueNumber: z.number().int().positive(),
  issueUrl: z.string().url().or(z.string().startsWith('local:')),
  title: z.string().min(1),
  difficulty: EvalDifficultySchema,
  category: EvalCategorySchema,
  expectedFiles: z.array(z.string().min(1)).min(1),
  groundTruth: z.string().optional(),
});

export const EvalSuiteSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(EvalCaseSchema).min(1),
  createdAt: z.string().min(1),
});

export const EvalResultSchema = z.object({
  caseId: z.string().min(1),
  success: z.boolean(),
  patchGenerated: z.boolean(),
  testsPass: z.boolean(),
  filesCorrect: z.boolean(),
  attempts: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
  generatedPatch: z.string().optional(),
});

export const EvalRunnerConfigSchema = z.object({
  concurrency: z.number().int().positive().default(1),
  llmProvider: z.string().min(1).default('claude'),
  dryRun: z.boolean().default(true),
  timeout: z.number().int().positive().default(120_000),
});

// --- TypeScript Types ---

export type EvalDifficulty = z.infer<typeof EvalDifficultySchema>;

export type EvalCategory = z.infer<typeof EvalCategorySchema>;

export interface EvalCase {
  readonly id: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly issueUrl: string;
  readonly title: string;
  readonly difficulty: EvalDifficulty;
  readonly category: EvalCategory;
  readonly expectedFiles: readonly string[];
  readonly groundTruth?: string;
}

export interface EvalResult {
  readonly caseId: string;
  readonly success: boolean;
  readonly patchGenerated: boolean;
  readonly testsPass: boolean;
  readonly filesCorrect: boolean;
  readonly attempts: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly error?: string;
  readonly generatedPatch?: string;
}

export interface EvalSuite {
  readonly name: string;
  readonly description: string;
  readonly cases: readonly EvalCase[];
  readonly createdAt: string;
}

export interface EvalRunnerConfig {
  readonly concurrency: number;
  readonly llmProvider: string;
  readonly dryRun: boolean;
  readonly timeout: number;
}

export interface DifficultyStats {
  readonly total: number;
  readonly passed: number;
  readonly rate: number;
}

export interface EvalReport {
  readonly suiteName: string;
  readonly totalCases: number;
  readonly passed: number;
  readonly failed: number;
  readonly successRate: number;
  readonly totalCostUsd: number;
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
  readonly results: readonly EvalResult[];
  readonly byDifficulty: Record<string, DifficultyStats>;
  readonly byCategory: Record<string, DifficultyStats>;
}
