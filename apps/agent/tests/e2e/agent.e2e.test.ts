import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ParsedIssue, CompletionParams, CompletionResult, StreamChunk, CostEstimate, LLMAdapter } from "@codepilot/shared";
import type { VectorStore, SearchResult } from "../../src/indexer/store.js";
import type { AgentConfig } from "../../src/agent/types.js";
import { createPlan } from "../../src/agent/planner.js";
import { generatePatch } from "../../src/agent/generator.js";
import { reviewPatch } from "../../src/agent/critic.js";
import { searchForIssue } from "../../src/agent/searcher.js";
import { chunkCodebase } from "../../src/indexer/chunker.js";
import { parseIssue, extractFilePaths, detectIssueType } from "../../src/github/issues.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_REPO_PATH = resolve(__dirname, "test-repo");

interface TestIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
}

const testIssue: TestIssue = JSON.parse(
  readFileSync(resolve(__dirname, "test-issue.json"), "utf-8"),
);

const parsedIssue: ParsedIssue = {
  number: testIssue.number,
  title: testIssue.title,
  body: testIssue.body,
  labels: [...testIssue.labels],
  repoOwner: "test-owner",
  repoName: "test-repo",
  fileMentions: extractFilePaths(testIssue.body),
  stepsToReproduce:
    "1. Call `divide(10, 0)`\n2. Returns `Infinity` instead of throwing",
  expectedBehavior: "Should throw an Error with message 'Division by zero'",
};

/** Read the test-repo math.ts source as context */
function loadTestRepoContext(): string {
  const mathSource = readFileSync(
    resolve(TEST_REPO_PATH, "src/math.ts"),
    "utf-8",
  );
  const testSource = readFileSync(
    resolve(TEST_REPO_PATH, "tests/math.test.ts"),
    "utf-8",
  );
  return [
    `--- src/math.ts (lines 1-24, typescript, score: 0.950) ---`,
    mathSource,
    "",
    `--- tests/math.test.ts (lines 1-48, typescript, score: 0.900) ---`,
    testSource,
    "",
  ].join("\n");
}

// =========================================================================
// Part 1: Unit-level tests that don't need an LLM
// =========================================================================

describe("E2E: Issue parsing and indexing", () => {
  it("should parse the test issue correctly", () => {
    expect(parsedIssue.number).toBe(1);
    expect(parsedIssue.title).toContain("divide");
    expect(parsedIssue.labels).toContain("bug");
    expect(parsedIssue.fileMentions).toContain("src/math.ts");
  });

  it("should detect issue type as bug", () => {
    const issueType = detectIssueType(
      parsedIssue.labels,
      parsedIssue.title,
      parsedIssue.body,
    );
    expect(issueType).toBe("bug");
  });

  it("should extract file paths from issue body", () => {
    const files = extractFilePaths(parsedIssue.body);
    expect(files).toContain("src/math.ts");
  });

  it("should chunk the test-repo codebase", async () => {
    const chunks = await chunkCodebase(TEST_REPO_PATH);
    expect(chunks.length).toBeGreaterThan(0);

    const mathChunks = chunks.filter((c) => c.filePath.includes("math.ts"));
    expect(mathChunks.length).toBeGreaterThan(0);
  });

  it("should load test-repo context with math.ts content", () => {
    const context = loadTestRepoContext();
    expect(context).toContain("export function divide");
    expect(context).toContain("return a / b");
    expect(context).toContain("Division by zero");
  });
});

// =========================================================================
// Part 2: Mock-LLM integration tests
// =========================================================================

/** Creates a mock LLM adapter that returns preconfigured responses */
function createMockLLM(responses: Record<string, string>): LLMAdapter {
  return {
    provider: "mock",
    async complete(params: CompletionParams): Promise<CompletionResult> {
      const systemPrompt = params.systemPrompt ?? "";

      let responseKey = "default";
      if (systemPrompt.includes("planning module")) {
        responseKey = "plan";
      } else if (systemPrompt.includes("code generation module")) {
        responseKey = "generate";
      } else if (systemPrompt.includes("code review module")) {
        responseKey = "critic";
      }

      const content = responses[responseKey] ?? responses["default"] ?? "";

      return {
        content,
        model: "mock-model",
        inputTokens: 100,
        outputTokens: 200,
        costUsd: 0.001,
        latencyMs: 50,
        finishReason: "stop",
      };
    },
    async *stream(): AsyncGenerator<StreamChunk> {
      yield { type: "text", content: "mock stream" };
      yield { type: "done" };
    },
    estimateCost(): CostEstimate {
      return {
        estimatedInputTokens: 100,
        estimatedOutputTokens: 200,
        estimatedCostUsd: 0.001,
      };
    },
  };
}

