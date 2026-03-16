import type { Octokit } from '@octokit/rest';
import { logger } from '../utils/logger.js';
import { GitHubApiError } from './issues.js';

/** Parameters for creating a pull request */
export interface CreatePRParams {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly baseBranch?: string;
  readonly title?: string;
  readonly body?: string;
  readonly issueNumber: number;
  readonly issueTitle: string;
  readonly summary: string;
  readonly filesChanged: readonly string[];
  readonly labels?: readonly string[];
}

/** Result of creating a pull request */
export interface CreatePRResult {
  readonly prUrl: string;
  readonly prNumber: number;
}

const CODEPILOT_LABEL = 'codepilot';
const MAX_TITLE_LENGTH = 72;

/** Generate PR title from issue number and title */
export function generatePRTitle(issueNumber: number, issueTitle: string): string {
  const maxTitlePartLength = MAX_TITLE_LENGTH - `fix(codepilot): resolve #${issueNumber} — `.length;
  const shortTitle = issueTitle.length > maxTitlePartLength
    ? `${issueTitle.slice(0, maxTitlePartLength - 3)}...`
    : issueTitle;

  return `fix(codepilot): resolve #${issueNumber} — ${shortTitle}`;
}

/** Generate PR body in markdown format */
export function generatePRBody(params: {
  readonly summary: string;
  readonly filesChanged: readonly string[];
  readonly issueNumber: number;
}): string {
  const filesList = params.filesChanged.map((f) => `- \`${f}\``).join('\n');

  return `## Summary

${params.summary}

## Changes

${filesList || '_No files changed._'}

## Issue

Resolves #${params.issueNumber}

## Agent Metadata

- **Agent:** CodePilot
- **Automated:** Yes
- **Review required:** Yes
`;
}

/** Map GitHub API error status to GitHubApiError */
function handleApiError(error: unknown): never {
  if (error instanceof GitHubApiError) throw error;

  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 404) {
    throw new GitHubApiError(`Repository not found: ${message}`, 'not_found', 404, false);
  }
  if (status === 403) {
    const isRateLimit = message.toLowerCase().includes('rate limit');
    throw new GitHubApiError(
      isRateLimit ? `GitHub API rate limit exceeded: ${message}` : `Access forbidden: ${message}`,
      isRateLimit ? 'rate_limit' : 'forbidden',
      403,
      isRateLimit,
    );
  }

  throw new GitHubApiError(`GitHub API error: ${message}`, 'api_error', status ?? 500, true);
}

/** Create a pull request on GitHub */
export async function createPR(
  octokit: Octokit,
  params: CreatePRParams,
): Promise<CreatePRResult> {
  const log = logger.child({
    module: 'github-prs',
    owner: params.owner,
    repo: params.repo,
    issueNumber: params.issueNumber,
  });

  const title = params.title ?? generatePRTitle(params.issueNumber, params.issueTitle);
  const body = params.body ?? generatePRBody({
    summary: params.summary,
    filesChanged: params.filesChanged,
    issueNumber: params.issueNumber,
  });

  log.info({ branch: params.branch, title }, 'Creating pull request');

  try {
    const response = await octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      head: params.branch,
      base: params.baseBranch ?? 'main',
      title,
      body,
    });

    const prNumber = response.data.number;
    const prUrl = response.data.html_url;

    log.info({ prNumber, prUrl }, 'Pull request created');

    try {
      const allLabels = [CODEPILOT_LABEL, ...(params.labels ?? [])];
      await octokit.rest.issues.addLabels({
        owner: params.owner,
        repo: params.repo,
        issue_number: prNumber,
        labels: [...allLabels],
      });
      log.info({ labels: allLabels }, 'Labels added to pull request');
    } catch (labelError: unknown) {
      log.warn({ error: labelError }, 'Failed to add labels to pull request (non-fatal)');
    }

    return { prUrl, prNumber };
  } catch (error: unknown) {
    log.error({ error }, 'Failed to create pull request');
    handleApiError(error);
  }
}

/** Comment on a GitHub issue */
export async function commentOnIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const log = logger.child({ module: 'github-prs', owner, repo, issueNumber });
  log.info('Commenting on issue');

  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    log.info('Comment added to issue');
  } catch (error: unknown) {
    log.error({ error }, 'Failed to comment on issue');
    handleApiError(error);
  }
}
