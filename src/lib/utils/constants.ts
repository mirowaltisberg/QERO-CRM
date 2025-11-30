/**
 * Contact Status Options
 */
export const CONTACT_STATUS = {
  NEW: "new",
  CALLED: "called",
  INTERESTED: "interested",
  NOT_INTERESTED: "not_interested",
  FOLLOW_UP: "follow_up",
  WRONG_NUMBER: "wrong_number",
} as const;

export type ContactStatus = (typeof CONTACT_STATUS)[keyof typeof CONTACT_STATUS];

export const CONTACT_STATUS_LIST = [
  CONTACT_STATUS.NEW,
  CONTACT_STATUS.CALLED,
  CONTACT_STATUS.INTERESTED,
  CONTACT_STATUS.NOT_INTERESTED,
  CONTACT_STATUS.FOLLOW_UP,
  CONTACT_STATUS.WRONG_NUMBER,
] as const;

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  called: "Called",
  interested: "Interested",
  not_interested: "Not Interested",
  follow_up: "Follow-up",
  wrong_number: "Wrong Number",
};

export const CONTACT_STATUS_COLORS: Record<ContactStatus, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  called: "bg-gray-100 text-gray-700 border-gray-200",
  interested: "bg-green-100 text-green-700 border-green-200",
  not_interested: "bg-red-100 text-red-700 border-red-200",
  follow_up: "bg-yellow-100 text-yellow-700 border-yellow-200",
  wrong_number: "bg-gray-100 text-gray-500 border-gray-200",
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

