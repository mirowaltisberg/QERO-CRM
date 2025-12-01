/**
 * Contact Status Options
 */
export const CONTACT_STATUS = {
  HOT: "hot",
  WORKING: "working",
  FOLLOW_UP: "follow_up",
} as const;

export type ContactStatus = (typeof CONTACT_STATUS)[keyof typeof CONTACT_STATUS];

export const CONTACT_STATUS_LIST = [
  CONTACT_STATUS.HOT,
  CONTACT_STATUS.WORKING,
  CONTACT_STATUS.FOLLOW_UP,
] as const;

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  hot: "Hot",
  working: "Working",
  follow_up: "Follow Up",
};

export const CONTACT_STATUS_COLORS: Record<ContactStatus, string> = {
  hot: "bg-rose-100 text-rose-700 border-rose-200",
  working: "bg-gray-100 text-gray-700 border-gray-200",
  follow_up: "bg-amber-100 text-amber-700 border-amber-200",
};

/**
 * TMA Candidate Quality Status (A/B/C)
 */
export const TMA_STATUS = {
  A: "A",
  B: "B",
  C: "C",
} as const;

export type TmaStatus = (typeof TMA_STATUS)[keyof typeof TMA_STATUS];

export const TMA_STATUS_LIST = [TMA_STATUS.A, TMA_STATUS.B, TMA_STATUS.C] as const;

export const TMA_STATUS_LABELS: Record<TmaStatus, string> = {
  A: "A (Top)",
  B: "B (Ok)",
  C: "C (Flop)",
};

export const TMA_STATUS_COLORS: Record<TmaStatus, string> = {
  A: "bg-green-100 text-green-700 border-green-200",
  B: "bg-amber-100 text-amber-700 border-amber-200",
  C: "bg-rose-100 text-rose-700 border-rose-200",
};

export const TMA_STATUS_STYLES: Record<TmaStatus, { bg: string; text: string; border: string }> = {
  A: { bg: "#0AAF50", text: "#0A3F21", border: "#0AAF50" },
  B: { bg: "#FFD147", text: "#6B4A00", border: "#FFD147" },
  C: { bg: "#F34B4B", text: "#5D0C0C", border: "#F34B4B" },
};

/**
 * TMA Activity Status (Active/Not Active)
 */
export const TMA_ACTIVITY = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;

export type TmaActivity = (typeof TMA_ACTIVITY)[keyof typeof TMA_ACTIVITY];

export const TMA_ACTIVITY_LABELS: Record<TmaActivity, string> = {
  active: "Active",
  inactive: "Not Active",
};

export const TMA_ACTIVITY_STYLES: Record<TmaActivity, { bg: string; text: string; border: string }> = {
  active: { bg: "#3B82F6", text: "#1E3A5F", border: "#3B82F6" },
  inactive: { bg: "#9CA3AF", text: "#374151", border: "#9CA3AF" },
};

/**
 * Call Outcome Options
 */
export const CALL_OUTCOME = {
  NO_ANSWER: "no_answer",
  NOT_INTERESTED: "not_interested",
  INTERESTED: "interested",
  FOLLOW_UP: "follow_up",
  MEETING_SET: "meeting_set",
  WRONG_NUMBER: "wrong_number",
} as const;

export type CallOutcome = (typeof CALL_OUTCOME)[keyof typeof CALL_OUTCOME];

export const CALL_OUTCOME_LIST = [
  CALL_OUTCOME.NO_ANSWER,
  CALL_OUTCOME.NOT_INTERESTED,
  CALL_OUTCOME.INTERESTED,
  CALL_OUTCOME.FOLLOW_UP,
  CALL_OUTCOME.MEETING_SET,
  CALL_OUTCOME.WRONG_NUMBER,
] as const;

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: "No Answer",
  not_interested: "Not Interested",
  interested: "Interested",
  follow_up: "Follow-up",
  meeting_set: "Meeting Set",
  wrong_number: "Wrong Number",
};

/**
 * Keyboard Shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
  NAVIGATE_UP: "k",
  NAVIGATE_DOWN: "j",
  CALL: "c",
  EDIT: "e",
  LOG: "l",
  COMMAND_PALETTE: "q",
  FOCUS_NOTES: "n",
  CONFIRM: "Enter",
  // Outcome shortcuts (1-5)
  OUTCOME_1: "1", // No Answer
  OUTCOME_2: "2", // Not Interested
  OUTCOME_3: "3", // Interested
  OUTCOME_4: "4", // Follow-up
  OUTCOME_5: "5", // Meeting Set
} as const;

/**
 * Swiss Cantons (for filtering)
 */
export const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH"
] as const;

export type SwissCanton = (typeof SWISS_CANTONS)[number];

