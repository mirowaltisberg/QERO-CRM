export default function CallingLoading() {
  return (
    <div className="flex h-full">
      {/* Left sidebar skeleton */}
      <aside className="flex h-full w-80 flex-col border-r border-gray-200 bg-gray-50">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
            <div className="mt-1 h-4 w-24 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-24 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-8 w-8 rounded-lg bg-gray-200 animate-pulse" />
          </div>
        </header>
        <div className="flex-1 p-2 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="h-5 w-12 rounded-full bg-gray-200 animate-pulse" />
              </div>
              <div className="mt-2 h-3 w-24 rounded bg-gray-100 animate-pulse" />
              <div className="mt-2 h-3 w-20 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      </aside>

      {/* Right detail skeleton */}
      <section className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
            <div className="mt-1 h-7 w-48 rounded bg-gray-200 animate-pulse" />
            <div className="mt-1 h-4 w-32 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-6 w-16 rounded-full bg-gray-200 animate-pulse" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className="h-3 w-12 rounded bg-gray-100 animate-pulse" />
                <div className="mt-1 h-4 w-24 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
          <div className="mt-4 flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 w-28 rounded-xl bg-gray-200 animate-pulse" />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
          <div className="mt-4 h-32 w-full rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </section>
    </div>
  );
}

