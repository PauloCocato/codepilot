import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/header';
import { StatusBadge } from '@/components/status-badge';
import { StepTimeline } from '@/components/step-timeline';
import { DiffViewer } from '@/components/diff-viewer';
import { fetchRun } from '@/lib/api';

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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RunDetailPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { id } = await params;
  const run = await fetchRun(id);

  if (!run) {
    notFound();
  }

  return (
    <div className="flex flex-col">
      <Header
        title={`Run #${run.issueNumber}`}
        description={run.issueTitle}
        actions={
          <Link
            href="/runs"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Back to Runs
          </Link>
        }
      />

      <div className="space-y-8 p-8">
        {/* Metadata Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Status</span>
            <div className="mt-2">
              <StatusBadge status={run.status} size="md" />
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Duration</span>
            <p className="mt-2 text-xl font-bold text-zinc-100">{formatDuration(run.durationMs)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Cost</span>
            <p className="mt-2 text-xl font-bold text-zinc-100">${run.costUsd.toFixed(2)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Attempts</span>
            <p className="mt-2 text-xl font-bold text-zinc-100">{run.attempts}</p>
          </div>
        </div>

        {/* Links */}
        <div className="flex flex-wrap gap-4">
          <a
            href={run.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            View Issue
          </a>
          {run.prUrl && (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View Pull Request
            </a>
          )}
        </div>

        {/* Safety Score */}
        {run.safetyScore !== undefined && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="text-sm font-medium uppercase tracking-wider text-zinc-500">Safety Score</h3>
            <div className="mt-3 flex items-center gap-4">
              <span
                className={`text-3xl font-bold ${
                  run.safetyScore >= 90
                    ? 'text-emerald-400'
                    : run.safetyScore >= 70
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {run.safetyScore}%
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    run.safetyScore >= 90
                      ? 'bg-emerald-500'
                      : run.safetyScore >= 70
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${run.safetyScore}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step Timeline */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-6 text-sm font-medium uppercase tracking-wider text-zinc-500">Execution Steps</h3>
          <StepTimeline steps={run.steps} />
        </div>

        {/* Diff Viewer */}
        {run.patch && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Generated Patch</h3>
            <DiffViewer patch={run.patch} />
          </div>
        )}

        {/* Run Metadata */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Metadata</h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-zinc-500">Run ID</dt>
              <dd className="mt-1 font-mono text-sm text-zinc-300">{run.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Created At</dt>
              <dd className="mt-1 text-sm text-zinc-300">{formatDate(run.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Repository</dt>
              <dd className="mt-1 text-sm text-zinc-300">{run.repoOwner}/{run.repoName}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Issue Number</dt>
              <dd className="mt-1 text-sm text-zinc-300">#{run.issueNumber}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
