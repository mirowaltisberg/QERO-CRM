"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("dashboard");
  return (
    <div className="card-surface border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">{t("topLists")}</p>
          <p className="text-sm text-gray-500">{t("byContactVolume")}</p>
        </div>
        <span className="text-xs text-gray-400">{t("ranked")}</span>
      </div>
      <ul className="mt-4 space-y-3">
        {items.slice(0, 5).map((list, index) => (
          <li key={list.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {index + 1}. {list.name}
              </p>
              <p className="text-xs text-gray-400">{list.callCount} {t("callsLogged")}</p>
            </div>
            <span className="text-sm text-gray-500">{list.contactCount} {t("contacts")}</span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-gray-400">{t("noListsYet")}</li>
        )}
      </ul>
    </div>
  );
}


