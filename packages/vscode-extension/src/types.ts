export interface HealthResponse {
  readonly status: string;
  readonly version: string;
  readonly uptime: number;
}

export interface QueueStats {
  readonly waiting: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
  readonly delayed: number;
  readonly paused: number;
}

export interface JobStatus {
  readonly id: string;
  readonly state: RunState;
  readonly progress: unknown;
  readonly data: JobData;
  readonly result: JobResult | null;
  readonly failedReason?: string;
  readonly attemptsMade: number;
  readonly createdAt: number;
  readonly finishedAt: number | undefined;
}

export interface JobData {
  readonly issueUrl: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly issueNumber: number;
  readonly triggeredBy: 'webhook' | 'manual' | 'api';
  readonly installationId: number;
}

export interface JobResult {
  readonly success: boolean;
  readonly prUrl?: string;
  readonly attempts: number;
  readonly totalCostUsd: number;
  readonly totalLatencyMs: number;
  readonly safetyScore?: number;
  readonly error?: string;
}

export interface RepoInfo {
  readonly owner: string;
  readonly repo: string;
  readonly installationId: number;
  readonly config: RepoConfig;
  readonly rateLimit: { active: number; hourlyCount: number };
}

export interface RepoConfig {
  readonly trigger_label: string;
  readonly max_cost_usd: number;
  readonly auto_merge: boolean;
  readonly excluded_paths: readonly string[];
}

export interface EnqueueRequest {
  readonly issueUrl: string;
  readonly repoOwner: string;
  readonly repoName: string;
  readonly issueNumber: number;
  readonly triggeredBy: 'api';
  readonly installationId: number;
}

export interface EnqueueResponse {
  readonly jobId: string;
}

export interface ApiError {
  readonly error: string;
}

export type RunState = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export type ApiResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };
