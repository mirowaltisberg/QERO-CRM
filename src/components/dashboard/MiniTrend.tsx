"use client";

interface MiniTrendProps {
  data: Array<{ date: string; count: number }>;
  title: string;
  subtitle?: string;
}

export function MiniTrend({ data, title, subtitle }: MiniTrendProps) {
  const maxValue = Math.max(...data.map((point) => point.count), 1);
  const points = data.map((point, index) => {
    const x = (index / (data.length - 1 || 1)) * 100;
    const y = 100 - (point.count / maxValue) * 100;
    return `${x},${y}`;
  });

  return (
    <div className="card-surface border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{title}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        <span className="text-sm font-medium text-gray-900">{data[data.length - 1]?.count ?? 0}</span>
      </div>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="mt-4 h-20 w-full">
        <polyline
          fill="none"
          stroke="#2563EB"
          strokeWidth="1.5"
          points={points.map((p) => `${p.split(",")[0]},${(parseFloat(p.split(",")[1]) / 100) * 30}`).join(" ")}
        />
        {points.map((point) => {
          const [x, y] = point.split(",").map(parseFloat);
          return (
            <circle
              key={point}
              cx={x}
              cy={(y / 100) * 30}
              r={1.2}
              fill="#2563EB"
              opacity={0.6}
            />
          );
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-gray-400">
        <span>{formatLabel(data[0]?.date)}</span>
        <span>{formatLabel(data[data.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function formatLabel(date?: string) {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


