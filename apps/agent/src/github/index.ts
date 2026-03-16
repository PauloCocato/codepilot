export {
  normalizePrivateKey,
  createAppOctokit,
  createInstallationOctokit,
  GitHubAuthError,
} from "./auth.js";

export {
  parseIssue,
  extractFilePaths,
  extractSection,
  extractCodeBlocks,
  detectLanguages,
  detectIssueType,
  GitHubApiError,
} from "./issues.js";
export type { ExtendedParsedIssue, IssueType } from "./issues.js";

export {
  cloneRepo,
  createBranch,
  applyPatch,
  commitAndPush,
  cleanup,
  generateBranchName,
  GitOperationError,
} from "./repos.js";
export type { CloneResult, PatchResult, CommitPushResult } from "./repos.js";

export {
  createPR,
  commentOnIssue,
  generatePRTitle,
  generatePRBody,
} from "./prs.js";
export type { CreatePRParams, CreatePRResult } from "./prs.js";

export {
  readRepoConfig,
  clearConfigCache,
  RepoConfigSchema,
  DEFAULT_REPO_CONFIG,
} from "./config-reader.js";
export type { RepoConfig } from "./config-reader.js";

export {
  createWebhookHandler,
  incrementActiveJobs,
  decrementActiveJobs,
  getActiveJobs,
  resetActiveJobs,
} from "./app.js";
export type {
  WebhookJob,
  JobQueue,
  WebhookHandlerOptions,
  WebhookTrigger,
} from "./app.js";

export { WebhookQueueAdapter } from "./queue-adapter.js";
