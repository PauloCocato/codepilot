import { z } from 'zod';

/** Queue name constant */
export const QUEUE_NAME = 'codepilot-resolve' as const;

/** Job name constants */
export const JOB_NAMES = {
  RESOLVE_ISSUE: 'resolve-issue',
} as const;

/** Schema for ResolveIssueJob data */
export const ResolveIssueJobSchema = z.object({
  issueUrl: z.string().url(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  issueNumber: z.number().int().positive(),
  triggeredBy: z.enum(['webhook', 'manual', 'api']),
});

/** Validated job data type */
export type ResolveIssueJob = z.infer<typeof ResolveIssueJobSchema>;

/** Result stored when job completes */
export interface ResolveIssueResult {
  readonly success: boolean;
  readonly prUrl?: string;
  readonly attempts: number;
  readonly totalCostUsd: number;
  readonly totalLatencyMs: number;
  readonly safetyScore?: number;
  readonly error?: string;
}

/** Validate job data, returns Result pattern */
export function validateJobData(
  data: unknown,
): { success: true; data: ResolveIssueJob } | { success: false; error: string } {
  const result = ResolveIssueJobSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}
