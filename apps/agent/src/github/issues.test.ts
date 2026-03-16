import { describe, it, expect, vi } from "vitest";
import {
  parseIssue,
  extractFilePaths,
  extractSection,
  extractCodeBlocks,
  detectLanguages,
  detectIssueType,
  GitHubApiError,
} from "./issues.js";
import bugIssue from "../../tests/fixtures/github-issue-bug.json" with { type: "json" };
import minimalIssue from "../../tests/fixtures/github-issue-minimal.json" with { type: "json" };
import featureIssue from "../../tests/fixtures/github-issue-feature.json" with { type: "json" };

vi.mock("../utils/logger.js", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

function createMockOctokit(issueData: Record<string, unknown>) {
  return {
    rest: {
      issues: {
        get: vi.fn().mockResolvedValue({ data: issueData }),
      },
    },
  } as unknown as Parameters<typeof parseIssue>[0];
}

describe("issues", () => {
  describe("extractFilePaths", () => {
    it("should extract backtick-quoted file paths", () => {
      const body =
        "Check `src/auth/login-handler.ts` and `src/utils/validator.ts`";
      const result = extractFilePaths(body);
      expect(result).toContain("src/auth/login-handler.ts");
      expect(result).toContain("src/utils/validator.ts");
    });

    it("should extract bare file paths with directories", () => {
      const body = "The file src/components/button.tsx has a bug";
      const result = extractFilePaths(body);
      expect(result).toContain("src/components/button.tsx");
    });

    it("should not extract URLs", () => {
      const body = "See https://example.com/file.ts for details";
      const result = extractFilePaths(body);
      expect(result).not.toContain("https://example.com/file.ts");
    });

    it("should deduplicate file paths", () => {
      const body = "Check `src/index.ts` and also `src/index.ts` again";
      const result = extractFilePaths(body);
      expect(result.filter((f) => f === "src/index.ts")).toHaveLength(1);
    });
  });

  describe("extractSection", () => {
    it("should extract Steps to Reproduce section", () => {
      const result = extractSection(bugIssue.body, "stepsToReproduce");
      expect(result).toBeDefined();
      expect(result).toContain("Open the login page");
    });

    it("should extract Expected Behavior section", () => {
      const result = extractSection(bugIssue.body, "expectedBehavior");
      expect(result).toBeDefined();
      expect(result).toContain("login should work");
    });

    it("should extract Actual Behavior section", () => {
      const result = extractSection(bugIssue.body, "actualBehavior");
      expect(result).toBeDefined();
      expect(result).toContain("TypeError");
    });

    it("should return undefined for missing sections", () => {
      const result = extractSection(minimalIssue.body, "stepsToReproduce");
      expect(result).toBeUndefined();
    });
  });

  describe("extractCodeBlocks", () => {
    it("should extract code blocks from body", () => {
      const result = extractCodeBlocks(bugIssue.body);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("validateEmail");
    });

    it("should return empty array when no code blocks", () => {
      const result = extractCodeBlocks(minimalIssue.body);
      expect(result).toHaveLength(0);
    });

    it("should extract multiple code blocks", () => {
      const result = extractCodeBlocks(featureIssue.body);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toContain("ThemeToggle");
    });
  });

  describe("detectLanguages", () => {
    it("should detect TypeScript from body", () => {
      const result = detectLanguages(bugIssue.body);
      expect(result).toContain("typescript");
    });

    it("should detect React from body", () => {
      const result = detectLanguages(featureIssue.body);
      expect(result).toContain("react");
    });

    it("should return empty for body with no language mentions", () => {
      const result = detectLanguages(
        "This is a plain text without language mentions",
      );
      expect(result).toHaveLength(0);
    });
  });

  describe("detectIssueType", () => {
    it("should detect bug from label", () => {
      const result = detectIssueType(
        ["bug", "priority: high"],
        "title",
        "body",
      );
      expect(result).toBe("bug");
    });

    it("should detect feature from enhancement label", () => {
      const result = detectIssueType(["enhancement"], "title", "body");
      expect(result).toBe("feature");
    });

    it("should detect bug from content keywords", () => {
      const result = detectIssueType([], "App crashes on login", "");
      expect(result).toBe("bug");
    });

    it("should detect feature from content keywords", () => {
      const result = detectIssueType([], "Add dark mode support", "");
      expect(result).toBe("feature");
    });

    it("should return unknown when no match", () => {
      const result = detectIssueType(
        [],
        "Update dependencies",
        "Bump versions",
      );
      expect(result).toBe("unknown");
    });
  });

  describe("parseIssue", () => {
    it("should parse a bug issue with full sections", async () => {
      const octokit = createMockOctokit(bugIssue);
      const result = await parseIssue(octokit, "testorg", "my-app", 42);

      expect(result.number).toBe(42);
      expect(result.title).toContain("Login form");
      expect(result.issueType).toBe("bug");
      expect(result.stepsToReproduce).toBeDefined();
      expect(result.expectedBehavior).toBeDefined();
      expect(result.actualBehavior).toBeDefined();
      expect(result.fileMentions.length).toBeGreaterThan(0);
      expect(result.codeBlocks.length).toBeGreaterThan(0);
      expect(result.repoOwner).toBe("testorg");
      expect(result.repoName).toBe("my-app");
    });

    it("should parse a minimal issue", async () => {
      const octokit = createMockOctokit(minimalIssue);
      const result = await parseIssue(octokit, "testorg", "my-app", 99);

      expect(result.number).toBe(99);
      expect(result.title).toBe("Fix typo in README");
      expect(result.stepsToReproduce).toBeUndefined();
      expect(result.codeBlocks).toHaveLength(0);
    });

    it("should parse a feature issue", async () => {
      const octokit = createMockOctokit(featureIssue);
      const result = await parseIssue(octokit, "testorg", "my-app", 150);

      expect(result.number).toBe(150);
      expect(result.issueType).toBe("feature");
      expect(result.fileMentions).toContain("src/components/theme-toggle.tsx");
    });

    it("should throw GitHubApiError on 404", async () => {
      const octokit = createMockOctokit({});
      const getMock = octokit.rest.issues.get as unknown as ReturnType<
        typeof vi.fn
      >;
      getMock.mockRejectedValue({ status: 404, message: "Not Found" });

      await expect(
        parseIssue(octokit, "testorg", "my-app", 999),
      ).rejects.toThrow(GitHubApiError);
    });

    it("should throw GitHubApiError on rate limit", async () => {
      const octokit = createMockOctokit({});
      const getMock = octokit.rest.issues.get as unknown as ReturnType<
        typeof vi.fn
      >;
      const rateLimitError = new Error("API rate limit exceeded");
      (rateLimitError as unknown as { status: number }).status = 403;
      getMock.mockRejectedValue(rateLimitError);

      await expect(
        parseIssue(octokit, "testorg", "my-app", 1),
      ).rejects.toMatchObject({
        code: "rate_limit",
        retryable: true,
      });
    });
  });
});
