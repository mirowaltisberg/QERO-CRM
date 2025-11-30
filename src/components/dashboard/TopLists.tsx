"use client";

interface TopListItem {
  id: string;
  name: string;
  contactCount: number;
  callCount: number;
}

interface TopListsProps {
  items: TopListItem[];
}

export function TopLists({ items }: TopListsProps) {
  return (
    <div className="card-surface border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Top Lists</p>
          <p className="text-sm text-gray-500">By contact volume</p>
        </div>
        <span className="text-xs text-gray-400">Ranked</span>
      </div>
      <ul className="mt-4 space-y-3">
        {items.slice(0, 5).map((list, index) => (
          <li key={list.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {index + 1}. {list.name}
              </p>
              <p className="text-xs text-gray-400">{list.callCount} calls logged</p>
            </div>
            <span className="text-sm text-gray-500">{list.contactCount} contacts</span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-gray-400">No lists yet.</li>
        )}
      </ul>
    </div>
  );
}


