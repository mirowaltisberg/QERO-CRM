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
        <span className="text-xs text-gray-400">{contacts.length} scheduled</span>
      </div>
      <ul className="mt-4 space-y-3 text-sm text-gray-700">
        {contacts.map((contact) => (
          <li key={contact.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2">
            <div className="space-y-1">
              <p className="font-medium text-gray-900">{contact.company_name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{contact.contact_name}</span>
                <CantonTag canton={contact.canton} size="sm" />
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p className="font-medium text-gray-900">{contact.follow_up_at ? formatFollowUp(contact.follow_up_at) : "Due now"}</p>
              <p className="text-xs text-gray-400">
                {contact.follow_up_note ? truncate(contact.follow_up_note) : contact.notes ? truncate(contact.notes) : "No note"}
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

function formatFollowUp(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

