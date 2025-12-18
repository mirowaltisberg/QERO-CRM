"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils/cn";

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
  type: "major" | "minor" | "patch";
}

// Changelog data - newest first
const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.50.0",
    date: "2025-12-18",
    type: "minor",
    changes: [
      "Calling: Quick candidate finder - search by TMA role to find matching candidates",
      "Candidates sorted by distance to the active contact",
      "Points-based scoring with breakdown (role match, quality, experience, docs)",
      "Optional AI scoring mode for smarter matching",
      "Click to open candidate Kurzprofil PDF preview",
    ],
  },
  {
    version: "1.37.0",
    date: "2025-12-15",
    type: "minor",
    changes: [
      "Two-Factor Authentication (2FA): Enable Google Authenticator for enhanced security",
      "MFA setup in Settings with QR code scanning",
      "Two-step login flow: password + 6-digit code when 2FA is enabled",
      "Secure TOTP-based authentication compatible with all authenticator apps",
      "Enable/disable 2FA from Account Settings",
    ],
  },
  {
    version: "1.36.0",
    date: "2025-12-15",
    type: "minor",
    changes: [
      "iOS Mobile Optimization: App now feels native on iPhone 16 Pro/Pro Max",
      "Floating tab bar with rounded corners that doesn't clip on iPhone corners",
      "Added 'More' tab with bottom sheet for Vacancies, Dashboard, Settings",
      "Email redesigned for mobile with list/detail slide navigation",
      "Proper iOS PWA safe-area support (viewport-fit: cover, 100dvh)",
      "All pages updated with consistent safe-area padding",
    ],
  },
  {
    version: "1.35.7",
    date: "2025-12-15",
    type: "patch",
    changes: [
      "Fixed: Search now works in Calling tab when TMA candidate is selected",
      "Company list properly filters by search query in candidate mode",
    ],
  },
  {
    version: "1.35.6",
    date: "2025-12-15",
    type: "patch",
    changes: [
      "Fixed: 'Neue Ansprechperson' modal now stays open when clicking inputs",
      "Sheet component now uses non-modal mode to allow nested portaled modals",
      "Overlay click-to-close preserved with nested modal protection",
    ],
  },
  {
    version: "1.35.1",
    date: "2025-12-15",
    type: "patch",
    changes: [
      "Ansprechpersonen now shown inline as chips in header (no click required)",
      "Contact persons display name + initial, colored blue chips",
      "Shows up to 3 contact persons, with +N badge for more",
      "Realtime updates when contact persons are added/removed",
      "Add button shows dashed border when no contact persons exist",
    ],
  },
  {
    version: "1.35.0",
    date: "2025-12-15",
    type: "major",
    changes: [
      "Complete Calling UI redesign — Apple-native minimalist aesthetic",
      "Frosted sticky header with company info, status controls, and actions",
      "New segmented control for status (Working/Hot) with sliding pill indicator",
      "Ansprechpersonen moved to slide-over drawer (Apple-style sheet)",
      "Compact info chips for phone, email, canton, and location",
      "Notes panel now dominates the workspace — maximum visual priority",
      "Travel time widget integrated inline in header when candidate selected",
      "Vacancy indicator as compact banner in header",
      "Smooth 300ms drawer animations with backdrop blur",
    ],
  },
  {
    version: "1.34.0",
    date: "2025-12-14",
    type: "major",
    changes: [
      "Complete Calling tab UI redesign — Notes-first Apple-native workspace",
      "Notes now dominate the visual hierarchy with typographic timeline",
      "Date-grouped notes (Today, Yesterday, dates) with minimal chrome",
      "New Inspector drawer: status, follow-up, people, vacancies, travel in one panel",
      "Focus mode (F key): hide everything except notes and minimal header",
      "Keyboard shortcuts: I for Inspector, F for Focus, N for notes composer",
      "Radically minimalist, calm, distraction-free interface",
    ],
  },
  {
    version: "1.33.0",
    date: "2025-12-14",
    type: "minor",
    changes: [
      "PDF Preview: Fullscreen now shows entire page (fit-to-page)",
      "Highlighter tool: semi-transparent marker for highlighting",
      "Select/Move tool: click and drag to reposition annotations",
      "Fixed: annotations no longer drift when changing view sizes",
      "Annotations now use normalized coordinates for stability",
      "Legacy annotations are automatically migrated",
    ],
  },
  {
    version: "1.32.1",
    date: "2025-12-14",
    type: "patch",
    changes: [
      "PDF Preview: resizable window (normal, large, fullscreen)",
      "Auto-save: annotations save automatically after each edit",
      "Save status indicator shows when annotations are saved",
    ],
  },
  {
    version: "1.32.0",
    date: "2025-12-14",
    type: "minor",
    changes: [
      "PDF Preview for Short Profile (Kurzprofil) with annotation tools",
      "Draw on PDFs with pen tool, add text notes at any position",
      "Annotations are saved and persist across sessions",
      "Annotations are for viewing only - never sent with emails",
    ],
  },
  {
    version: "1.31.1",
    date: "2025-12-14",
    type: "patch",
    changes: [
      "TMA CSV import now captures ALL phone numbers from multiple fields",
      "Phone numbers from Telefon privat, Mobiltelefon, Handy, etc. are combined",
    ],
  },
  {
    version: "1.31.0",
    date: "2025-12-14",
    type: "minor",
    changes: [
      "Drag & drop file upload for TMA documents (CV, Zeugnisse, Short Profile, etc.)",
      "Smooth animations when dragging files over document slots",
      "Confirmation modal before replacing existing documents",
      "Improved validation with inline error messages for file type/size",
    ],
  },
  {
    version: "1.30.1",
    date: "2025-12-14",
    type: "patch",
    changes: [
      "Redesigned travel time buttons with logo-only icons",
      "Car button with blue car icon, ÖV button with official SBB logo",
      "Time displays next to logo when calculated",
    ],
  },
  {
    version: "1.30.0",
    date: "2025-12-14",
    type: "minor",
    changes: [
      "Travel time widget: see drive time (Auto) and public transport time (ÖV) from TMA to company",
      "Click on travel time to open route in Google Maps",
      "Uses OpenRouteService for driving and Swiss transport API for public transport",
    ],
  },
  {
    version: "1.29.0",
    date: "2025-12-14",
    type: "minor",
    changes: [
      "Added gender selection (Geschlecht) for contact persons",
      "Personalized email greetings: 'Sehr geehrter Herr...' / 'Sehr geehrte Frau...'",
      "Unknown gender now falls back to company team greeting",
    ],
  },
  {
    version: "1.28.3",
    date: "2025-12-14",
    type: "patch",
    changes: [
      "Fixed: contact person emails now normalized, deduped, and validated",
      "Send response returns attempted/sent/failed recipients to UI",
      "UI shows partial failures with warning (no silent success)",
      "Shortened Graph error messages per recipient for clarity",
    ],
  },
  {
    version: "1.28.2",
    date: "2025-01-14",
    type: "patch",
    changes: [
      "Fixed: Better email diagnostics - shows exactly what was sent",
      "Email validation: normalized addresses (trim + lowercase)",
      "UI shows detailed send results: successful + failed recipients",
      "Debug info returned from backend for troubleshooting",
    ],
  },
  {
    version: "1.28.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Individual emails sent to each contact person with personalized greeting",
      "Company email gets 'Sehr geehrtes [Firma] Team'",
      "Each Ansprechperson gets 'Sehr geehrter Herr/Frau [Name]'",
    ],
  },
  {
    version: "1.27.3",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Standard email draft pre-generated in background when TMA selected",
      "Instant load when clicking 'Email schicken' (no wait)",
    ],
  },
  {
    version: "1.27.2",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Fixed greeting format: 'Sehr geehrter Herr/Frau' for contacts",
      "No contact person: 'Sehr geehrtes [Firmenname] Team'",
    ],
  },
  {
    version: "1.27.1",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "New QERO sales-style prompts: brutal, direct, pressure",
      "Email validator with 1 retry (no bulletpoints, no headers, max 170 words)",
      "Betreff: format enforced in AI output",
      "Kurzprofil + AGB always mentioned in emails",
    ],
  },
  {
    version: "1.27.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "2-stage email drafting: Standard (cached) + Best (with company research)",
      "Standard drafts are generated and cached on first selection",
      "Best drafts run web research for personalized emails",
      "Greeting is injected dynamically at send-time based on Ansprechperson",
      "Research confidence indicator (High/Medium/Low)",
    ],
  },
  {
    version: "1.26.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Send all assigned vacancy candidates via AI-generated email",
      "Fast/Best quality AI buttons for vacancy emails",
      "Candidate PDFs attached automatically to vacancy emails",
    ],
  },
  {
    version: "1.25.1",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Shimmer animation in email field while AI is generating",
      "Fixed button states - only clicked button shows loading",
    ],
  },
  {
    version: "1.25.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Two AI draft buttons: Fast (GPT-4o-mini) and Best (GPT-5-mini)",
      "Fast mode for quick drafts, Best mode for higher quality",
    ],
  },
  {
    version: "1.24.3",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Call check reduced to 48 hours (was 7 days)",
      "Added reasoning: { effort: 'low' } for faster AI responses",
    ],
  },
  {
    version: "1.24.2",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "AI email intro based on call history",
      "Uses 'Wie besprochen' only if call was logged",
      "Uses 'Gerne möchte ich vorstellen' for cold outreach",
    ],
  },
  {
    version: "1.24.1",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Fixed: Use 'input_text' type instead of 'text' for GPT-5",
    ],
  },
  {
    version: "1.24.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Switched to GPT-5 Responses API (gpt-5-mini-2025-08-07)",
      "Fixed empty responses by reading output_text instead of choices",
    ],
  },
  {
    version: "1.23.7",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Reverted to GPT-4o-mini (gpt-5-mini returned empty responses)",
    ],
  },
  {
    version: "1.23.6",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Increased max_completion_tokens for email generation",
      "Added better error logging for AI debugging",
    ],
  },
  {
    version: "1.23.5",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Removed temperature param (GPT-5 mini only supports default)",
    ],
  },
  {
    version: "1.23.4",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Fixed: Use max_completion_tokens for GPT-5 mini",
    ],
  },
  {
    version: "1.23.3",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "GPT-5 mini full compatibility (temperature, max_tokens)",
      "Added token usage logging for cost monitoring",
      "Added model rollback via environment variables",
      "Improved prompts with explicit constraints",
    ],
  },
  {
    version: "1.23.2",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Removed temperature parameter for GPT-5 mini compatibility",
    ],
  },
  {
    version: "1.23.1",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Fixed GPT-5 mini API parameter (max_completion_tokens)",
    ],
  },
  {
    version: "1.23.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Added Changelog in Settings",
      "Version history with all updates",
    ],
  },
  {
    version: "1.22.2",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "Upgraded AI to GPT-5 mini for better matching quality",
    ],
  },
  {
    version: "1.22.1",
    date: "2025-01-13",
    type: "patch",
    changes: [
      "AI Matching now uses all TMA data (position, experience, notes, etc.)",
      "Improved AI prompts for better candidate scoring",
    ],
  },
  {
    version: "1.22.0",
    date: "2025-01-13",
    type: "minor",
    changes: [
      "Added AI Candidate-Vacancy Matching feature",
      "New AI tab in Vakanzen with scoring and match explanations",
      "AI analyzes Kurzprofile PDFs and TMA data",
    ],
  },
  {
    version: "1.21.1",
    date: "2025-01-12",
    type: "patch",
    changes: [
      "Fixed AI email generation with few-shot prompting",
      "Improved email quality and style consistency",
    ],
  },
  {
    version: "1.21.0",
    date: "2025-01-12",
    type: "minor",
    changes: [
      "Added AI-powered email generation for TMA emails",
      "AI reads Kurzprofile PDF and personalizes email content",
      "Integrated OpenAI GPT-4o-mini for email drafting",
    ],
  },
  {
    version: "1.20.1",
    date: "2025-01-11",
    type: "patch",
    changes: [
      "Fixed signature being sent twice in emails",
      "Fixed raw HTML showing in editable email body",
    ],
  },
  {
    version: "1.20.0",
    date: "2025-01-11",
    type: "minor",
    changes: [
      "Email subject and body now editable before sending",
      "Added ability to attach multiple candidate profiles",
      "Candidate profiles renamed to 'KP - First Last.pdf'",
      "AGB-QERO.pdf automatically attached to TMA emails",
    ],
  },
  {
    version: "1.19.1",
    date: "2025-01-10",
    type: "patch",
    changes: [
      "Fixed candidate search to work with any name order",
      "Improved search across first/last name combinations",
    ],
  },
  {
    version: "1.19.0",
    date: "2025-01-10",
    type: "minor",
    changes: [
      "Added call tracking per candidate in Calling mode",
      "Calls now show which candidate they were made for",
    ],
  },
  {
    version: "1.18.1",
    date: "2025-01-09",
    type: "patch",
    changes: [
      "Fixed distance filter in Candidate Calling Mode",
      "Improved company sorting by distance",
    ],
  },
  {
    version: "1.18.0",
    date: "2025-01-09",
    type: "minor",
    changes: [
      "Added Candidate Calling Mode with distance-based sorting",
      "Companies sorted by proximity to selected candidate",
      "Distance badges shown next to company names",
      "Distance filter (10km, 25km, 50km, All)",
      "Selected candidate persisted in localStorage",
    ],
  },
  {
    version: "1.17.0",
    date: "2025-01-08",
    type: "minor",
    changes: [
      "Added recipient autocomplete for To, Cc, Bcc fields",
      "Unified search across contacts, TMA candidates, and users",
      "Added Bcc field to email composer",
    ],
  },
  {
    version: "1.16.1",
    date: "2025-01-07",
    type: "patch",
    changes: [
      "Fixed email body content being cut off",
      "Improved email hydration from Microsoft Graph",
    ],
  },
  {
    version: "1.16.0",
    date: "2025-01-07",
    type: "minor",
    changes: [
      "Major email client improvements",
      "Fixed 'An Unbekannt' sender display in sent emails",
      "Improved folder-based thread filtering",
      "Added on-demand message body hydration",
    ],
  },
  {
    version: "1.15.0",
    date: "2025-01-05",
    type: "minor",
    changes: [
      "Added email integration with Microsoft Outlook",
      "Email sync, compose, reply, and folder management",
      "Customizable email signatures",
    ],
  },
  {
    version: "1.14.0",
    date: "2025-01-03",
    type: "minor",
    changes: [
      "Added Vakanzen (Vacancies) module",
      "Rule-based candidate matching with scoring",
      "Vacancy-candidate assignment workflow",
    ],
  },
  {
    version: "1.13.0",
    date: "2024-12-28",
    type: "minor",
    changes: [
      "Added TMA (Temporärmitarbeiter) management",
      "Candidate profiles with Kurzprofile PDFs",
      "Quality ratings (A/B/C) and activity status",
    ],
  },
  {
    version: "1.12.0",
    date: "2024-12-20",
    type: "minor",
    changes: [
      "Added Calling module for company outreach",
      "Call logging with outcomes tracking",
      "Contact notes and follow-up reminders",
    ],
  },
  {
    version: "1.11.0",
    date: "2024-12-15",
    type: "minor",
    changes: [
      "Added Contact management",
      "Company import from CSV",
      "Contact persons with phone/email",
    ],
  },
  {
    version: "1.10.0",
    date: "2024-12-10",
    type: "minor",
    changes: [
      "Added Chat feature",
      "Real-time messaging between team members",
      "File attachments in chat",
    ],
  },
  {
    version: "1.0.0",
    date: "2024-12-01",
    type: "major",
    changes: [
      "Initial release of QERO CRM",
      "Dashboard with overview",
      "User authentication and profiles",
      "Team management",
    ],
  },
];

export function Changelog() {
  const [expanded, setExpanded] = useState(false);
  const displayedEntries = expanded ? CHANGELOG : CHANGELOG.slice(0, 5);

  return (
    <Panel title="Changelog" description="Version history and updates">
      <div className="space-y-4">
        {displayedEntries.map((entry) => (
          <div key={entry.version} className="relative pl-4 border-l-2 border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono font-semibold",
                entry.type === "major" && "bg-purple-100 text-purple-700",
                entry.type === "minor" && "bg-blue-100 text-blue-700",
                entry.type === "patch" && "bg-gray-100 text-gray-600"
              )}>
                v{entry.version}
              </span>
              <span className="text-xs text-gray-400">{entry.date}</span>
            </div>
            <ul className="space-y-0.5">
              {entry.changes.map((change, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5">•</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {CHANGELOG.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
          >
            {expanded ? (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                Show less
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                Show all {CHANGELOG.length} versions
              </>
            )}
          </button>
        )}
      </div>
    </Panel>
  );
}

