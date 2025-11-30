export default function DashboardLoading() {
  return (
    <div className="h-full bg-gray-50">
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6">
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
              <div className="mt-2 h-8 w-16 rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>

        {/* Charts skeleton */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
            <div className="mt-2 h-3 w-24 rounded bg-gray-100 animate-pulse" />
            <div className="mt-4 h-32 w-full rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-20 rounded bg-gray-200 animate-pulse" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-8 rounded bg-gray-100 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                    <div className="mt-1 h-3 w-20 rounded bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

