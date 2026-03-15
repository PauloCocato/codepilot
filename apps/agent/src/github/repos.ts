import { simpleGit, type SimpleGit } from "simple-git";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";

/** Result of a clone operation */
export interface CloneResult {
  readonly path: string;
  readonly defaultBranch: string;
}

/** Result of applying a patch */
export interface PatchResult {
  readonly success: boolean;
  readonly filesChanged: readonly string[];
  readonly error?: string;
}

/** Result of a commit and push operation */
export interface CommitPushResult {
  readonly sha: string;
}

/** Custom error for Git operations */
export class GitOperationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "clone_failed"
      | "branch_failed"
      | "patch_failed"
      | "push_failed"
      | "cleanup_failed",
    public readonly repoPath?: string,
  ) {
    super(message);
    this.name = "GitOperationError";
  }
}

const BASE_CLONE_DIR = "/tmp/codepilot";

const MAX_SLUG_LENGTH = 50;
const MAX_SLUG_WORDS = 5;

/** Generate a branch name from issue number and title */
export function generateBranchName(issueNumber: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, MAX_SLUG_WORDS)
    .join("-")
    .slice(0, MAX_SLUG_LENGTH);

  return `codepilot/issue-${issueNumber}-${slug}`;
}

/** Clone a repository using shallow clone for speed */
export async function cloneRepo(
  owner: string,
  repo: string,
  targetDir?: string,
): Promise<CloneResult> {
  const log = logger.child({
    module: "github-repos",
    operation: "clone",
    owner,
    repo,
  });
  const cloneDir =
    targetDir ??
    join(BASE_CLONE_DIR, `${owner}-${repo}-${randomUUID().slice(0, 8)}`);

  log.info({ cloneDir }, "Cloning repository");

  try {
    await mkdir(cloneDir, { recursive: true });

    const git: SimpleGit = simpleGit();
    const repoUrl = `https://github.com/${owner}/${repo}.git`;

    await git.clone(repoUrl, cloneDir, ["--depth", "1"]);

    const clonedGit = simpleGit(cloneDir);
    const branchSummary = await clonedGit.branch();
    const defaultBranch = branchSummary.current;

    log.info({ cloneDir, defaultBranch }, "Repository cloned successfully");

    return { path: cloneDir, defaultBranch };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message, cloneDir }, "Failed to clone repository");
    throw new GitOperationError(
      `Failed to clone ${owner}/${repo}: ${message}`,
      "clone_failed",
      cloneDir,
    );
  }
}

/** Create a new branch in the repository */
export async function createBranch(
  repoPath: string,
  branchName: string,
): Promise<void> {
  const log = logger.child({
    module: "github-repos",
    operation: "branch",
    repoPath,
    branchName,
  });
  log.info("Creating branch");

  try {
    const git = simpleGit(repoPath);
    await git.checkoutLocalBranch(branchName);
    log.info("Branch created successfully");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, "Failed to create branch");
    throw new GitOperationError(
      `Failed to create branch ${branchName}: ${message}`,
      "branch_failed",
      repoPath,
    );
  }
}

/** Apply a unified diff patch to the repository */
export async function applyPatch(
  repoPath: string,
  patch: string,
): Promise<PatchResult> {
  const log = logger.child({
    module: "github-repos",
    operation: "patch",
    repoPath,
  });
  log.info("Applying patch");

  try {
    const git = simpleGit(repoPath);
    await git.applyPatch(patch);

    const status = await git.status();
    const filesChanged = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.not_added,
    ];

    log.info(
      { filesChanged: filesChanged.length },
      "Patch applied successfully",
    );

    return { success: true, filesChanged };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ error: message }, "Failed to apply patch");

    return { success: false, filesChanged: [], error: message };
  }
}

/** Commit changes and push to remote */
export async function commitAndPush(
  repoPath: string,
  message: string,
  branch: string,
): Promise<CommitPushResult> {
  const log = logger.child({
    module: "github-repos",
    operation: "commit-push",
    repoPath,
    branch,
  });
  log.info("Committing and pushing changes");

  try {
    const git = simpleGit(repoPath);

    await git.add(".");
    const commitResult = await git.commit(message);
    const sha = commitResult.commit;

    await git.push("origin", branch, ["--set-upstream"]);

    log.info({ sha, branch }, "Changes committed and pushed successfully");

    return { sha };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error({ error: message }, "Failed to commit and push");
    throw new GitOperationError(
      `Failed to commit and push: ${message}`,
      "push_failed",
      repoPath,
    );
  }
}

/** Clean up a cloned repository */
export async function cleanup(repoPath: string): Promise<void> {
  const log = logger.child({
    module: "github-repos",
    operation: "cleanup",
    repoPath,
  });
  log.info("Cleaning up repository clone");

  try {
    await rm(repoPath, { recursive: true, force: true });
    log.info("Repository clone cleaned up successfully");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn({ error: message }, "Failed to clean up repository clone");
    throw new GitOperationError(
      `Failed to cleanup ${repoPath}: ${message}`,
      "cleanup_failed",
      repoPath,
    );
  }
}
