"use client";

import type { Contact } from "@/lib/types";
import { CantonTag } from "@/components/ui/CantonTag";

interface FollowUpsListProps {
  contacts: Contact[];
}

export function FollowUpsList({ contacts }: FollowUpsListProps) {
  return (
    <div className="card-surface border border-gray-100 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Follow-ups</p>
          <p className="text-sm text-gray-500">Next actions</p>
        </div>
        <span className="text-xs text-gray-400">{contacts.length} due</span>
      </div>
      <ul className="mt-4 space-y-3 text-sm text-gray-700">
        {contacts.map((contact) => (
          <li key={contact.id} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{contact.company_name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{contact.contact_name}</span>
                <CantonTag canton={contact.canton} size="sm" />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">
                {contact.last_call
                  ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(contact.last_call))
                  : "No call"}
              </p>
              <p className="text-xs text-gray-500">
                {contact.notes ? truncate(contact.notes) : "Add note"}
              </p>
            </div>
          </li>
        ))}
        {contacts.length === 0 && (
          <li className="text-sm text-gray-400">You&apos;re caught up</li>
        )}
      </ul>
    </div>
  );
}

function truncate(text: string, max = 40) {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

