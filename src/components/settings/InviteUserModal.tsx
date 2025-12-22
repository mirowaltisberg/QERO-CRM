"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

interface Team {
  id: string;
  name: string;
  color: string | null;
}

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
}

export const InviteUserModal = memo(function InviteUserModal({
  isOpen,
  onClose,
  teams,
}: InviteUserModalProps) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [teamId, setTeamId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showForceResend, setShowForceResend] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setFullName("");
      setPhone("");
      // Set teamId only if teams are available
      if (teams.length > 0) {
        setTeamId(teams[0].id);
      }
      setError(null);
      setSuccess(false);
      setShowForceResend(false);
    }
  }, [isOpen, teams]);

  // Update teamId when teams load (in case modal opened before teams loaded)
  useEffect(() => {
    if (teams.length > 0 && !teamId) {
      setTeamId(teams[0].id);
    }
  }, [teams, teamId]);

  const sendInvitation = useCallback(async (forceResend: boolean = false) => {
    if (!email || !fullName || !teamId) {
      setError("Bitte füllen Sie alle Pflichtfelder aus");
      return;
    }

    setLoading(true);
    setError(null);
    setShowForceResend(false);

    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName,
          phone: phone || undefined,
          teamId,
          forceResend,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Check if we can offer force resend
        if (res.status === 409 && data.canForceResend) {
          setError(data.error);
          setShowForceResend(true);
          return;
        }
        throw new Error(data.error || "Failed to send invitation");
      }

      setSuccess(true);
      
      // Close modal after showing success
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  }, [email, fullName, phone, teamId, onClose]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    await sendInvitation(false);
  }, [sendInvitation]);

  const handleForceResend = useCallback(async () => {
    await sendInvitation(true);
  }, [sendInvitation]);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t("inviteUser")}
    >
      {teams.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-500">Teams werden geladen...</p>
        </div>
      ) : success ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {t("invitationSent")}
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            {t("invitationSentDescription", { email })}
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-sm text-red-600">{error}</p>
              {showForceResend && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleForceResend}
                    disabled={loading}
                  >
                    {loading ? "Wird gelöscht..." : "Trotzdem neu einladen"}
                  </Button>
                  <span className="text-xs text-gray-500">
                    (Löscht den bestehenden Benutzer)
                  </span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              E-Mail *
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("fullName")} *
            </label>
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Max Mustermann"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("phone")}
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 123 45 67"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Team *
            </label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            >
              <option value="">Team auswählen...</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg bg-blue-50 p-3">
            <div className="flex gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-medium">{t("inviteInfo")}</p>
                <ul className="mt-1 list-inside list-disc text-blue-700">
                  <li>{t("inviteInfoPassword")}</li>
                  <li>{t("inviteInfo2FA")}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={loading || !email || !fullName || !teamId}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t("sending")}
                </span>
              ) : (
                t("sendInvitation")
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
});

