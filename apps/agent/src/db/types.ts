import { z } from "zod";

// ── Status enums ──────────────────────────────────────────────────────

export const AgentRunStatus = {
  Pending: "pending",
  Running: "running",
  Success: "success",
  Failed: "failed",
} as const;

export type AgentRunStatus =
  (typeof AgentRunStatus)[keyof typeof AgentRunStatus];

export const TriggeredBy = {
  Webhook: "webhook",
  Manual: "manual",
  Api: "api",
} as const;

export type TriggeredBy = (typeof TriggeredBy)[keyof typeof TriggeredBy];

export const StepName = {
  Parse: "parse",
  Clone: "clone",
  Index: "index",
  Search: "search",
  Plan: "plan",
  Generate: "generate",
  Test: "test",
  Critic: "critic",
  Submit: "submit",
} as const;

export type StepName = (typeof StepName)[keyof typeof StepName];

export const StepStatus = {
  Pending: "pending",
  Running: "running",
  Success: "success",
  Failed: "failed",
  Skipped: "skipped",
} as const;

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus];

export const LLMProvider = {
  Claude: "claude",
  OpenAI: "openai",
} as const;

export type LLMProvider = (typeof LLMProvider)[keyof typeof LLMProvider];

export const LLMPurpose = {
  Plan: "plan",
  Generate: "generate",
  Critic: "critic",
  Search: "search",
} as const;

export type LLMPurpose = (typeof LLMPurpose)[keyof typeof LLMPurpose];

// ── Row interfaces (read from DB) ────────────────────────────────────

