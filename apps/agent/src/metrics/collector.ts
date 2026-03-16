import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const registry = new Registry();

// Collect default Node.js metrics (GC, event loop, memory, etc.)
collectDefaultMetrics({ register: registry });

// --- Agent run metrics ---

export const runsTotal = new Counter({
  name: "codepilot_runs_total",
  help: "Total agent runs",
  labelNames: ["status", "triggered_by"] as const,
  registers: [registry],
});

export const runDurationSeconds = new Histogram({
  name: "codepilot_run_duration_seconds",
  help: "Agent run duration in seconds",
  buckets: [10, 30, 60, 120, 300, 600],
  registers: [registry],
});

export const runCostUsd = new Histogram({
  name: "codepilot_run_cost_usd",
  help: "Cost per agent run in USD",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0],
  registers: [registry],
});

// --- LLM metrics ---

export const llmRequestsTotal = new Counter({
  name: "codepilot_llm_requests_total",
  help: "Total LLM API requests",
  labelNames: ["provider", "model", "purpose"] as const,
  registers: [registry],
});

export const llmTokensTotal = new Counter({
  name: "codepilot_llm_tokens_total",
  help: "Total LLM tokens used",
  labelNames: ["provider", "direction"] as const,
  registers: [registry],
});

export const llmCostUsd = new Counter({
  name: "codepilot_llm_cost_usd_total",
  help: "Total LLM cost in USD",
  labelNames: ["provider"] as const,
  registers: [registry],
});

export const llmLatencySeconds = new Histogram({
  name: "codepilot_llm_latency_seconds",
  help: "LLM request latency in seconds",
  labelNames: ["provider"] as const,
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

// --- Queue metrics ---

export const queueDepth = new Gauge({
  name: "codepilot_queue_depth",
  help: "Current queue depth",
  labelNames: ["state"] as const,
  registers: [registry],
});

export const jobsProcessedTotal = new Counter({
  name: "codepilot_jobs_processed_total",
  help: "Total jobs processed by worker",
  labelNames: ["status"] as const,
  registers: [registry],
});

// --- Safety metrics ---

export const safetyScore = new Histogram({
  name: "codepilot_safety_score",
  help: "Safety evaluation scores",
  buckets: [20, 40, 60, 80, 100],
  registers: [registry],
});

export const safetyViolationsTotal = new Counter({
  name: "codepilot_safety_violations_total",
  help: "Total safety violations detected",
  labelNames: ["category"] as const,
  registers: [registry],
});

// --- Installation metrics ---

export const activeInstallations = new Gauge({
  name: "codepilot_active_installations",
  help: "Number of active GitHub App installations",
  registers: [registry],
});
