export type RunStatus = 'success' | 'failed' | 'running';

export type StepStatus = 'completed' | 'failed' | 'running' | 'pending';

export interface RunStep {
  readonly name: string;
  readonly label: string;
  readonly status: StepStatus;
  readonly durationMs: number | null;
  readonly details?: string;
}

export interface Run {
  readonly id: string;
  readonly issueNumber: number;
  readonly issueTitle: string;
  readonly issueUrl: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly status: RunStatus;
  readonly durationMs: number;
  readonly costUsd: number;
  readonly attempts: number;
  readonly prUrl?: string;
  readonly patch?: string;
  readonly safetyScore?: number;
  readonly createdAt: string;
  readonly steps: readonly RunStep[];
}

export interface Stats {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly totalCostUsd: number;
  readonly activeRuns: number;
}

const STEP_NAMES = [
  { name: 'parse', label: 'Parse Issue' },
  { name: 'clone', label: 'Clone Repository' },
  { name: 'index', label: 'Index Codebase' },
  { name: 'search', label: 'Search Context' },
  { name: 'plan', label: 'Plan Solution' },
  { name: 'generate', label: 'Generate Patch' },
  { name: 'test', label: 'Run Tests' },
  { name: 'critic', label: 'Critic Review' },
  { name: 'submit', label: 'Submit PR' },
] as const;

function createCompletedSteps(): readonly RunStep[] {
  return STEP_NAMES.map(({ name, label }) => ({
    name,
    label,
    status: 'completed' as const,
    durationMs: Math.floor(Math.random() * 15000) + 1000,
    details: `${label} completed successfully`,
  }));
}

function createFailedSteps(failAtIndex: number): readonly RunStep[] {
  return STEP_NAMES.map(({ name, label }, i) => {
    if (i < failAtIndex) {
      return {
        name,
        label,
        status: 'completed' as const,
        durationMs: Math.floor(Math.random() * 15000) + 1000,
        details: `${label} completed successfully`,
      };
    }
    if (i === failAtIndex) {
      return {
        name,
        label,
        status: 'failed' as const,
        durationMs: Math.floor(Math.random() * 5000) + 500,
        details: `${label} failed: unexpected error in execution`,
      };
    }
    return {
      name,
      label,
      status: 'pending' as const,
      durationMs: null,
    };
  });
}

function createRunningSteps(runningAtIndex: number): readonly RunStep[] {
  return STEP_NAMES.map(({ name, label }, i) => {
    if (i < runningAtIndex) {
      return {
        name,
        label,
        status: 'completed' as const,
        durationMs: Math.floor(Math.random() * 15000) + 1000,
        details: `${label} completed successfully`,
      };
    }
    if (i === runningAtIndex) {
      return {
        name,
        label,
        status: 'running' as const,
        durationMs: null,
        details: `${label} in progress...`,
      };
    }
    return {
      name,
      label,
      status: 'pending' as const,
      durationMs: null,
    };
  });
}

const SAMPLE_PATCH = `--- a/src/utils/parser.ts
+++ b/src/utils/parser.ts
@@ -12,7 +12,9 @@ export function parseInput(raw: string): ParsedInput {
   const trimmed = raw.trim();
-  if (!trimmed) {
-    return { valid: false, data: null };
+  if (!trimmed || trimmed.length === 0) {
+    return {
+      valid: false,
+      data: null,
+      error: 'Input cannot be empty',
+    };
   }

@@ -25,6 +27,8 @@ export function parseInput(raw: string): ParsedInput {
   try {
     const parsed = JSON.parse(trimmed);
+    if (!parsed.type) {
+      throw new Error('Missing required field: type');
+    }
     return { valid: true, data: parsed };
   } catch (err) {
-    return { valid: false, data: null };
+    return { valid: false, data: null, error: String(err) };
   }`;

