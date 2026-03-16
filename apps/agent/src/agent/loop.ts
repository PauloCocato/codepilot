import { randomUUID } from "node:crypto";
import type { ParsedIssue, AgentResult } from "@codepilot/shared";
import { parseIssue } from "../github/issues.js";
import {
  cloneRepo,
  createBranch,
  applyPatch,
  commitAndPush,
  cleanup,
  generateBranchName,
} from "../github/repos.js";
import { createPR, commentOnIssue } from "../github/prs.js";
import { ChromaStore } from "../indexer/store.js";
import { chunkCodebase } from "../indexer/chunker.js";
import {
  generateEmbeddings,
  createEmbeddingAdapter,
} from "../indexer/embeddings.js";
import { searchForIssue } from "./searcher.js";
import { createPlan } from "./planner.js";
import { generatePatch } from "./generator.js";
import { runInSandbox } from "./runner.js";
import { reviewPatch } from "./critic.js";
import type {
  AgentConfig,
  AgentRun,
  AgentStep,
  Plan,
  PatchResult,
} from "./types.js";
import { logger } from "../utils/logger.js";
import { CostTracker } from "../utils/cost.js";

const MAX_COST_USD = 1.0;
const MAX_TEST_RETRIES = 3;
const MAX_CRITIC_RETRIES = 2;

interface IssueUrlParts {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
}

/** Parse a GitHub issue URL into its components */
function parseIssueUrl(issueUrl: string): IssueUrlParts {
  const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new AgentLoopError(`Invalid issue URL: ${issueUrl}`, "invalid_input");
  }
  return {
    owner: match[1],
    repo: match[2],
    issueNumber: parseInt(match[3], 10),
  };
}

/** Track a step execution with timing */
function createStep(
  name: string,
  status: AgentStep["status"],
  durationMs: number,
  details?: string,
): AgentStep {
  return { name, status, durationMs, details };
}

