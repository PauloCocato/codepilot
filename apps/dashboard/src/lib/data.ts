import { createServerClient, isSupabaseConfigured } from "./supabase";
import { MOCK_RUNS, MOCK_STATS } from "./mock-data";
import type { Run, RunStep } from "./mock-data";

// ── Step label mapping ──────────────────────────────────────────────────

const STEP_LABELS: Readonly<Record<string, string>> = {
  parse: "Parse Issue",
  clone: "Clone Repository",
  index: "Index Codebase",
  search: "Search Context",
  plan: "Plan Solution",
  generate: "Generate Patch",
  test: "Run Tests",
  critic: "Critic Review",
  submit: "Submit PR",
};

function stepLabel(name: string): string {
  return STEP_LABELS[name] ?? name;
}

// ── Types ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly failedRuns: number;
  readonly totalCostUsd: number;
  readonly activeRuns: number;
  readonly avgCostUsd: number;
  readonly successRate: number;
  readonly activeInstallations: number;
}

export interface PaginatedRuns {
  readonly runs: readonly Run[];
  readonly total: number;
}

export interface LlmUsageEntry {
  readonly provider: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly latencyMs: number;
  readonly purpose: string | null;
}

export interface RunDetail extends Run {
  readonly llmUsage: readonly LlmUsageEntry[];
  readonly explanation?: string;
}

// ── Database row → domain mapping helpers ───────────────────────────────

interface AgentRunRow {
  readonly id: string;
  readonly issue_number: number;
  readonly issue_url: string;
  readonly repo_owner: string;
  readonly repo_name: string;
  readonly status: string;
  readonly patch: string | null;
  readonly explanation: string | null;
  readonly pr_url: string | null;
  readonly attempts: number;
  readonly total_cost_usd: number;
  readonly total_latency_ms: number;
  readonly safety_score: number | null;
  readonly created_at: string;
}

interface StepRow {
  readonly step_name: string;
  readonly status: string;
  readonly duration_ms: number | null;
  readonly error_message: string | null;
}

interface LlmRow {
  readonly provider: string;
  readonly model: string;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cost_usd: number;
  readonly latency_ms: number;
  readonly purpose: string | null;
}

function mapStepStatus(dbStatus: string): RunStep["status"] {
  if (dbStatus === "success") return "completed";
  if (dbStatus === "failed") return "failed";
  if (dbStatus === "running") return "running";
  return "pending";
}

function mapRunStatus(dbStatus: string): Run["status"] {
  if (dbStatus === "success") return "success";
  if (dbStatus === "failed") return "failed";
  return "running";
}

function extractIssueTitle(issueUrl: string, issueNumber: number): string {
  // The database doesn't store issue_title directly.
  // We derive a short label; the real title could be fetched via GitHub API later.
  return `Issue #${issueNumber}`;
}

function rowToRun(row: AgentRunRow, steps: readonly RunStep[]): Run {
  return {
    id: row.id,
    issueNumber: row.issue_number,
    issueTitle: extractIssueTitle(row.issue_url, row.issue_number),
    issueUrl: row.issue_url,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    status: mapRunStatus(row.status),
    durationMs: row.total_latency_ms,
    costUsd: Number(row.total_cost_usd),
    attempts: row.attempts,
    prUrl: row.pr_url ?? undefined,
    patch: row.patch ?? undefined,
    safetyScore: row.safety_score ?? undefined,
    createdAt: row.created_at,
    steps,
  };
}

function rowToStep(row: StepRow): RunStep {
  return {
    name: row.step_name,
    label: stepLabel(row.step_name),
    status: mapStepStatus(row.status),
    durationMs: row.duration_ms,
    details: row.error_message ?? undefined,
  };
}

function rowToLlmUsage(row: LlmRow): LlmUsageEntry {
  return {
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: Number(row.cost_usd),
    latencyMs: row.latency_ms,
    purpose: row.purpose,
  };
}

// ── Data fetching functions ─────────────────────────────────────────────

/**
 * Fetch dashboard-level aggregate stats.
 * Falls back to mock data when Supabase is not configured.
 */
