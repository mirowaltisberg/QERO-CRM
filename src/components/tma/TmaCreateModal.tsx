"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Team } from "@/lib/types";

interface TmaCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreateCandidate: (payload: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    team_id?: string | null;
  }) => Promise<void>;
  teams: Team[];
  defaultTeamId: string | null;
}

export function TmaCreateModal({
  open,
  onClose,
  onCreateCandidate,
  teams,
  defaultTeamId,
}: TmaCreateModalProps) {
  const t = useTranslations("tma");
  const tCommon = useTranslations("common");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setTeamId(defaultTeamId);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!firstName.trim() || !lastName.trim()) {
      return;
    }

    setCreating(true);
    try {
      await onCreateCandidate({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        team_id: teamId,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create candidate");
    } finally {
      setCreating(false);
    }
  };

  const isValid = firstName.trim().length > 0 && lastName.trim().length > 0;

  return (
    <Modal open={open} onClose={handleClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t("newCandidate")}</h3>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Required fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t("firstName")} *
            </label>
            <Input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("firstName")}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t("lastName")} *
            </label>
            <Input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("lastName")}
              required
            />
          </div>
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t("email")}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {t("phone")}
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("phone")}
            />
          </div>
        </div>

        {/* Team selection */}
        {teams.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              {tCommon("team")}
            </label>
            <select
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-gray-400 focus:outline-none"
              value={teamId || ""}
              onChange={(e) => setTeamId(e.target.value || null)}
            >
              <option value="">{tCommon("none")}</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={creating}>
            {tCommon("cancel")}
          </Button>
          <Button type="submit" disabled={!isValid || creating}>
            {creating ? t("creating") : t("createCandidate")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
