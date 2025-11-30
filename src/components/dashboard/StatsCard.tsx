"use client";

interface StatsCardProps {
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
}

export function StatsCard({ label, value, delta, hint }: StatsCardProps) {
  return (
    <div className="card-surface border border-gray-100 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-gray-900">{value}</span>
        {delta && <span className="text-xs font-medium text-gray-400">({delta})</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}


