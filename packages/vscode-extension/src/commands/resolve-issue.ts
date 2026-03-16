import * as vscode from 'vscode';
import type { CodePilotApiClient } from '../api/client';

interface ParsedIssue {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
}

export function parseIssueInput(input: string): ParsedIssue | null {
  // Full URL: https://github.com/owner/repo/issues/123
  const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2],
      issueNumber: parseInt(urlMatch[3], 10),
    };
  }

  // Shorthand: owner/repo#123
  const shortMatch = input.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1],
      repo: shortMatch[2],
      issueNumber: parseInt(shortMatch[3], 10),
    };
  }

  return null;
}

export async function resolveIssue(client: CodePilotApiClient): Promise<void> {
  const input = await vscode.window.showInputBox({
    prompt: 'Enter issue URL or owner/repo#number',
    placeHolder: 'https://github.com/owner/repo/issues/123 or owner/repo#123',
  });

  if (!input) {
    return;
  }

  const parsed = parseIssueInput(input);
  if (!parsed) {
    vscode.window.showErrorMessage(
      'Invalid issue format. Use https://github.com/owner/repo/issues/123 or owner/repo#123',
    );
    return;
  }

  const reposResult = await client.listRepos();
  if (!reposResult.success) {
    vscode.window.showErrorMessage(`Failed to fetch repos: ${reposResult.error}`);
    return;
  }

  const repoInfo = reposResult.data.find(
    (r) => r.owner === parsed.owner && r.repo === parsed.repo,
  );

  if (!repoInfo) {
    vscode.window.showErrorMessage(
      `Repository ${parsed.owner}/${parsed.repo} not found. Is the GitHub App installed?`,
    );
    return;
  }

  const enqueueResult = await client.enqueueIssue({
    issueUrl: `https://github.com/${parsed.owner}/${parsed.repo}/issues/${parsed.issueNumber}`,
    repoOwner: parsed.owner,
    repoName: parsed.repo,
    issueNumber: parsed.issueNumber,
    triggeredBy: 'api',
    installationId: repoInfo.installationId,
  });

  if (!enqueueResult.success) {
    vscode.window.showErrorMessage(`Failed to enqueue issue: ${enqueueResult.error}`);
    return;
  }

  vscode.window.showInformationMessage(
    `Issue #${parsed.issueNumber} enqueued successfully (Job: ${enqueueResult.data.jobId})`,
  );
}
