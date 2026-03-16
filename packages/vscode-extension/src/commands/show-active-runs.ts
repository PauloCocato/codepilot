import * as vscode from 'vscode';
import type { CodePilotApiClient } from '../api/client';
import { showRunDetails } from './show-run-details';

export async function showActiveRuns(client: CodePilotApiClient): Promise<void> {
  const result = await client.getRecentJobs(50);
  if (!result.success) {
    vscode.window.showErrorMessage(`Failed to fetch runs: ${result.error}`);
    return;
  }

  const activeJobs = result.data.filter(
    (j) => j.state === 'active' || j.state === 'waiting',
  );

  if (activeJobs.length === 0) {
    vscode.window.showInformationMessage('No active runs.');
    return;
  }

  const items = activeJobs.map((job) => ({
    label: `#${job.data.issueNumber} - ${job.data.repoOwner}/${job.data.repoName}`,
    description: job.state,
    detail: `Job: ${job.id} | Attempts: ${job.attemptsMade}`,
    jobId: job.id,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a run to view details',
  });

  if (selected) {
    await showRunDetails(client, selected.jobId);
  }
}