describe("E2E: Agent pipeline with mock LLM", () => {
  const codeContext = loadTestRepoContext();

  const mockLLM = createMockLLM({
    plan: JSON.stringify({
      summary: "Add division by zero check in divide function",
      steps: [
        {
          description:
            "Add a guard clause to throw an Error when b is zero",
          files: ["src/math.ts"],
          action: "modify",
        },
      ],
      estimatedFiles: ["src/math.ts"],
      approach:
        "Add an if-check at the beginning of the divide function to throw an Error with message 'Division by zero' when b === 0",
    }),
    generate: [
      "--- a/src/math.ts",
      "+++ b/src/math.ts",
      "@@ -20,5 +20,8 @@",
      " /**",
      "  * Divide a by b.",
      "-  * BUG: Does not handle division by zero — returns Infinity instead of throwing.",
      "+  * Throws an Error if b is zero.",
      "  */",
      " export function divide(a: number, b: number): number {",
      "+  if (b === 0) {",
      "+    throw new Error('Division by zero');",
      "+  }",
      "   return a / b;",
      " }",
      "---EXPLANATION---",
      "Added a guard clause to the divide function that throws an Error with message 'Division by zero' when the divisor is zero.",
      "---FILES---",
      "src/math.ts",
    ].join("\n"),
    critic: JSON.stringify({
      correctness: 20,
      security: 20,
      style: 18,
      completeness: 20,
      simplicity: 20,
      feedback:
        "The patch correctly adds a guard clause for division by zero. Clean and minimal change.",
      issues: [],
    }),
  });

  it("should create a valid plan from the issue", async () => {
    const plan = await createPlan(parsedIssue, codeContext, mockLLM);

    expect(plan.summary).toBeTruthy();
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.estimatedFiles).toContain("src/math.ts");
    expect(plan.approach).toBeTruthy();
  }, 10_000);

  it("should generate a valid patch", async () => {
    const plan = await createPlan(parsedIssue, codeContext, mockLLM);
    const patch = await generatePatch(
      parsedIssue,
      codeContext,
      plan,
      mockLLM,
    );

    expect(patch.patch).toContain("--- a/src/math.ts");
    expect(patch.patch).toContain("+++ b/src/math.ts");
    expect(patch.patch).toContain("Division by zero");
    expect(patch.filesChanged).toContain("src/math.ts");
    expect(patch.explanation).toBeTruthy();
  }, 10_000);

  it("should pass critic review", async () => {
    const plan = await createPlan(parsedIssue, codeContext, mockLLM);
    const patch = await generatePatch(
      parsedIssue,
      codeContext,
      plan,
      mockLLM,
    );
    const criticResult = await reviewPatch(
      patch.patch,
      parsedIssue,
      codeContext,
      mockLLM,
    );

    expect(criticResult.passed).toBe(true);
    expect(criticResult.score).toBeGreaterThanOrEqual(60);
    expect(criticResult.feedback).toBeTruthy();
  }, 10_000);

  it("should run the full pipeline: plan -> generate -> critic", async () => {
    // Step 1: Plan
    const plan = await createPlan(parsedIssue, codeContext, mockLLM);
    expect(plan.steps.length).toBeGreaterThan(0);

    // Step 2: Generate patch
    const patch = await generatePatch(
      parsedIssue,
      codeContext,
      plan,
      mockLLM,
    );
    expect(patch.patch).toContain("--- a/");

    // Step 3: Critic review
    const criticResult = await reviewPatch(
      patch.patch,
      parsedIssue,
      codeContext,
      mockLLM,
    );
    expect(criticResult.passed).toBe(true);

    // Verify the patch would fix the bug
    expect(patch.patch).toContain("Division by zero");
    expect(patch.patch).toContain("throw");
  }, 30_000);
});

// =========================================================================
// Part 3: Real LLM integration test (requires API key)
// =========================================================================

const HAS_ANTHROPIC_KEY = Boolean(process.env.ANTHROPIC_API_KEY);
const HAS_OPENAI_KEY = Boolean(process.env.OPENAI_API_KEY);
const HAS_ANY_KEY = HAS_ANTHROPIC_KEY || HAS_OPENAI_KEY;

describe.skipIf(!HAS_ANY_KEY)(
  "E2E: Agent pipeline with real LLM",
  () => {
    let realLLM: LLMAdapter;

    beforeAll(async () => {
      if (HAS_ANTHROPIC_KEY) {
        const { ClaudeAdapter } = await import("../../src/llm/claude.js");
        realLLM = new ClaudeAdapter();
      } else if (HAS_OPENAI_KEY) {
        const { OpenAIAdapter } = await import("../../src/llm/openai.js");
        realLLM = new OpenAIAdapter();
      }
    });

    it("should generate a plan that targets src/math.ts", async () => {
      const codeContext = loadTestRepoContext();
      const plan = await createPlan(parsedIssue, codeContext, realLLM);

      expect(plan.summary).toBeTruthy();
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.approach).toBeTruthy();

      // The plan should mention math.ts or the divide function
      const planText = JSON.stringify(plan).toLowerCase();
      expect(
        planText.includes("math") || planText.includes("divide"),
      ).toBe(true);
    }, 120_000);

    it("should generate a patch that fixes the divide-by-zero bug", async () => {
      const codeContext = loadTestRepoContext();
      const plan = await createPlan(parsedIssue, codeContext, realLLM);
      const patch = await generatePatch(
        parsedIssue,
        codeContext,
        plan,
        realLLM,
      );

      expect(patch.patch).toBeTruthy();
      expect(patch.explanation).toBeTruthy();

      // The patch should contain a diff for math.ts
      const patchLower = patch.patch.toLowerCase();
      expect(patchLower).toContain("math.ts");

      // The patch should introduce a zero-check or throw
      expect(
        patchLower.includes("zero") ||
          patchLower.includes("throw") ||
          patchLower.includes("error"),
      ).toBe(true);
    }, 120_000);
  },
);
