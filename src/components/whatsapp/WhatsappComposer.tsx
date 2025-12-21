"use client";

import { memo, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils/cn";

interface WhatsappComposerProps {
  conversationId: string;
  isWithinWindow: boolean;
  disabled?: boolean;
  onSend: (message: {
    type: "text" | "template";
    text?: string;
    template_name?: string;
    components?: unknown[];
  }) => Promise<void>;
  onSendMedia?: (file: File, caption?: string) => Promise<void>;
}

export const WhatsappComposer = memo(function WhatsappComposer({
  conversationId,
  isWithinWindow,
  disabled,
  onSend,
  onSendMedia,
}: WhatsappComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendText = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSend({ type: "text", text: trimmed });
      setText("");
      textareaRef.current?.focus();
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendText();
      }
    },
    [handleSendText]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onSendMedia) return;

      e.target.value = "";

      // Validate file size (16MB for WhatsApp media)
      if (file.size > 16 * 1024 * 1024) {
        alert("Datei zu gross. Maximum: 16MB");
        return;
      }

      setSending(true);
      try {
        await onSendMedia(file);
      } finally {
        setSending(false);
      }
    },
    [onSendMedia]
  );

  const canSend = text.trim().length > 0 && !sending && !disabled;

  // If outside 24-hour window, show template-only mode
  if (!isWithinWindow) {
    return (
      <div className="border-t border-gray-200 bg-amber-50 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-amber-700">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            <strong>24-Stunden-Fenster abgelaufen.</strong> Verwenden Sie eine Vorlage, um die Konversation neu zu starten.
          </span>
        </div>

        <button
          onClick={() => setShowTemplates(true)}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-white hover:bg-green-700 disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Vorlage senden
        </button>

        {showTemplates && (
          <TemplateSelector
            onSelect={async (templateName, components) => {
              setSending(true);
              try {
                await onSend({ type: "template", template_name: templateName, components });
                setShowTemplates(false);
              } finally {
                setSending(false);
              }
            }}
            onClose={() => setShowTemplates(false)}
            sending={sending}
          />
        )}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 bg-white p-3">
      <div className="flex items-end gap-2">
        {/* Attachment button */}
        {onSendMedia && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || sending}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            />
          </>
        )}

        {/* Text input */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht eingeben..."
            disabled={disabled || sending}
            rows={1}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-green-500 focus:bg-white focus:outline-none disabled:opacity-50"
            style={{ minHeight: "40px", maxHeight: "120px" }}
          />
        </div>

        {/* Template button */}
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          disabled={disabled || sending}
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors",
            showTemplates ? "bg-green-100 text-green-600" : "text-gray-500 hover:bg-gray-100",
            "disabled:opacity-50"
          )}
          title="Vorlage senden"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>

        {/* Send button */}
        <button
          onClick={handleSendText}
          disabled={!canSend}
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all",
            canSend
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-100 text-gray-400"
          )}
        >
          {sending ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* Template selector modal */}
      {showTemplates && (
        <TemplateSelector
          onSelect={async (templateName, components) => {
            setSending(true);
            try {
              await onSend({ type: "template", template_name: templateName, components });
              setShowTemplates(false);
            } finally {
              setSending(false);
            }
          }}
          onClose={() => setShowTemplates(false)}
          sending={sending}
        />
      )}
    </div>
  );
});

// Template selector component
const TemplateSelector = memo(function TemplateSelector({
  onSelect,
  onClose,
  sending,
}: {
  onSelect: (templateName: string, components?: unknown[]) => Promise<void>;
  onClose: () => void;
  sending: boolean;
}) {
  // Predefined templates - these should match templates approved in Meta Business Manager
  const templates = [
    {
      name: "followup_reminder_de",
      displayName: "Follow-up Erinnerung",
      description: "Erinnerung für ein geplantes Follow-up",
      hasParams: true,
    },
    {
      name: "document_request_de",
      displayName: "Dokument anfordern",
      description: "Anfrage für fehlende Dokumente",
      hasParams: true,
    },
    {
      name: "hello_world",
      displayName: "Test-Nachricht",
      description: "Einfache Test-Nachricht",
      hasParams: false,
    },
  ];

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium text-gray-900">Vorlage wählen</h4>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="space-y-2">
        {templates.map((template) => (
          <button
            key={template.name}
            onClick={() => onSelect(template.name)}
            disabled={sending}
            className="flex w-full items-start gap-3 rounded-lg border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{template.displayName}</p>
              <p className="text-sm text-gray-500">{template.description}</p>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Vorlagen müssen in Meta Business Manager genehmigt werden.
      </p>
    </div>
  );
});





