import Link from 'next/link';
import { Header } from '@/components/header';
import { StatusBadge } from '@/components/status-badge';
import { fetchRuns } from '@/lib/api';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function RunsPage() {
  const runs = await fetchRuns();

  return (
    <div className="flex flex-col">
      <Header
        title="Runs"
        description="All agent execution history"
      />

      <div className="p-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-6 py-4">Issue</th>
                  <th className="px-6 py-4">Repository</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Attempts</th>
                  <th className="px-6 py-4">Duration</th>
                  <th className="px-6 py-4">Cost</th>
                  <th className="px-6 py-4">Safety</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">PR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {runs.map((run) => (
                  <tr key={run.id} className="transition-colors hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <Link
                        href={`/runs/${run.id}`}
                        className="group flex flex-col"
                      >
                        <span className="text-sm font-medium text-zinc-200 transition-colors group-hover:text-emerald-400">
                          #{run.issueNumber} {run.issueTitle}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-zinc-400">
                        {run.repoOwner}/{run.repoName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {run.attempts}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {formatDuration(run.durationMs)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      ${run.costUsd.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      {run.safetyScore !== undefined ? (
                        <span
                          className={`text-sm font-medium ${
                            run.safetyScore >= 90
                              ? 'text-emerald-400'
                              : run.safetyScore >= 70
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }`}
                        >
                          {run.safetyScore}%
                        </span>
                      ) : (
                        <span className="text-sm text-zinc-600">--</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {formatDate(run.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      {run.prUrl ? (
                        <a
                          href={run.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-emerald-400 transition-colors hover:text-emerald-300"
                        >
                          View PR
                        </a>
                      ) : (
                        <span className="text-sm text-zinc-600">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
