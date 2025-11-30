"use client";

import { Button } from "@/components/ui/button";
import type { CallOutcome } from "@/lib/utils/constants";
import { CALL_OUTCOME_LABELS } from "@/lib/utils/constants";

const OUTCOME_ORDER: Array<{ outcome: CallOutcome; hint: string }> = [
  { outcome: "no_answer", hint: "1" },
  { outcome: "not_interested", hint: "2" },
  { outcome: "interested", hint: "3" },
  { outcome: "follow_up", hint: "4" },
  { outcome: "meeting_set", hint: "5" },
];

interface OutcomeButtonsProps {
  onSelect: (outcome: CallOutcome) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function OutcomeButtons({ onSelect, disabled, loading }: OutcomeButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {OUTCOME_ORDER.map(({ outcome, hint }) => (
        <Button
          key={outcome}
          variant="secondary"
          size="md"
          className="flex flex-col items-start gap-1 py-3 text-left text-sm font-medium"
          disabled={disabled || loading}
          onClick={() => onSelect(outcome)}
        >
          <span className="text-gray-900">{CALL_OUTCOME_LABELS[outcome]}</span>
          <span className="text-[11px] uppercase tracking-wide text-gray-400">
            Hotkey {hint}
          </span>
        </Button>
      ))}
    </div>
  );
}

