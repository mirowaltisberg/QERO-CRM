export default function ContactsLoading() {
  return (
    <section className="flex h-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-64 rounded-xl bg-gray-200 animate-pulse" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-16 rounded-lg bg-gray-200 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-10 w-32 rounded-xl bg-gray-200 animate-pulse" />
      </div>

      {/* Table skeleton */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th className="w-10 px-4 py-2">
                <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
              </th>
              {["Company", "Team", "Canton", "Status", "Last Call", "Notes"].map((col) => (
                <th key={col} className="px-4 py-2 text-left">
                  <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from({ length: 15 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 w-8 rounded bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-5 w-14 rounded-full bg-gray-200 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-20 rounded bg-gray-100 animate-pulse" />
                </td>
                <td className="px-4 py-3">
                  <div className="h-4 w-40 rounded bg-gray-100 animate-pulse" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

