import { describe, it, expect, beforeEach } from "vitest";
import {
  registry,
  runsTotal,
  runDurationSeconds,
  runCostUsd,
  llmRequestsTotal,
  llmTokensTotal,
  llmCostUsd,
  llmLatencySeconds,
  queueDepth,
  jobsProcessedTotal,
  safetyScore,
  safetyViolationsTotal,
  activeInstallations,
} from "./collector.js";

describe("Prometheus metrics collector", () => {
  beforeEach(async () => {
    registry.resetMetrics();
  });

  it("should have a registry initialized", () => {
    expect(registry).toBeDefined();
    expect(typeof registry.metrics).toBe("function");
  });

  it("should increment counters correctly", async () => {
    runsTotal.inc({ status: "success", triggered_by: "webhook" });
    runsTotal.inc({ status: "success", triggered_by: "webhook" });
    runsTotal.inc({ status: "failure", triggered_by: "api" });

    const metrics = await registry.getMetricsAsJSON();
    const runsMetric = metrics.find((m) => m.name === "codepilot_runs_total");
    expect(runsMetric).toBeDefined();
    expect(runsMetric!.type).toBe("counter");
  });

  it("should observe histogram values", async () => {
    runDurationSeconds.observe(45);
    runDurationSeconds.observe(120);
    runDurationSeconds.observe(300);

    const output = await registry.metrics();
    expect(output).toContain("codepilot_run_duration_seconds_bucket");
    expect(output).toContain("codepilot_run_duration_seconds_count 3");
  });

  it("should set gauge values", async () => {
    queueDepth.set({ state: "waiting" }, 5);
    queueDepth.set({ state: "active" }, 2);
    queueDepth.set({ state: "delayed" }, 1);

    const output = await registry.metrics();
    expect(output).toContain('codepilot_queue_depth{state="waiting"} 5');
    expect(output).toContain('codepilot_queue_depth{state="active"} 2');
    expect(output).toContain('codepilot_queue_depth{state="delayed"} 1');
  });

  it("should handle labels correctly on LLM metrics", async () => {
    llmRequestsTotal.inc({ provider: "claude", model: "opus", purpose: "plan" });
    llmTokensTotal.inc({ provider: "claude", direction: "input" }, 1500);
    llmTokensTotal.inc({ provider: "claude", direction: "output" }, 500);
    llmCostUsd.inc({ provider: "claude" }, 0.05);

    const output = await registry.metrics();
    expect(output).toContain('codepilot_llm_requests_total{provider="claude",model="opus",purpose="plan"} 1');
    expect(output).toContain('codepilot_llm_tokens_total{provider="claude",direction="input"} 1500');
    expect(output).toContain('codepilot_llm_tokens_total{provider="claude",direction="output"} 500');
    expect(output).toContain('codepilot_llm_cost_usd_total{provider="claude"} 0.05');
  });

  it("should collect default Node.js metrics", async () => {
    const output = await registry.metrics();
    expect(output).toContain("nodejs_version_info");
    expect(output).toContain("process_cpu_");
  });

  it("should return valid Prometheus format from /metrics output", async () => {
    runsTotal.inc({ status: "success", triggered_by: "webhook" });
    safetyScore.observe(85);

    const output = await registry.metrics();

    // Prometheus format: lines are either comments (# ) or metric lines
    const lines = output.split("\n").filter((l) => l.trim() !== "");
    for (const line of lines) {
      const isComment = line.startsWith("# ");
      const isMetricLine = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.test(line);
      expect(isComment || isMetricLine).toBe(true);
    }
  });

  it("should have correct content type for Prometheus", () => {
    expect(registry.contentType).toContain("text/plain");
  });

  it("should prefix all custom metric names with codepilot_", async () => {
    const metricsJson = await registry.getMetricsAsJSON();
    const customMetrics = metricsJson.filter(
      (m) => !m.name.startsWith("nodejs_") && !m.name.startsWith("process_"),
    );

    expect(customMetrics.length).toBeGreaterThan(0);
    for (const metric of customMetrics) {
      expect(metric.name).toMatch(/^codepilot_/);
    }
  });

  it("should reset metrics for testing", async () => {
    runsTotal.inc({ status: "success", triggered_by: "api" }, 10);
    activeInstallations.set(5);

    registry.resetMetrics();

    const output = await registry.metrics();
    // After reset, counter value should be 0
    expect(output).not.toContain("codepilot_runs_total{");
    // Gauge resets to 0
    expect(output).toContain("codepilot_active_installations 0");
  });

  it("should observe safety and cost histograms", async () => {
    safetyScore.observe(95);
    safetyScore.observe(40);
    runCostUsd.observe(0.12);
    llmLatencySeconds.observe({ provider: "openai" }, 2.5);
    safetyViolationsTotal.inc({ category: "injection" });
    jobsProcessedTotal.inc({ status: "completed" });

    const output = await registry.metrics();
    expect(output).toContain("codepilot_safety_score_count 2");
    expect(output).toContain("codepilot_run_cost_usd_count 1");
    expect(output).toContain('codepilot_llm_latency_seconds_count{provider="openai"} 1');
    expect(output).toContain('codepilot_safety_violations_total{category="injection"} 1');
    expect(output).toContain('codepilot_jobs_processed_total{status="completed"} 1');
  });
});
