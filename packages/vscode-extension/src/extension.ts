import * as vscode from 'vscode';
import { CodePilotApiClient } from './api/client';
import { StatusBarManager } from './status-bar/status-bar';
import { RunsTreeProvider } from './views/runs-tree-provider';
import { Poller } from './polling/poller';
import { resolveIssue } from './commands/resolve-issue';
import { showActiveRuns } from './commands/show-active-runs';
import { showRunDetails } from './commands/show-run-details';
import { configureServer } from './commands/configure-server';

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('codepilot');
  const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000');
  const pollingInterval = config.get<number>('pollingInterval', 10);
  const notifications = config.get<boolean>('notifications', true);

  const client = new CodePilotApiClient(serverUrl);
  const statusBar = new StatusBarManager();
  const treeProvider = new RunsTreeProvider();
  const poller = new Poller(client, pollingInterval * 1000);

  vscode.window.registerTreeDataProvider('codepilotRuns', treeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('codepilot.resolveIssue', () => resolveIssue(client)),
    vscode.commands.registerCommand('codepilot.showActiveRuns', () => showActiveRuns(client)),
    vscode.commands.registerCommand('codepilot.showRunDetails', () => showRunDetails(client)),
    vscode.commands.registerCommand('codepilot.configureServer', configureServer),
    statusBar,
  );

  poller.on('statsUpdated', (jobs, stats) => {
    treeProvider.refresh(jobs, stats);
    const activeCount = jobs.filter(
      (j: { state: string }) => j.state === 'active' || j.state === 'waiting',
    ).length;
    statusBar.updateConnected(activeCount);
  });

  poller.on('runCompleted', (job) => {
    if (notifications) {
      const prUrl = job.result?.prUrl;
      if (prUrl) {
        vscode.window
          .showInformationMessage(
            `CodePilot: Issue #${job.data.issueNumber} resolved! PR created.`,
            'Open PR',
          )
          .then((action) => {
            if (action === 'Open PR') {
              vscode.env.openExternal(vscode.Uri.parse(prUrl));
            }
          });
      } else {
        vscode.window.showInformationMessage(
          `CodePilot: Issue #${job.data.issueNumber} completed.`,
        );
      }
    }
  });

  poller.on('runFailed', (job) => {
    if (notifications) {
      vscode.window.showErrorMessage(
        `CodePilot: Issue #${job.data.issueNumber} failed. ${job.failedReason ?? 'Unknown error'}`,
      );
    }
  });

  poller.on('connectionChanged', (connected: boolean) => {
    if (connected) {
      statusBar.updateConnected(0);
    } else {
      statusBar.updateDisconnected();
    }
  });

  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('codepilot.serverUrl')) {
      const newConfig = vscode.workspace.getConfiguration('codepilot');
      const newUrl = newConfig.get<string>('serverUrl', 'http://localhost:3000');
      client.updateServerUrl(newUrl);
      poller.stop();
      poller.start();
    }

    if (e.affectsConfiguration('codepilot.pollingInterval')) {
      const newConfig = vscode.workspace.getConfiguration('codepilot');
      const newInterval = newConfig.get<number>('pollingInterval', 10);
      poller.stop();
      poller.setInterval(newInterval * 1000);
      poller.start();
    }
  });

  context.subscriptions.push(configListener);

  poller.start();
  context.subscriptions.push({ dispose: () => poller.dispose() });
}

export function deactivate(): void {
  // cleanup handled by dispose
}
