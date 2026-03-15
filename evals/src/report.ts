import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EvalReport, EvalResult, DifficultyStats } from './types.js';
import { loadSuiteByName } from './loader.js';
import { runEvalSuite } from './runner.js';
import type { EvalRunnerConfig } from './types.js';

/**
 * Format a duration in ms to a human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/**
 * Format a cost in USD.
 */
function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/**
 * Build a markdown table from a stats record.
 */
function buildStatsTable(
  header: string,
  stats: Record<string, DifficultyStats>,
): string {
  const lines: string[] = [];
  lines.push(`### ${header}`);
  lines.push('');
  lines.push('| Group | Total | Passed | Rate |');
  lines.push('|-------|------:|-------:|-----:|');

  const sortedKeys = Object.keys(stats).sort();
  for (const key of sortedKeys) {
    const s = stats[key];
    lines.push(
      `| ${key} | ${s.total} | ${s.passed} | ${(s.rate * 100).toFixed(1)}% |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Build the status icon for a result.
 */
function resultStatus(r: EvalResult): string {
  return r.success ? 'PASS' : 'FAIL';
}

/**
 * Generate a markdown report from eval results.
 */
export function generateReport(report: EvalReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Eval Report: ${report.suiteName}`);
  lines.push('');
  lines.push(`_Generated at ${new Date().toISOString()}_`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Total Cases | ${report.totalCases} |`);
  lines.push(`| Passed | ${report.passed} |`);
  lines.push(`| Failed | ${report.failed} |`);
  lines.push(`| Success Rate | ${(report.successRate * 100).toFixed(1)}% |`);
  lines.push(`| Total Cost | ${formatCost(report.totalCostUsd)} |`);
  lines.push(`| Total Duration | ${formatDuration(report.totalDurationMs)} |`);
  lines.push(`| Avg Duration/Case | ${formatDuration(report.avgDurationMs)} |`);
  lines.push('');

  // By Difficulty
  lines.push('## Results by Difficulty');
  lines.push('');
  lines.push(buildStatsTable('Difficulty Breakdown', report.byDifficulty));

  // By Category
  lines.push('## Results by Category');
  lines.push('');
  lines.push(buildStatsTable('Category Breakdown', report.byCategory));

  // Detailed Results
  lines.push('## Detailed Results');
  lines.push('');
  lines.push(
    '| Case ID | Status | Patch | Tests | Files | Attempts | Cost | Duration |',
  );
  lines.push(
    '|---------|--------|-------|-------|-------|:--------:|-----:|---------:|',
  );

  for (const r of report.results) {
    lines.push(
      `| ${r.caseId} | ${resultStatus(r)} | ${r.patchGenerated ? 'Yes' : 'No'} | ${r.testsPass ? 'Pass' : 'Fail'} | ${r.filesCorrect ? 'Correct' : 'Wrong'} | ${r.attempts} | ${formatCost(r.costUsd)} | ${formatDuration(r.durationMs)} |`,
    );
  }

  lines.push('');

  // Errors section (only if there are errors)
  const errors = report.results.filter((r) => r.error);
  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const r of errors) {
      lines.push(`**${r.caseId}:** ${r.error}`);
      lines.push('');
    }
  }

  // Cost Breakdown
  lines.push('## Cost Breakdown');
  lines.push('');
  lines.push('| Case ID | Cost |');
  lines.push('|---------|-----:|');
  for (const r of report.results) {
    lines.push(`| ${r.caseId} | ${formatCost(r.costUsd)} |`);
  }
  lines.push('');
  lines.push(`| **Total** | **${formatCost(report.totalCostUsd)}** |`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a formatted JSON report.
 */
export function generateReportJson(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Save a report to the reports directory with a timestamped filename.
 */
export async function saveReport(
  report: EvalReport,
  reportsDir: string,
): Promise<{ markdownPath: string; jsonPath: string }> {
  await mkdir(reportsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${report.suiteName}_${timestamp}`;

  const markdownPath = join(reportsDir, `${baseName}.md`);
  const jsonPath = join(reportsDir, `${baseName}.json`);

  await writeFile(markdownPath, generateReport(report), 'utf-8');
  await writeFile(jsonPath, generateReportJson(report), 'utf-8');

  return { markdownPath, jsonPath };
}

// --- CLI entrypoint ---
async function main(): Promise<void> {
  const suiteName = process.argv[2] ?? 'codepilot-basic';
  const suitesDir = new URL('./suites', import.meta.url).pathname;

  const suite = await loadSuiteByName(suiteName, suitesDir);
  const config: EvalRunnerConfig = {
    concurrency: 1,
    llmProvider: 'claude',
    dryRun: true,
    timeout: 120_000,
  };

  const report = await runEvalSuite(suite, config);
  const reportsDir = new URL('../reports', import.meta.url).pathname;
  const { markdownPath, jsonPath } = await saveReport(report, reportsDir);

  console.log(`Report saved to:\n  Markdown: ${markdownPath}\n  JSON: ${jsonPath}`);
}

main().catch((err) => {
  console.error('Report generation failed:', err);
  process.exit(1);
});
