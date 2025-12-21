"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
  replyTo?: { threadId: string; messageId: string } | null;
  /** Pre-fill the To field when opening compose */
  initialTo?: string | null;
}

interface AttachmentFile {
  file: File;
  id: string;
}

interface RecipientSuggestion {
  type: "contact" | "tma" | "user";
  id: string;
  label: string;
  email: string;
  secondary?: string;
}

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "text/plain",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_TOTAL_SIZE = 25 * 1024 * 1024; // 25 MB total

// Email signature HTML
const EMAIL_SIGNATURE = `

--
Freundliche Grüsse

Miró Maximilian Waltisberg
Personalberater

Tel. M    +41 77 289 64 46
Tel. D    +41 58 510 57 64
E-Mail    m.waltisberg@qero.ch
Mehr Über mich

`;

// HTML signature for the actual email
const EMAIL_SIGNATURE_HTML = `
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p style="margin: 0;">Freundliche Grüsse</p>
  <br>
  <p style="margin: 0; font-weight: bold;">Miró Maximilian Waltisberg</p>
  <p style="margin: 0;">Personalberater</p>
  <br>
  <table style="font-size: 14px; color: #333;">
    <tr><td style="padding-right: 12px;">Tel. M</td><td><a href="tel:+41772896446" style="color: #333; text-decoration: none;">+41 77 289 64 46</a></td></tr>
    <tr><td style="padding-right: 12px;">Tel. D</td><td><a href="tel:+41585105764" style="color: #333; text-decoration: none;">+41 58 510 57 64</a></td></tr>
    <tr><td style="padding-right: 12px;">E-Mail</td><td><a href="mailto:m.waltisberg@qero.ch" style="color: #333; text-decoration: none;">m.waltisberg@qero.ch</a></td></tr>
  </table>
  <p style="margin: 8px 0;"><a href="https://www.qero.ch/team/miro-waltisberg" style="color: #333;">Mehr Über mich</a></p>
  <br>
  <a href="https://www.qero.ch" target="_blank">
    <img src="https://qero.international/qero-logo-email.png" alt="QERO - vermittelt Timing." style="max-width: 180px; height: auto;" />
  </a>
  <br><br>
  <p style="margin: 0; font-size: 12px; color: #666;">
    QERO AG | Ifangstrasse 91 | 8153 Rümlang | Tel <a href="tel:+41585105757" style="color: #666; text-decoration: none;">+41 58 510 57 57</a> | <a href="mailto:info@qero.ch" style="color: #666; text-decoration: none;">info@qero.ch</a> | <a href="https://www.qero.ch" style="color: #666; text-decoration: none;">www.qero.ch</a>
  </p>
</div>
`;

/**
 * Insert an email into a comma-separated list, avoiding duplicates
 */
export function insertEmailIntoList(currentValue: string, email: string): string {
  const emails = currentValue
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  
  // Avoid duplicates (case-insensitive)
  const emailLower = email.toLowerCase();
  if (emails.some((e) => e.toLowerCase() === emailLower)) {
    return currentValue;
  }
  
  emails.push(email);
  return emails.join(", ");
}

