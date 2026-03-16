import { describe, it, expect } from "vitest";
import {
  ResolveIssueJobSchema,
  validateJobData,
  QUEUE_NAME,
  JOB_NAMES,
} from "./jobs.js";

describe("Queue Jobs", () => {
  const validJob = {
    issueUrl: "https://github.com/owner/repo/issues/1",
    repoOwner: "owner",
    repoName: "repo",
    issueNumber: 1,
    triggeredBy: "webhook" as const,
    installationId: 12345,
  };

  it("should validate a correct job", () => {
    const result = ResolveIssueJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("should reject job with invalid URL", () => {
    const result = ResolveIssueJobSchema.safeParse({
      ...validJob,
      issueUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("should reject job with negative issue number", () => {
    const result = ResolveIssueJobSchema.safeParse({
      ...validJob,
      issueNumber: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should reject job with invalid triggeredBy", () => {
    const result = ResolveIssueJobSchema.safeParse({
      ...validJob,
      triggeredBy: "cron",
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty repoOwner", () => {
    const result = ResolveIssueJobSchema.safeParse({
      ...validJob,
      repoOwner: "",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid triggeredBy values", () => {
    for (const triggeredBy of ["webhook", "manual", "api"] as const) {
      const result = ResolveIssueJobSchema.safeParse({
        ...validJob,
        triggeredBy,
      });
      expect(result.success).toBe(true);
    }
  });

  it("should return success result from validateJobData", () => {
    const result = validateJobData(validJob);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.issueNumber).toBe(1);
    }
  });

  it("should return error result from validateJobData for invalid data", () => {
    const result = validateJobData({ issueUrl: 123 });
    expect(result.success).toBe(false);
  });

  it("should export correct constants", () => {
    expect(QUEUE_NAME).toBe("codepilot-resolve");
    expect(JOB_NAMES.RESOLVE_ISSUE).toBe("resolve-issue");
  });
});