export const MOCK_RUNS: readonly Run[] = [
  {
    id: 'run-001',
    issueNumber: 42,
    issueTitle: 'Fix parser crash on empty input',
    issueUrl: 'https://github.com/acme/api/issues/42',
    repoOwner: 'acme',
    repoName: 'api',
    status: 'success',
    durationMs: 47_200,
    costUsd: 0.34,
    attempts: 1,
    prUrl: 'https://github.com/acme/api/pull/43',
    patch: SAMPLE_PATCH,
    safetyScore: 95,
    createdAt: '2026-03-15T10:30:00Z',
    steps: createCompletedSteps(),
  },
  {
    id: 'run-002',
    issueNumber: 87,
    issueTitle: 'Add rate limiting to auth endpoints',
    issueUrl: 'https://github.com/acme/api/issues/87',
    repoOwner: 'acme',
    repoName: 'api',
    status: 'success',
    durationMs: 63_400,
    costUsd: 0.52,
    attempts: 2,
    prUrl: 'https://github.com/acme/api/pull/88',
    patch: SAMPLE_PATCH,
    safetyScore: 88,
    createdAt: '2026-03-15T09:15:00Z',
    steps: createCompletedSteps(),
  },
  {
    id: 'run-003',
    issueNumber: 156,
    issueTitle: 'TypeError in webhook handler',
    issueUrl: 'https://github.com/acme/web/issues/156',
    repoOwner: 'acme',
    repoName: 'web',
    status: 'failed',
    durationMs: 31_800,
    costUsd: 0.21,
    attempts: 3,
    safetyScore: 72,
    createdAt: '2026-03-15T08:00:00Z',
    steps: createFailedSteps(6),
  },
  {
    id: 'run-004',
    issueNumber: 23,
    issueTitle: 'Update user profile validation schema',
    issueUrl: 'https://github.com/acme/api/issues/23',
    repoOwner: 'acme',
    repoName: 'api',
    status: 'success',
    durationMs: 38_600,
    costUsd: 0.28,
    attempts: 1,
    prUrl: 'https://github.com/acme/api/pull/24',
    patch: SAMPLE_PATCH,
    safetyScore: 97,
    createdAt: '2026-03-14T16:45:00Z',
    steps: createCompletedSteps(),
  },
  {
    id: 'run-005',
    issueNumber: 301,
    issueTitle: 'Refactor database connection pooling',
    issueUrl: 'https://github.com/acme/api/issues/301',
    repoOwner: 'acme',
    repoName: 'api',
    status: 'running',
    durationMs: 22_100,
    costUsd: 0.15,
    attempts: 1,
    safetyScore: 90,
    createdAt: '2026-03-15T11:00:00Z',
    steps: createRunningSteps(4),
  },
  {
    id: 'run-006',
    issueNumber: 78,
    issueTitle: 'Fix CORS headers for mobile clients',
    issueUrl: 'https://github.com/acme/web/issues/78',
    repoOwner: 'acme',
    repoName: 'web',
    status: 'success',
    durationMs: 29_300,
    costUsd: 0.19,
    attempts: 1,
    prUrl: 'https://github.com/acme/web/pull/79',
    patch: SAMPLE_PATCH,
    safetyScore: 93,
    createdAt: '2026-03-14T14:20:00Z',
    steps: createCompletedSteps(),
  },
  {
    id: 'run-007',
    issueNumber: 445,
    issueTitle: 'Memory leak in event listener cleanup',
    issueUrl: 'https://github.com/acme/core/issues/445',
    repoOwner: 'acme',
    repoName: 'core',
    status: 'failed',
    durationMs: 55_200,
    costUsd: 0.41,
    attempts: 3,
    safetyScore: 65,
    createdAt: '2026-03-14T11:30:00Z',
    steps: createFailedSteps(5),
  },
  {
    id: 'run-008',
    issueNumber: 12,
    issueTitle: 'Add pagination to list endpoints',
    issueUrl: 'https://github.com/acme/api/issues/12',
    repoOwner: 'acme',
    repoName: 'api',
    status: 'success',
    durationMs: 41_700,
    costUsd: 0.31,
    attempts: 1,
    prUrl: 'https://github.com/acme/api/pull/13',
    patch: SAMPLE_PATCH,
    safetyScore: 91,
    createdAt: '2026-03-14T09:00:00Z',
    steps: createCompletedSteps(),
  },
  {
    id: 'run-009',
    issueNumber: 199,
    issueTitle: 'Upgrade Zod schemas to v4',
    issueUrl: 'https://github.com/acme/shared/issues/199',
    repoOwner: 'acme',
    repoName: 'shared',
    status: 'running',
    durationMs: 18_400,
    costUsd: 0.12,
    attempts: 1,
    createdAt: '2026-03-15T11:15:00Z',
    steps: createRunningSteps(3),
  },
  {
    id: 'run-010',
    issueNumber: 67,
    issueTitle: 'Fix date formatting in notifications',
    issueUrl: 'https://github.com/acme/web/issues/67',
    repoOwner: 'acme',
    repoName: 'web',
    status: 'success',
    durationMs: 25_600,
    costUsd: 0.17,
    attempts: 1,
    prUrl: 'https://github.com/acme/web/pull/68',
    patch: SAMPLE_PATCH,
    safetyScore: 96,
    createdAt: '2026-03-13T17:00:00Z',
    steps: createCompletedSteps(),
  },
];

export const MOCK_STATS: Stats = {
  totalRuns: 156,
  successfulRuns: 128,
  failedRuns: 26,
  totalCostUsd: 48.72,
  activeRuns: 2,
};