export interface AgentRunRow {
  readonly id: string;
  readonly issue_number: number;
  readonly repo_owner: string;
  readonly repo_name: string;
  readonly issue_url: string;
  readonly status: AgentRunStatus;
  readonly triggered_by: TriggeredBy;
  readonly patch: string | null;
  readonly explanation: string | null;
  readonly pr_url: string | null;
  readonly pr_number: number | null;
  readonly attempts: number;
  readonly total_cost_usd: number;
  readonly total_latency_ms: number;
  readonly safety_score: number | null;
  readonly error_message: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AgentRunStepRow {
  readonly id: string;
  readonly run_id: string;
  readonly step_name: StepName;
  readonly status: StepStatus;
  readonly duration_ms: number | null;
  readonly cost_usd: number | null;
  readonly metadata: Record<string, unknown>;
  readonly error_message: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly created_at: string;
}

export interface LLMUsageRow {
  readonly id: string;
  readonly run_id: string | null;
  readonly provider: LLMProvider;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
  readonly latency_ms: number;
  readonly purpose: LLMPurpose | null;
  readonly created_at: string;
}

// ── Zod schemas for insert/update validation ─────────────────────────

export const insertAgentRunSchema = z.object({
  issue_number: z.number().int().positive(),
  repo_owner: z.string().min(1),
  repo_name: z.string().min(1),
  issue_url: z.string().url(),
  status: z
    .enum(["pending", "running", "success", "failed"])
    .default("pending"),
  triggered_by: z.enum(["webhook", "manual", "api"]).default("webhook"),
  patch: z.string().nullish(),
  explanation: z.string().nullish(),
  pr_url: z.string().url().nullish(),
  pr_number: z.number().int().positive().nullish(),
  attempts: z.number().int().nonnegative().default(0),
  total_cost_usd: z.number().nonnegative().default(0),
  total_latency_ms: z.number().int().nonnegative().default(0),
  safety_score: z.number().int().min(0).max(100).nullish(),
  error_message: z.string().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
});

export type InsertAgentRun = z.infer<typeof insertAgentRunSchema>;

export const updateAgentRunSchema = z.object({
  status: z.enum(["pending", "running", "success", "failed"]).optional(),
  patch: z.string().nullish(),
  explanation: z.string().nullish(),
  pr_url: z.string().url().nullish(),
  pr_number: z.number().int().positive().nullish(),
  attempts: z.number().int().nonnegative().optional(),
  total_cost_usd: z.number().nonnegative().optional(),
  total_latency_ms: z.number().int().nonnegative().optional(),
  safety_score: z.number().int().min(0).max(100).nullish(),
  error_message: z.string().nullish(),
  started_at: z.string().nullish(),
  completed_at: z.string().nullish(),
  updated_at: z.string().optional(),
});

export type UpdateAgentRun = z.infer<typeof updateAgentRunSchema>;

export const insertRunStepSchema = z.object({
  run_id: z.string().uuid(),
  step_name: z.enum([
    "parse",
    "clone",
    "index",
    "search",
    "plan",
    "generate",
    "test",
    "critic",
    "submit",
  ]),
  status: z
    .enum(["pending", "running", "success", "failed", "skipped"])
    .default("running"),
  started_at: z.string().optional(),
});

export type InsertRunStep = z.infer<typeof insertRunStepSchema>;

export const completeRunStepSchema = z.object({
  status: z.enum(["success", "failed", "skipped"]),
  duration_ms: z.number().int().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  error_message: z.string().nullish(),
  completed_at: z.string().optional(),
});

export type CompleteRunStep = z.infer<typeof completeRunStepSchema>;

export const insertLLMUsageSchema = z.object({
  run_id: z.string().uuid().nullish(),
  provider: z.enum(["claude", "openai"]),
  model: z.string().min(1),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cost_usd: z.number().nonnegative(),
  latency_ms: z.number().int().nonnegative(),
  purpose: z.enum(["plan", "generate", "critic", "search"]).nullish(),
});

export type InsertLLMUsage = z.infer<typeof insertLLMUsageSchema>;

// ── Installation & Usage row interfaces ───────────────────────────────

export const InstallationStatus = {
  Active: "active",
  Deleted: "deleted",
  Suspended: "suspended",
} as const;

export type InstallationStatus =
  (typeof InstallationStatus)[keyof typeof InstallationStatus];

export const UsageRecordStatus = {
  Queued: "queued",
  Running: "running",
  Success: "success",
  Failed: "failed",
} as const;

export type UsageRecordStatus =
  (typeof UsageRecordStatus)[keyof typeof UsageRecordStatus];

export interface InstallationRow {
  readonly id: number;
  readonly account_login: string;
  readonly account_type: string;
  readonly repository_selection: string | null;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface UsageRecordRow {
  readonly id: string;
  readonly installation_id: number;
  readonly issue_number: number;
  readonly repo_owner: string;
  readonly repo_name: string;
  readonly status: string;
  readonly cost_usd: number;
  readonly created_at: string;
}

// ── Installation & Usage Zod schemas ──────────────────────────────────

export const insertInstallationSchema = z.object({
  id: z.number().int().positive(),
  account_login: z.string().min(1),
  account_type: z.enum(["User", "Organization"]),
  repository_selection: z.enum(["all", "selected"]).nullish(),
  status: z.enum(["active", "deleted", "suspended"]).default("active"),
});

export type InsertInstallation = z.infer<typeof insertInstallationSchema>;

export const insertUsageRecordSchema = z.object({
  installation_id: z.number().int().positive(),
  issue_number: z.number().int().positive(),
  repo_owner: z.string().min(1),
  repo_name: z.string().min(1),
  status: z.enum(["queued", "running", "success", "failed"]).default("queued"),
  cost_usd: z.number().nonnegative().default(0),
});

export type InsertUsageRecord = z.infer<typeof insertUsageRecordSchema>;

export interface UsageLimitResult {
  readonly allowed: boolean;
  readonly used: number;
  readonly limit: number;
}

// ── Aggregate types ──────────────────────────────────────────────────

export interface AgentRunWithSteps extends AgentRunRow {
  readonly steps: readonly AgentRunStepRow[];
}

export interface AgentRunStats {
  readonly totalRuns: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgCostUsd: number;
  readonly totalCostUsd: number;
}

export interface ProviderStats {
  readonly provider: string;
  readonly totalCalls: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCostUsd: number;
}

// ── Result pattern ───────────────────────────────────────────────────

export type DbResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: DatabaseError };

export class DatabaseError extends Error {
  readonly code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
