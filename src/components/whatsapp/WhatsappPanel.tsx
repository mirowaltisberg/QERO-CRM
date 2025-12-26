"use client";

import { memo, useState, useEffect, useCallback } from "react";
import { WhatsappThread } from "./WhatsappThread";
import { WhatsappComposer } from "./WhatsappComposer";
import type { WhatsAppConversation, WhatsAppMessage } from "@/lib/types";

interface WhatsappPanelProps {
  /** TMA candidate ID to show WhatsApp for */
  tmaId?: string;
  /** Contact ID to show WhatsApp for */
  contactId?: string;
  /** Phone number to use if no existing conversation */
  phoneNumber?: string;
  /** Compact mode for embedding in detail views */
  compact?: boolean;
}

export const WhatsappPanel = memo(function WhatsappPanel({
  tmaId,
  contactId,
  phoneNumber,
  compact = false,
}: WhatsappPanelProps) {
  const [conversation, setConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if within 24-hour window
  const isWithinWindow = conversation?.last_customer_message_at
    ? new Date().getTime() - new Date(conversation.last_customer_message_at).getTime() < 24 * 60 * 60 * 1000
    : false;

  // Fetch conversation
  useEffect(() => {
    async function fetchConversation() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (tmaId) params.set("linked_tma_id", tmaId);
        if (contactId) params.set("linked_contact_id", contactId);

        const res = await fetch(`/api/whatsapp/conversations?${params}`);
        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || "Failed to load conversations");
        }

        // Find the first matching conversation
        const conv = json.data?.[0] || null;
        setConversation(conv);

        // Fetch messages if conversation exists
        if (conv) {
          await fetchMessages(conv.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    if (tmaId || contactId) {
      fetchConversation();
    }
  }, [tmaId, contactId]);

  // Fetch messages
  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/messages?conversation_id=${conversationId}`);
      const json = await res.json();

      if (res.ok && json.data) {
        setMessages(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, []);

  // Create conversation if needed
  const createConversation = useCallback(async () => {
    if (!phoneNumber) {
      setError("Keine Telefonnummer vorhanden");
      return null;
    }

    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: phoneNumber,
          linked_tma_id: tmaId,
          linked_contact_id: contactId,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to create conversation");
      }

      setConversation(json.data);
      return json.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
      return null;
    }
  }, [phoneNumber, tmaId, contactId]);

  // Send message
  const handleSend = useCallback(
    async (message: {
      type: "text" | "template";
      text?: string;
      template_name?: string;
      components?: unknown[];
    }) => {
      let conv = conversation;

      // Create conversation if it doesn't exist
      if (!conv) {
        conv = await createConversation();
        if (!conv) return;
      }

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conv.id,
            type: message.type,
            text: message.text,
            template_name: message.template_name,
            components: message.components,
          }),
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.error || "Failed to send message");
        }

        // Add message to list
        if (json.data) {
          setMessages((prev) => [...prev, json.data]);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
        throw err;
      }
    },
    [conversation, createConversation]
  );

  // Send media
  const handleSendMedia = useCallback(
    async (file: File, caption?: string) => {
      let conv = conversation;

      if (!conv) {
        conv = await createConversation();
        if (!conv) return;
      }

      // For now, just show an alert - media upload requires more implementation
      alert("Media-Upload wird noch implementiert. Bitte verwenden Sie Text-Nachrichten.");
    },
    [conversation, createConversation]
  );

  // Render loading state
  if (loading) {
    return (
      <div className={`flex items-center justify-center ${compact ? "h-48" : "h-96"}`}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-green-500" />
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 ${compact ? "h-48" : "h-96"} text-gray-500`}>
        <svg className="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  // Render no phone number state
  if (!conversation && !phoneNumber) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 ${compact ? "h-48" : "h-96"} text-gray-400`}>
        <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        <p>Keine Telefonnummer hinterlegt</p>
        <p className="text-sm">Fügen Sie eine Telefonnummer hinzu, um WhatsApp zu nutzen.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${compact ? "h-[400px]" : "h-full"}`}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
          <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-gray-900">
            {conversation?.profile_name || conversation?.phone_number || phoneNumber}
          </p>
          {conversation && (
            <p className="text-xs text-gray-500">
              {isWithinWindow ? (
                <span className="text-green-600">● Online-Fenster aktiv</span>
              ) : (
                <span className="text-amber-600">● Nur Vorlagen möglich</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Messages */}
      <WhatsappThread messages={messages} loading={loading} />

      {/* Composer */}
      <WhatsappComposer
        conversationId={conversation?.id || ""}
        isWithinWindow={!conversation || isWithinWindow}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
      />
    </div>
  );
});







