"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { CantonTag } from "@/components/ui/CantonTag";
import { Textarea } from "@/components/ui/textarea";
import type { Contact } from "@/lib/types";
import type { CallOutcome } from "@/lib/utils/constants";
import { OutcomeButtons } from "./OutcomeButtons";

interface ContactDetailProps {
  contact: Contact | null;
  onCall: () => void;
  onOutcome: (outcome: CallOutcome) => void;
  onNext: () => void;
  onSaveNotes: (value: string | null) => Promise<void>;
  notesRef: React.RefObject<HTMLTextAreaElement | null>;
  actionMessage?: string | null;
  actionType?: "logging" | "saving" | null;
}

export function ContactDetail({
  contact,
  onCall,
  onOutcome,
  onNext,
  onSaveNotes,
  notesRef,
  actionMessage,
  actionType,
}: ContactDetailProps) {
  const [notesValue, setNotesValue] = useState(contact?.notes ?? "");

  const displayPhone = useMemo(() => contact?.phone ?? "No phone number", [contact?.phone]);
  const displayEmail = useMemo(() => contact?.email ?? "No email", [contact?.email]);

  return (
    <AnimatePresence mode="wait">
      {contact ? (
        <motion.section
          key={contact.id}
          className="flex flex-1 flex-col gap-4 p-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Now calling</p>
          <h1 className="text-2xl font-semibold text-gray-900">{contact.company_name}</h1>
          <p className="text-sm text-gray-500">{contact.contact_name ?? "Hiring Team"}</p>
        </div>
        <Tag status={contact.status} />
      </div>

      <Panel
        title="Call"
        description="Press C to call instantly"
        actions={
          <Button onClick={onCall} size="lg">
            Call {contact.contact_name.split(" ")[0] ?? ""}
          </Button>
        }
      >
        <div className="grid gap-4 text-sm text-gray-600 md:grid-cols-3">
          <InfoBlock label="Phone" value={displayPhone} />
          <InfoBlock label="Email" value={displayEmail} />
          <InfoBlock label="Canton">
            <CantonTag canton={contact.canton} size="md" />
          </InfoBlock>
        </div>
      </Panel>

      <Panel title="Outcome" description="Log result with one tap">
        <OutcomeButtons onSelect={onOutcome} loading={actionType === "logging"} />
      </Panel>

      <Panel title="Notes" description="Autosaves every few seconds">
        <Textarea
          ref={notesRef}
          value={notesValue}
          onChange={(event) => setNotesValue(event.target.value)}
          onAutoSave={async (value) => {
            await onSaveNotes(value.trim().length ? value : null);
          }}
          autosaveDelay={800}
          placeholder="Add context, objections, next steps..."
        />
      </Panel>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {actionMessage ?? "J/K to move • C to call • 1-5 outcomes • N focus notes"}
        </div>
        <Button variant="ghost" onClick={onNext}>
          Next Company ↵
        </Button>
      </div>
    </motion.section>
      ) : (
        <motion.div
          key="empty"
          className="flex flex-1 items-center justify-center text-sm text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          Select a company to start calling.
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function InfoBlock({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="transition-all duration-300">
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      {children ? <div className="mt-1">{children}</div> : <p className="text-sm text-gray-900">{value}</p>}
    </div>
  );
}

