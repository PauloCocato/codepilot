interface StatCardProps {
  readonly label: string;
  readonly value: string | number;
  readonly icon: React.ReactNode;
  readonly trend?: string;
  readonly trendColor?: 'green' | 'red' | 'yellow';
}

export function StatCard({ label, value, icon, trend, trendColor = 'green' }: StatCardProps) {
  const trendColorClass = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    yellow: 'text-amber-400',
  }[trendColor];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-400">{label}</span>
        <span className="text-zinc-500">{icon}</span>
      </div>
      <div className="mt-3">
        <span className="text-3xl font-bold tracking-tight text-zinc-100">{value}</span>
      </div>
      {trend && (
        <div className="mt-2">
          <span className={`text-xs font-medium ${trendColorClass}`}>{trend}</span>
        </div>
      )}
    </div>
  );
}
