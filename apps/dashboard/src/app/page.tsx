import Link from 'next/link';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { StatusBadge } from '@/components/status-badge';
import { fetchStats, fetchRecentActivity } from '@/lib/data';
import { isSupabaseConfigured } from '@/lib/supabase';

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
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  const [stats, recentRuns] = await Promise.all([
    fetchStats(),
    fetchRecentActivity(10),
  ]);

  const successRateColor: 'green' | 'yellow' | 'red' =
    stats.successRate >= 80 ? 'green' : stats.successRate >= 60 ? 'yellow' : 'red';

  const usingMockData = !isSupabaseConfigured();

  return (
    <div className="flex flex-col">
      <Header
        title="Dashboard"
        description="Overview of your CodePilot agent activity"
      />

      <div className="space-y-8 p-8">
        {/* Mock data banner */}
        {usingMockData && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Configure <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs">SUPABASE_URL</code> and{' '}
            <code className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs">SUPABASE_ANON_KEY</code> to see real data.
            Showing demo data.
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Runs"
            value={stats.totalRuns}
            trend="+12 this week"
            trendColor="green"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            }
          />
          <StatCard
            label="Success Rate"
            value={`${stats.successRate}%`}
            trend={stats.successRate >= 80 ? 'Above target' : 'Below target'}
            trendColor={successRateColor}
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Total Cost"
            value={`$${stats.totalCostUsd.toFixed(2)}`}
            trend={stats.totalRuns > 0 ? `~$${stats.avgCostUsd.toFixed(2)} per run` : 'No runs yet'}
            trendColor="green"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Active Runs"
            value={stats.activeRuns}
            trend={`${stats.activeRuns} in progress`}
            trendColor="green"
            icon={
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            }
          />
        </div>

        {/* Recent Runs */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
            <h2 className="text-lg font-semibold text-zinc-100">Recent Runs</h2>
            <Link
              href="/runs"
              className="text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300"
            >
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="px-6 py-3">Issue</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Cost</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {recentRuns.map((run) => (
                  <tr key={run.id} className="transition-colors hover:bg-zinc-800/30">
                    <td className="px-6 py-4">
                      <Link
                        href={`/runs/${run.id}`}
                        className="group flex flex-col"
                      >
                        <span className="text-sm font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors">
                          {run.issueTitle}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {run.repoOwner}/{run.repoName}#{run.issueNumber}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      {formatDuration(run.durationMs)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-400">
                      ${run.costUsd.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-500">
                      {formatDate(run.createdAt)}
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