/** Main agent orchestrator: resolves a GitHub issue end-to-end */
export async function runAgent(
  issueUrl: string,
  config: AgentConfig,
): Promise<AgentRun> {
  const runId = randomUUID();
  const startedAt = new Date();
  const costTracker = new CostTracker();
  const steps: AgentStep[] = [];
  const log = logger.child({ module: "agent-loop", runId });

  log.info({ issueUrl }, "Starting agent run");

  let repoPath: string | undefined;
  let issueNumber = 0;
  let owner = "";
  let repo = "";

  try {
    // === PARSE ISSUE URL ===
    const urlParts = parseIssueUrl(issueUrl);
    owner = urlParts.owner;
    repo = urlParts.repo;
    issueNumber = urlParts.issueNumber;
    log.info({ owner, repo, issueNumber }, "Issue URL parsed");

    // === STEP 1: PARSE ISSUE ===
    const parseStart = Date.now();
    let issue: ParsedIssue;
    try {
      issue = await parseIssue(config.octokit, owner, repo, issueNumber);
      steps.push(createStep("parse", "success", Date.now() - parseStart));
      log.info(
        { step: "parse", issueNumber, durationMs: Date.now() - parseStart },
        "Issue parsed",
      );
    } catch (error) {
      steps.push(
        createStep("parse", "failed", Date.now() - parseStart, String(error)),
      );
      throw error;
    }

    // === STEP 2: CLONE REPO ===
    const cloneStart = Date.now();
    try {
      const cloneResult = await cloneRepo(owner, repo);
      repoPath = cloneResult.path;
      steps.push(createStep("clone", "success", Date.now() - cloneStart));
      log.info(
        { step: "clone", repoPath, durationMs: Date.now() - cloneStart },
        "Repository cloned",
      );
    } catch (error) {
      steps.push(
        createStep("clone", "failed", Date.now() - cloneStart, String(error)),
      );
      throw error;
    }

    // === STEP 3: INDEX CODEBASE ===
    const indexStart = Date.now();
    let store: typeof config.vectorStore;
    try {
      const chunks = await chunkCodebase(repoPath);
      const embeddingAdapter = createEmbeddingAdapter();
      const embeddingResult = await generateEmbeddings(
        chunks,
        embeddingAdapter,
      );

      store = new ChromaStore(owner, repo);
      await store.upsert(embeddingResult.chunks);

      steps.push(
        createStep(
          "index",
          "success",
          Date.now() - indexStart,
          `${chunks.length} chunks indexed`,
        ),
      );
      log.info(
        {
          step: "index",
          chunks: chunks.length,
          durationMs: Date.now() - indexStart,
        },
        "Codebase indexed",
      );
    } catch (error) {
      // Fallback to config store if indexing fails
      store = config.vectorStore;
      steps.push(
        createStep("index", "failed", Date.now() - indexStart, String(error)),
      );
      log.warn({ error }, "Indexing failed, using provided vector store");
    }

    // === STEP 4: SEARCH RELEVANT CODE ===
    const searchStart = Date.now();
    let codeContext: string;
    try {
      codeContext = await searchForIssue(issue, store);
      steps.push(
        createStep(
          "search",
          "success",
          Date.now() - searchStart,
          `${codeContext.length} chars of context`,
        ),
      );
      log.info(
        {
          step: "search",
          contextLength: codeContext.length,
          durationMs: Date.now() - searchStart,
        },
        "Relevant code found",
      );
    } catch (error) {
      codeContext = "";
      steps.push(
        createStep("search", "failed", Date.now() - searchStart, String(error)),
      );
      log.warn({ error }, "Search failed, proceeding with empty context");
    }

    // === STEP 5: CREATE PLAN ===
    const planStart = Date.now();
    let plan: Plan;
    try {
      plan = await createPlan(issue, codeContext, config.llm);
      steps.push(
        createStep("plan", "success", Date.now() - planStart, plan.summary),
      );
      log.info(
        {
          step: "plan",
          stepCount: plan.steps.length,
          durationMs: Date.now() - planStart,
        },
        "Plan created",
      );
    } catch (error) {
      steps.push(
        createStep("plan", "failed", Date.now() - planStart, String(error)),
      );
      throw error;
    }

    // Check cost budget
    if (costTracker.totalCostUsd > MAX_COST_USD) {
      throw new AgentLoopError(
        `Cost budget exceeded: $${costTracker.totalCostUsd.toFixed(4)} > $${MAX_COST_USD}`,
        "cost_exceeded",
      );
    }

    // === STEP 6-8: GENERATE → TEST → CRITIC (with retries) ===
    let finalPatch: PatchResult | undefined;
    let testAttempts = 0;
    let criticAttempts = 0;
    let previousError: string | undefined;
    let criticFeedback: string | undefined;

    for (let attempt = 0; attempt < MAX_TEST_RETRIES; attempt++) {
      testAttempts = attempt + 1;

      // Check cost budget
      if (costTracker.totalCostUsd > MAX_COST_USD) {
        throw new AgentLoopError(
          `Cost budget exceeded: $${costTracker.totalCostUsd.toFixed(4)} > $${MAX_COST_USD}`,
          "cost_exceeded",
        );
      }

      // === GENERATE PATCH ===
      const genStart = Date.now();
      let patchResult: PatchResult;
      try {
        const errorContext = [previousError, criticFeedback]
          .filter(Boolean)
          .join("\n");
        patchResult = await generatePatch(
          issue,
          codeContext,
          plan,
          config.llm,
          errorContext || undefined,
        );
        steps.push(
          createStep(
            `generate-attempt-${attempt + 1}`,
            "success",
            Date.now() - genStart,
          ),
        );
        log.info(
          {
            step: "generate",
            attempt: attempt + 1,
            durationMs: Date.now() - genStart,
          },
          "Patch generated",
        );
      } catch (error) {
        steps.push(
          createStep(
            `generate-attempt-${attempt + 1}`,
            "failed",
            Date.now() - genStart,
            String(error),
          ),
        );
        throw error;
      }

      // === TEST IN SANDBOX ===
      const testStart = Date.now();
      const runResult = await runInSandbox(
        repoPath,
        patchResult.patch,
        config.sandboxManager,
      );
      steps.push(
        createStep(
          `test-attempt-${attempt + 1}`,
          runResult.testsPassed ? "success" : "failed",
          Date.now() - testStart,
          runResult.error,
        ),
      );

      if (!runResult.testsPassed) {
        previousError = runResult.error ?? "Tests failed";
        log.warn(
          { step: "test", attempt: attempt + 1, error: previousError },
          "Tests failed, will retry",
        );
        continue;
      }

      log.info(
        {
          step: "test",
          attempt: attempt + 1,
          durationMs: Date.now() - testStart,
        },
        "Tests passed",
      );

      // === CRITIC REVIEW ===
      const criticStart = Date.now();
      const criticResult = await reviewPatch(
        patchResult.patch,
        issue,
        codeContext,
        config.llm,
      );
      steps.push(
        createStep(
          `critic-attempt-${criticAttempts + 1}`,
          criticResult.passed ? "success" : "failed",
          Date.now() - criticStart,
          `Score: ${criticResult.score}/100`,
        ),
      );

      if (criticResult.passed) {
        finalPatch = patchResult;
        log.info(
          { step: "critic", score: criticResult.score },
          "Critic approved patch",
        );
        break;
      }

      criticAttempts++;
      criticFeedback = `Critic score: ${criticResult.score}/100. Feedback: ${criticResult.feedback}. Issues: ${criticResult.issues.map((i) => `[${i.severity}] ${i.description}`).join("; ")}`;
      log.warn(
        { step: "critic", score: criticResult.score, criticAttempts },
        "Critic rejected patch, will retry",
      );

      if (criticAttempts >= MAX_CRITIC_RETRIES) {
        // Accept the patch anyway if we've hit critic retry limit but tests pass
        finalPatch = patchResult;
        log.warn("Max critic retries reached, accepting patch with low score");
        break;
      }
    }

    if (!finalPatch) {
      // Max test retries exhausted
      const failResult = buildFailResult(
        issueNumber,
        testAttempts,
        costTracker,
        Date.now() - startedAt.getTime(),
        "Max retries exhausted — tests never passed.",
      );

      await safeCommentOnIssue(
        config,
        owner,
        repo,
        issueNumber,
        `CodePilot was unable to resolve this issue after ${testAttempts} attempts. Last error: ${previousError ?? "unknown"}`,
        log,
      );

      return buildRun(runId, issueNumber, steps, failResult, startedAt);
    }

    // === STEP 9: SUBMIT PR ===
    const submitStart = Date.now();
    try {
      const branchName = generateBranchName(issueNumber, issue.title);
      await createBranch(repoPath, branchName);
      await applyPatch(repoPath, finalPatch.patch);
      await commitAndPush(
        repoPath,
        `fix: resolve #${issueNumber} — ${issue.title}`,
        branchName,
      );

      const prResult = await createPR(config.octokit, {
        owner,
        repo,
        branch: branchName,
        issueNumber,
        issueTitle: issue.title,
        summary: finalPatch.explanation,
        filesChanged: [...finalPatch.filesChanged],
      });

      steps.push(
        createStep(
          "submit",
          "success",
          Date.now() - submitStart,
          prResult.prUrl,
        ),
      );
      log.info(
        {
          step: "submit",
          prUrl: prResult.prUrl,
          durationMs: Date.now() - submitStart,
        },
        "PR created",
      );

      const successResult: AgentResult = {
        success: true,
        issueNumber,
        patch: finalPatch.patch,
        explanation: finalPatch.explanation,
        prUrl: prResult.prUrl,
        attempts: testAttempts,
        totalCostUsd: costTracker.totalCostUsd,
        totalLatencyMs: Date.now() - startedAt.getTime(),
      };

      return buildRun(runId, issueNumber, steps, successResult, startedAt);
    } catch (error) {
      steps.push(
        createStep("submit", "failed", Date.now() - submitStart, String(error)),
      );
      log.error({ error }, "Failed to submit PR");
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, "Agent run failed");

    const failResult = buildFailResult(
      issueNumber,
      0,
      costTracker,
      Date.now() - startedAt.getTime(),
      message,
    );

    if (issueNumber > 0) {
      await safeCommentOnIssue(
        config,
        owner,
        repo,
        issueNumber,
        `CodePilot encountered an error while processing this issue: ${message}`,
        log,
      );
    }

    return buildRun(runId, issueNumber, steps, failResult, startedAt);
  } finally {
    // === CLEANUP ===
    if (repoPath) {
      try {
        await cleanup(repoPath);
        log.info({ repoPath }, "Cleanup completed");
      } catch (cleanupError) {
        log.warn({ error: cleanupError }, "Cleanup failed");
      }
    }

    log.info(
      {
        runId,
        issueNumber,
        totalCostUsd: costTracker.totalCostUsd,
        totalLatencyMs: Date.now() - startedAt.getTime(),
        stepCount: steps.length,
      },
      "Agent run completed",
    );
  }
}

function buildFailResult(
  issueNumber: number,
  attempts: number,
  costTracker: CostTracker,
  latencyMs: number,
  error: string,
): AgentResult {
  return {
    success: false,
    issueNumber,
    attempts,
    totalCostUsd: costTracker.totalCostUsd,
    totalLatencyMs: latencyMs,
    error,
  };
}

function buildRun(
  id: string,
  issueNumber: number,
  steps: readonly AgentStep[],
  result: AgentResult,
  startedAt: Date,
): AgentRun {
  return {
    id,
    issueNumber,
    steps: [...steps],
    result,
    startedAt,
    completedAt: new Date(),
  };
}

async function safeCommentOnIssue(
  config: AgentConfig,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  log: { warn: (obj: unknown, msg?: string) => void },
): Promise<void> {
  try {
    await commentOnIssue(config.octokit, owner, repo, issueNumber, body);
  } catch (commentError) {
    log.warn({ error: commentError }, "Failed to comment on issue");
  }
}

/** Custom error class for agent loop errors */
export class AgentLoopError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_input"
      | "cost_exceeded"
      | "max_retries"
      | "internal",
  ) {
    super(message);
    this.name = "AgentLoopError";
  }
}
