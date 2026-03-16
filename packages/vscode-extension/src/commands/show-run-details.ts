import * as vscode from 'vscode';
import type { CodePilotApiClient } from '../api/client';

const outputChannel = vscode.window.createOutputChannel('CodePilot Run Details');

export async function showRunDetails(
  client: CodePilotApiClient,
  jobId?: string,
): Promise<void> {
  let targetJobId = jobId;

  if (!targetJobId) {
    const result = await client.getRecentJobs(20);
    if (!result.success) {
      vscode.window.showErrorMessage(`Failed to fetch runs: ${result.error}`);
      return;
    }

    if (result.data.length === 0) {
      vscode.window.showInformationMessage('No runs found.');
      return;
    }

    const items = result.data.map((job) => ({
      label: `#${job.data.issueNumber} - ${job.data.repoOwner}/${job.data.repoName}`,
      description: job.state,
      detail: `Job: ${job.id}`,
      jobId: job.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a run to view details',
    });

    if (!selected) {
      return;
    }

    targetJobId = selected.jobId;
  }

  const result = await client.getJobStatus(targetJobId);
  if (!result.success) {
    vscode.window.showErrorMessage(`Failed to fetch job details: ${result.error}`);
    return;
  }

  const job = result.data;
  const lines = [
    '=== CodePilot Run Details ===',
    '',
    `ID:          ${job.id}`,
    `State:       ${job.state}`,
    `Issue:       ${job.data.repoOwner}/${job.data.repoName}#${job.data.issueNumber}`,
    `Issue URL:   ${job.data.issueUrl}`,
    `Triggered:   ${job.data.triggeredBy}`,
    `Attempts:    ${job.attemptsMade}`,
    `Created:     ${new Date(job.createdAt).toISOString()}`,
  ];

  if (job.finishedAt) {
    lines.push(`Finished:    ${new Date(job.finishedAt).toISOString()}`);
    const durationMs = job.finishedAt - job.createdAt;
    lines.push(`Duration:    ${(durationMs / 1000).toFixed(1)}s`);
  }

  if (job.result) {
    lines.push('');
    lines.push('--- Result ---');
    lines.push(`Success:     ${job.result.success}`);
    lines.push(`Cost:        $${job.result.totalCostUsd.toFixed(4)}`);
    lines.push(`Latency:     ${(job.result.totalLatencyMs / 1000).toFixed(1)}s`);
    if (job.result.prUrl) {
      lines.push(`PR URL:      ${job.result.prUrl}`);
    }
    if (job.result.safetyScore !== undefined) {
      lines.push(`Safety:      ${job.result.safetyScore}`);
    }
    if (job.result.error) {
      lines.push(`Error:       ${job.result.error}`);
    }
  }

  if (job.failedReason) {
    lines.push('');
    lines.push(`Failed Reason: ${job.failedReason}`);
  }

  outputChannel.clear();
  outputChannel.appendLine(lines.join('\n'));
  outputChannel.show();
}