export function ComposeModal({ open, onClose, onSent, replyTo, initialTo }: Props) {
  const t = useTranslations("email");
  const tCommon = useTranslations("common");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signatureText, setSignatureText] = useState(EMAIL_SIGNATURE);
  const [signatureHtml, setSignatureHtml] = useState(EMAIL_SIGNATURE_HTML);

  // Fetch user's signature on mount
  useEffect(() => {
    async function fetchSignature() {
      try {
        const response = await fetch("/api/settings/signature");
        const json = await response.json();
        if (response.ok && json.data) {
          setSignatureText(json.data.signature_text || EMAIL_SIGNATURE);
          setSignatureHtml(json.data.signature_html || EMAIL_SIGNATURE_HTML);
        }
      } catch (err) {
        console.error("Failed to fetch signature:", err);
        // Keep defaults on error
      }
    }
    fetchSignature();
  }, []);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      // Pre-fill signature for new emails (not replies)
      if (!replyTo) {
        setBody(signatureText);
      }
      // Pre-fill To field if provided
      if (initialTo) {
        setTo(initialTo);
      }
    } else {
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setAttachments([]);
      setError(null);
      setShowCc(false);
      setShowBcc(false);
    }
  }, [open, replyTo, initialTo]);

  // If replying, pre-fill subject
  useEffect(() => {
    if (replyTo) {
      setSubject((prev) => (prev.startsWith("Re: ") ? prev : `Re: ${prev}`));
    }
  }, [replyTo]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachmentFile[] = [];
    const errors: string[] = [];

    // Calculate current total size
    const currentTotalSize = attachments.reduce((acc, a) => acc + a.file.size, 0);
    let newTotalSize = currentTotalSize;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`${file.name}: File type not allowed`);
        continue;
      }

      // Check individual file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 10 MB)`);
        continue;
      }

      // Check total size
      if (newTotalSize + file.size > MAX_TOTAL_SIZE) {
        errors.push(`${file.name}: Would exceed 25 MB total limit`);
        continue;
      }

      newTotalSize += file.size;
      newFiles.push({
        file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
    }

    if (errors.length > 0) {
      setError(errors.join("; "));
    } else {
      setError(null);
    }

    if (newFiles.length > 0) {
      setAttachments((prev) => [...prev, ...newFiles]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [attachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSend = useCallback(async () => {
    if (!to.trim()) {
      setError("Please enter at least one recipient");
      return;
    }
    if (!subject.trim()) {
      setError("Please enter a subject");
      return;
    }
    if (!body.trim()) {
      setError("Please enter a message");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const recipients = to.split(",").map((e) => e.trim()).filter(Boolean);
      const ccRecipients = cc ? cc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;
      const bccRecipients = bcc ? bcc.split(",").map((e) => e.trim()).filter(Boolean) : undefined;

      // Convert attachments to base64
      const attachmentData = await Promise.all(
        attachments.map(async (a) => {
          const buffer = await a.file.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return {
            name: a.file.name,
            contentType: a.file.type,
            contentBytes: base64,
          };
        })
      );

      // Build HTML body - replace plain text signature with HTML version
      let htmlBody = body;
      // Look for signature separator (two newlines followed by --)
      const sigSeparatorIdx = htmlBody.indexOf("\n\n--\n");
      if (sigSeparatorIdx !== -1) {
        // Split at signature and use HTML version
        const messageBody = htmlBody.substring(0, sigSeparatorIdx);
        htmlBody = `<div>${messageBody.replace(/\n/g, "<br>")}</div>${signatureHtml}`;
      } else {
        htmlBody = `<div>${body.replace(/\n/g, "<br>")}</div>`;
      }

      const response = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipients,
          cc: ccRecipients,
          bcc: bccRecipients,
          subject,
          body: htmlBody,
          replyToMessageId: replyTo?.messageId,
          attachments: attachmentData.length > 0 ? attachmentData : undefined,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to send email");
      }

      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, replyTo, attachments, onSent, signatureHtml]);

  const totalSize = attachments.reduce((acc, a) => acc + a.file.size, 0);

  return (
    <Modal open={open} onClose={sending ? () => {} : onClose}>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            {replyTo ? t("reply") : t("newEmail")}
          </h3>
          <p className="text-sm text-gray-500">
            {replyTo ? t("replyToConversation") : t("composeNewEmail")}
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {/* To field with autocomplete */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase text-gray-400">{t("to")}</label>
              <div className="flex gap-2">
                {!showCc && (
                  <button
                    type="button"
                    onClick={() => setShowCc(true)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cc
                  </button>
                )}
                {!showBcc && (
                  <button
                    type="button"
                    onClick={() => setShowBcc(true)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Bcc
                  </button>
                )}
              </div>
            </div>
            <RecipientInput
              value={to}
              onChange={setTo}
              placeholder={t("searchOrTypeEmail")}
            />
          </div>

          {/* Cc field with autocomplete */}
          {showCc && (
            <div>
              <label className="text-xs uppercase text-gray-400">{t("cc")}</label>
              <RecipientInput
                value={cc}
                onChange={setCc}
                placeholder={t("searchOrTypeEmail")}
              />
            </div>
          )}

          {/* Bcc field with autocomplete */}
          {showBcc && (
            <div>
              <label className="text-xs uppercase text-gray-400">{t("bcc")}</label>
              <RecipientInput
                value={bcc}
                onChange={setBcc}
                placeholder={t("searchOrTypeEmail")}
              />
            </div>
          )}

          <div>
            <label className="text-xs uppercase text-gray-400">{t("subject")}</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("subject")}
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-xs uppercase text-gray-400">{t("body")}</label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("writeMessage")}
              rows={8}
              className="mt-1"
            />
          </div>

          {/* Attachments section */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs uppercase text-gray-400">{t("attachments")}</label>
              <span className="text-xs text-gray-400">
                {formatBytes(totalSize)} / 25 MB
              </span>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt"
              className="hidden"
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-1 w-full rounded-lg border-2 border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition"
            >
              <span className="flex items-center justify-center gap-2">
                <AttachmentIcon className="h-4 w-4" />
                {t("clickToAttach")}
              </span>
            </button>

            {attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon type={a.file.type} />
                      <span className="truncate text-sm text-gray-700">{a.file.name}</span>
                      <span className="text-xs text-gray-400">({formatBytes(a.file.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="text-gray-400 hover:text-red-500 transition"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending...
              </>
            ) : (
              <>
                <SendIcon className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================
// RecipientInput with autocomplete
// ============================================

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function RecipientInput({ value, onChange, placeholder }: RecipientInputProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RecipientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Extract the "current token" being typed (after the last comma)
  const getCurrentToken = useCallback(() => {
    const parts = value.split(",");
    return parts[parts.length - 1].trim();
  }, [value]);

  // Search for recipients
  const searchRecipients = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/email/recipients?q=${encodeURIComponent(searchQuery)}&limit=10`);
      const json = await response.json();
      if (response.ok && json.data?.recipients) {
        setSuggestions(json.data.recipients);
        setShowSuggestions(json.data.recipients.length > 0);
        setHighlightIndex(-1);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Get the current token being typed
    const parts = newValue.split(",");
    const currentToken = parts[parts.length - 1].trim();
    setQuery(currentToken);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchRecipients(currentToken);
    }, 200);
  }, [onChange, searchRecipients]);

  // Select a suggestion
  const selectSuggestion = useCallback((suggestion: RecipientSuggestion) => {
    // Replace the current token with the selected email
    const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
    
    // Remove the last (incomplete) token if it exists
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1];
      // If the last part doesn't look like a complete email, remove it
      if (!lastPart.includes("@") || lastPart === query) {
        parts.pop();
      }
    }
    
    // Add the new email (avoid duplicates)
    const emailLower = suggestion.email.toLowerCase();
    if (!parts.some((p) => p.toLowerCase() === emailLower)) {
      parts.push(suggestion.email);
    }
    
    onChange(parts.join(", ") + ", ");
    setShowSuggestions(false);
    setSuggestions([]);
    setQuery("");
    inputRef.current?.focus();
  }, [value, query, onChange]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlightIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, highlightIndex, selectSuggestion]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative mt-1">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        placeholder={placeholder}
      />
      
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {suggestions.map((suggestion, idx) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
              type="button"
              onClick={() => selectSuggestion(suggestion)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left transition",
                idx === highlightIndex
                  ? "bg-gray-100"
                  : "hover:bg-gray-50"
              )}
            >
              <TypeBadge type={suggestion.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {suggestion.label}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {suggestion.email}
                  {suggestion.secondary && ` · ${suggestion.secondary}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: "contact" | "tma" | "user" }) {
  const colors: Record<string, string> = {
    contact: "bg-blue-100 text-blue-700",
    tma: "bg-purple-100 text-purple-700",
    user: "bg-green-100 text-green-700",
  };
  const labels: Record<string, string> = {
    contact: "Firma",
    tma: "TMA",
    user: "User",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", colors[type])}>
      {labels[type]}
    </span>
  );
}

// ============================================
// Helper functions and icons
// ============================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function FileIcon({ type }: { type: string }) {
  if (type === "application/pdf") {
    return (
      <svg className="h-4 w-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM9 13h6v2H9v-2zm0 4h6v2H9v-2z"/>
      </svg>
    );
  }
  if (type.includes("word") || type.includes("document")) {
    return (
      <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM9 13h6v2H9v-2zm0 4h6v2H9v-2z"/>
      </svg>
    );
  }
  if (type.includes("image")) {
    return (
      <svg className="h-4 w-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z"/>
    </svg>
  );
}

function AttachmentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}
