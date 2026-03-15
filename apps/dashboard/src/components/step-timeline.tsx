import type { RunStep } from '@/lib/mock-data';
import { StatusBadge } from './status-badge';

interface StepTimelineProps {
  readonly steps: readonly RunStep[];
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StepIcon({ status }: { readonly status: RunStep['status'] }) {
  const base = 'flex h-8 w-8 items-center justify-center rounded-full text-sm';
  switch (status) {
    case 'completed':
      return (
        <div className={`${base} bg-emerald-500/20 text-emerald-400`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    case 'failed':
      return (
        <div className={`${base} bg-red-500/20 text-red-400`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case 'running':
      return (
        <div className={`${base} bg-blue-500/20 text-blue-400`}>
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      );
    case 'pending':
      return (
        <div className={`${base} bg-zinc-700/50 text-zinc-500`}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
      );
  }
}

export function StepTimeline({ steps }: StepTimelineProps) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <div key={step.name} className="relative flex gap-4">
            {/* Vertical line */}
            {!isLast && (
              <div className="absolute left-4 top-10 h-[calc(100%-1rem)] w-px bg-zinc-700" />
            )}

            {/* Icon */}
            <div className="relative z-10 flex-shrink-0">
              <StepIcon status={step.status} />
            </div>

            {/* Content */}
            <div className="flex-1 pb-6">
              <div className="flex items-center gap-3">
                <span className="font-medium text-zinc-200">{step.label}</span>
                <StatusBadge status={step.status} />
                <span className="text-xs text-zinc-500">{formatDuration(step.durationMs)}</span>
              </div>
              {step.details && (
                <p className="mt-1 text-sm text-zinc-400">{step.details}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
