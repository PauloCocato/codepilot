import type { RunStatus, StepStatus } from '@/lib/mock-data';

type BadgeStatus = RunStatus | StepStatus;

interface StatusBadgeProps {
  readonly status: BadgeStatus;
  readonly size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<BadgeStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  failed: 'bg-red-500/15 text-red-400 border-red-500/25',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  pending: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/25',
};

const STATUS_LABELS: Record<BadgeStatus, string> = {
  success: 'Success',
  completed: 'Completed',
  failed: 'Failed',
  running: 'Running',
  pending: 'Pending',
};

export function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${STATUS_STYLES[status]} ${sizeClass}`}
    >
      {status === 'running' && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}
