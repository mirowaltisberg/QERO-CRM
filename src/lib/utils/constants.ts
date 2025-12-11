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

export const ROLE_COLOR_SWATCHES = [
  "#2563EB",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#F97316",
  "#6B7280",
] as const;

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

/**
 * Vacancy Status Options
 */
export const VACANCY_STATUS = {
  OPEN: "open",
  INTERVIEWING: "interviewing",
  FILLED: "filled",
} as const;

export type VacancyStatus = (typeof VACANCY_STATUS)[keyof typeof VACANCY_STATUS];

export const VACANCY_STATUS_LIST = [
  VACANCY_STATUS.OPEN,
  VACANCY_STATUS.INTERVIEWING,
  VACANCY_STATUS.FILLED,
] as const;

export const VACANCY_STATUS_LABELS: Record<VacancyStatus, string> = {
  open: "Offen",
  interviewing: "Im Gespräch",
  filled: "Besetzt",
};

export const VACANCY_STATUS_COLORS: Record<VacancyStatus, string> = {
  open: "bg-blue-100 text-blue-700 border-blue-200",
  interviewing: "bg-amber-100 text-amber-700 border-amber-200",
  filled: "bg-green-100 text-green-700 border-green-200",
};

/**
 * Vacancy Candidate Status Options
 */
export const VACANCY_CANDIDATE_STATUS = {
  SUGGESTED: "suggested",
  CONTACTED: "contacted",
  INTERVIEWING: "interviewing",
  REJECTED: "rejected",
  HIRED: "hired",
} as const;

export type VacancyCandidateStatus = (typeof VACANCY_CANDIDATE_STATUS)[keyof typeof VACANCY_CANDIDATE_STATUS];

export const VACANCY_CANDIDATE_STATUS_LIST = [
  VACANCY_CANDIDATE_STATUS.SUGGESTED,
  VACANCY_CANDIDATE_STATUS.CONTACTED,
  VACANCY_CANDIDATE_STATUS.INTERVIEWING,
  VACANCY_CANDIDATE_STATUS.REJECTED,
  VACANCY_CANDIDATE_STATUS.HIRED,
] as const;

export const VACANCY_CANDIDATE_STATUS_LABELS: Record<VacancyCandidateStatus, string> = {
  suggested: "Vorgeschlagen",
  contacted: "Kontaktiert",
  interviewing: "Im Gespräch",
  rejected: "Abgelehnt",
  hired: "Eingestellt",
};

export const VACANCY_CANDIDATE_STATUS_COLORS: Record<VacancyCandidateStatus, string> = {
  suggested: "bg-gray-100 text-gray-700 border-gray-200",
  contacted: "bg-blue-100 text-blue-700 border-blue-200",
  interviewing: "bg-amber-100 text-amber-700 border-amber-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  hired: "bg-green-100 text-green-700 border-green-200",
};

/**
 * Vacancy Urgency Levels
 */
export const VACANCY_URGENCY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export type VacancyUrgency = (typeof VACANCY_URGENCY)[keyof typeof VACANCY_URGENCY];

export const VACANCY_URGENCY_LIST = [
  VACANCY_URGENCY.LOW,
  VACANCY_URGENCY.MEDIUM,
  VACANCY_URGENCY.HIGH,
] as const;

export const VACANCY_URGENCY_LABELS: Record<VacancyUrgency, string> = {
  1: "Kann warten",
  2: "Bald",
  3: "Sofort",
};

export const VACANCY_URGENCY_COLORS: Record<VacancyUrgency, { text: string; bg: string }> = {
  1: { text: "text-gray-500", bg: "bg-gray-100" },
  2: { text: "text-orange-600", bg: "bg-orange-100" },
  3: { text: "text-red-600", bg: "bg-red-100" },
};

/**
 * Driving License Options
 */
export const DRIVING_LICENSE = {
  NONE: "none",
  B: "B",
  BE: "BE",
  B_CAR: "B_car",
  BE_CAR: "BE_car",
} as const;

export type DrivingLicense = (typeof DRIVING_LICENSE)[keyof typeof DRIVING_LICENSE];

export const DRIVING_LICENSE_LIST = [
  DRIVING_LICENSE.NONE,
  DRIVING_LICENSE.B,
  DRIVING_LICENSE.BE,
  DRIVING_LICENSE.B_CAR,
  DRIVING_LICENSE.BE_CAR,
] as const;

export const DRIVING_LICENSE_LABELS: Record<DrivingLicense, string> = {
  none: "Keine Autoprüfung",
  B: "Autoprüfung",
  BE: "Autoprüfung (BE)",
  B_car: "Autoprüfung + Auto",
  BE_car: "Autoprüfung (BE) + Auto",
};

export const DRIVING_LICENSE_SHORT: Record<DrivingLicense, string> = {
  none: "Nein",
  B: "Ja",
  BE: "BE",
  B_car: "Ja + Auto",
  BE_car: "BE + Auto",
};

/**
 * Experience Level Options
 */
export const EXPERIENCE_LEVEL = {
  LESS_THAN_1: "less_than_1",
  MORE_THAN_1: "more_than_1",
  MORE_THAN_3: "more_than_3",
} as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVEL)[keyof typeof EXPERIENCE_LEVEL];

export const EXPERIENCE_LEVEL_LIST = [
  EXPERIENCE_LEVEL.LESS_THAN_1,
  EXPERIENCE_LEVEL.MORE_THAN_1,
  EXPERIENCE_LEVEL.MORE_THAN_3,
] as const;

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  less_than_1: "< 1 Jahr",
  more_than_1: "> 1 Jahr",
  more_than_3: "> 3 Jahre",
};

export const EXPERIENCE_LEVEL_FULL_LABELS: Record<ExperienceLevel, string> = {
  less_than_1: "Weniger als 1 Jahr",
  more_than_1: "Mehr als 1 Jahr",
  more_than_3: "Mehr als 3 Jahre",
};

export const EXPERIENCE_LEVEL_COLORS: Record<ExperienceLevel, { bg: string; text: string; border: string }> = {
  less_than_1: { bg: "bg-gray-100", text: "text-gray-600", border: "border-gray-200" },
  more_than_1: { bg: "bg-blue-100", text: "text-blue-600", border: "border-blue-200" },
  more_than_3: { bg: "bg-emerald-100", text: "text-emerald-600", border: "border-emerald-200" },
};