export async function fetchStats(): Promise<DashboardStats> {
  if (!isSupabaseConfigured()) {
    const rate =
      MOCK_STATS.totalRuns > 0
        ? Math.round((MOCK_STATS.successfulRuns / MOCK_STATS.totalRuns) * 100)
        : 0;
    return {
      ...MOCK_STATS,
      avgCostUsd:
        MOCK_STATS.totalRuns > 0
          ? MOCK_STATS.totalCostUsd / MOCK_STATS.totalRuns
          : 0,
      successRate: rate,
      activeInstallations: 0,
    };
  }

  const supabase = createServerClient()!;

  const [runsRes, installationsRes] = await Promise.all([
    supabase.from("agent_runs").select("status, total_cost_usd"),
    supabase.from("installations").select("id").eq("status", "active"),
  ]);

  const rows = runsRes.data ?? [];
  const totalRuns = rows.length;
  const successfulRuns = rows.filter((r) => r.status === "success").length;
  const failedRuns = rows.filter((r) => r.status === "failed").length;
  const activeRuns = rows.filter(
    (r) => r.status === "running" || r.status === "pending",
  ).length;
  const totalCostUsd = rows.reduce(
    (sum, r) => sum + Number(r.total_cost_usd),
    0,
  );
  const avgCostUsd = totalRuns > 0 ? totalCostUsd / totalRuns : 0;
  const successRate =
    totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;
  const activeInstallations = installationsRes.data?.length ?? 0;

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    totalCostUsd,
    activeRuns,
    avgCostUsd,
    successRate,
    activeInstallations,
  };
}

/**
 * Fetch paginated agent runs.
 */
export async function fetchRuns(
  limit: number = 50,
  offset: number = 0,
): Promise<PaginatedRuns> {
  if (!isSupabaseConfigured()) {
    const slice = MOCK_RUNS.slice(offset, offset + limit);
    return { runs: slice, total: MOCK_RUNS.length };
  }

  const supabase = createServerClient()!;

  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true });

  const { data: runRows, error } = await supabase
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error || !runRows) {
    return { runs: [], total: 0 };
  }

  // Fetch steps for all returned runs in one query
  const runIds = runRows.map((r) => r.id);
  const { data: stepRows } = await supabase
    .from("agent_run_steps")
    .select("run_id, step_name, status, duration_ms, error_message")
    .in("run_id", runIds)
    .order("created_at", { ascending: true });

  const stepsByRun = new Map<string, RunStep[]>();
  for (const s of stepRows ?? []) {
    const existing = stepsByRun.get(s.run_id) ?? [];
    existing.push(rowToStep(s));
    stepsByRun.set(s.run_id, existing);
  }

  const runs: Run[] = runRows.map((row) =>
    rowToRun(row as AgentRunRow, stepsByRun.get(row.id) ?? []),
  );

  return { runs, total: count ?? 0 };
}

/**
 * Fetch a single run with all steps and LLM usage.
 */
export async function fetchRunById(id: string): Promise<RunDetail | null> {
  if (!isSupabaseConfigured()) {
    const mock = MOCK_RUNS.find((r) => r.id === id);
    if (!mock) return null;
    return { ...mock, llmUsage: [] };
  }

  const supabase = createServerClient()!;

  const [runRes, stepsRes, usageRes] = await Promise.all([
    supabase.from("agent_runs").select("*").eq("id", id).single(),
    supabase
      .from("agent_run_steps")
      .select("step_name, status, duration_ms, error_message")
      .eq("run_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("llm_usage")
      .select(
        "provider, model, input_tokens, output_tokens, cost_usd, latency_ms, purpose",
      )
      .eq("run_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (runRes.error || !runRes.data) {
    return null;
  }

  const row = runRes.data as AgentRunRow;
  const steps = (stepsRes.data ?? []).map((s) => rowToStep(s as StepRow));
  const llmUsage = (usageRes.data ?? []).map((u) => rowToLlmUsage(u as LlmRow));

  return {
    ...rowToRun(row, steps),
    llmUsage,
    explanation: row.explanation ?? undefined,
  };
}

/**
 * Fetch the most recent runs for the dashboard feed.
 */
export async function fetchRecentActivity(
  limit: number = 10,
): Promise<readonly Run[]> {
  const { runs } = await fetchRuns(limit, 0);
  return runs;
}
