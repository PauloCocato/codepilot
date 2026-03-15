import pino from 'pino';
import type {
  EvalCase,
  EvalReport,
  EvalResult,
  EvalRunnerConfig,
  EvalSuite,
  DifficultyStats,
} from './types.js';
import { EvalRunnerConfigSchema } from './types.js';
import { loadSuiteByName } from './loader.js';
import { generateReport, saveReport } from './report.js';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

/**
 * Execute a single eval case.
 * In dryRun mode, validates the case setup without calling any LLM.
 */
async function runCase(
  evalCase: EvalCase,
  config: EvalRunnerConfig,
): Promise<EvalResult> {
  const startTime = Date.now();

  logger.info(
    { caseId: evalCase.id, title: evalCase.title, dryRun: config.dryRun },
    'Starting eval case',
  );

  try {
    if (config.dryRun) {
      const durationMs = Date.now() - startTime;
      logger.info(
        { caseId: evalCase.id, durationMs },
        'Dry run completed — skipping LLM call',
      );

      return {
        caseId: evalCase.id,
        success: true,
        patchGenerated: false,
        testsPass: false,
        filesCorrect: false,
        attempts: 0,
        costUsd: 0,
        durationMs,
      };
    }

    // Real execution: call agent loop, verify tests, check files
    // This is a placeholder for the actual agent integration
    const durationMs = Date.now() - startTime;

    return {
      caseId: evalCase.id,
      success: false,
      patchGenerated: false,
      testsPass: false,
      filesCorrect: false,
      attempts: 1,
      costUsd: 0,
      durationMs,
      error: 'Real execution not yet implemented — use dryRun: true',
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      err instanceof Error ? err.message : 'Unknown error';

    logger.error(
      { caseId: evalCase.id, error: errorMessage, durationMs },
      'Eval case failed',
    );

    return {
      caseId: evalCase.id,
      success: false,
      patchGenerated: false,
      testsPass: false,
      filesCorrect: false,
      attempts: 1,
      costUsd: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Compute aggregate stats grouped by a key extractor.
 */
function computeGroupedStats(
  cases: readonly EvalCase[],
  results: readonly EvalResult[],
  keyFn: (c: EvalCase) => string,
): Record<string, DifficultyStats> {
  const resultMap = new Map(results.map((r) => [r.caseId, r]));
  const groups = new Map<string, { total: number; passed: number }>();

  for (const c of cases) {
    const key = keyFn(c);
    const group = groups.get(key) ?? { total: 0, passed: 0 };
    group.total += 1;
    const result = resultMap.get(c.id);
    if (result?.success) {
      group.passed += 1;
    }
    groups.set(key, group);
  }

  const stats: Record<string, DifficultyStats> = {};
  for (const [key, group] of groups) {
    stats[key] = {
      total: group.total,
      passed: group.passed,
      rate: group.total > 0 ? group.passed / group.total : 0,
    };
  }
  return stats;
}

/**
 * Run an entire eval suite and produce a report.
 */
export async function runEvalSuite(
  suite: EvalSuite,
  config: EvalRunnerConfig,
): Promise<EvalReport> {
  const validatedConfig = EvalRunnerConfigSchema.parse(config);

  logger.info(
    {
      suite: suite.name,
      totalCases: suite.cases.length,
      dryRun: validatedConfig.dryRun,
      concurrency: validatedConfig.concurrency,
    },
    'Starting eval suite',
  );

  const startTime = Date.now();
  const results: EvalResult[] = [];

  // Sequential execution for cost control
  for (const evalCase of suite.cases) {
    const result = await runCase(evalCase, validatedConfig);
    results.push(result);

    const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
    logger.info(
      {
        progress: `${results.length}/${suite.cases.length}`,
        caseId: evalCase.id,
        success: result.success,
        cumulativeCostUsd: totalCost.toFixed(4),
      },
      'Case completed',
    );
  }

  const totalDurationMs = Date.now() - startTime;
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;
  const totalCostUsd = results.reduce((sum, r) => sum + r.costUsd, 0);

  const report: EvalReport = {
    suiteName: suite.name,
    totalCases: results.length,
    passed,
    failed,
    successRate: results.length > 0 ? passed / results.length : 0,
    totalCostUsd,
    totalDurationMs,
    avgDurationMs:
      results.length > 0 ? totalDurationMs / results.length : 0,
    results,
    byDifficulty: computeGroupedStats(suite.cases, results, (c) => c.difficulty),
    byCategory: computeGroupedStats(suite.cases, results, (c) => c.category),
  };

  logger.info(
    {
      suite: suite.name,
      passed,
      failed,
      successRate: `${(report.successRate * 100).toFixed(1)}%`,
      totalCostUsd: totalCostUsd.toFixed(4),
      totalDurationMs,
    },
    'Eval suite completed',
  );

  return report;
}

// --- CLI entrypoint ---
async function main(): Promise<void> {
  const suiteName = process.argv[2] ?? 'codepilot-basic';
  const dryRun = !process.argv.includes('--live');
  const suitesDir = new URL('./suites', import.meta.url).pathname;

  logger.info({ suiteName, dryRun, suitesDir }, 'Loading eval suite');

  const suite = await loadSuiteByName(suiteName, suitesDir);
  const config: EvalRunnerConfig = {
    concurrency: 1,
    llmProvider: 'claude',
    dryRun,
    timeout: 120_000,
  };

  const report = await runEvalSuite(suite, config);
  const markdown = generateReport(report);

  const reportsDir = new URL('../reports', import.meta.url).pathname;
  await saveReport(report, reportsDir);

  console.log(markdown);
}

main().catch((err) => {
  logger.error(err, 'Runner failed');
  process.exit(1);
});
