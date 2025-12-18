"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Team } from "@/lib/types";

interface TeamFilterProps {
  value: string | "all";
  onChange: (teamId: string | "all") => void;
  currentUserTeamId: string | null;
  className?: string;
}

export function TeamFilter({
  value,
  onChange,
  currentUserTeamId,
  className = "",
}: TeamFilterProps) {
  const t = useTranslations("contact.teamFilter");
  const tCommon = useTranslations("common");
  const [isOpen, setIsOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch teams on mount
  useEffect(() => {
    async function fetchTeams() {
      try {
        const response = await fetch("/api/teams");
        if (response.ok) {
          const data = await response.json();
          setTeams(data.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch teams:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchTeams();
  }, []);

  // Get the current user's team
  const userTeam = teams.find((team) => team.id === currentUserTeamId);

  // Get display label for current selection
  const getDisplayLabel = () => {
    if (value === "all") {
      return t("allTeams");
    }
    if (value === currentUserTeamId && userTeam) {
      return `${t("myTeam")} (${userTeam.name})`;
    }
    const selectedTeam = teams.find((team) => team.id === value);
    return selectedTeam ? selectedTeam.name : t("myTeam");
  };

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={loading}
      >
        {loading ? `${tCommon("loading")}...` : getDisplayLabel()}
      </Button>

      {isOpen && !loading && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-100 bg-white shadow-lg">
          <div className="flex flex-col gap-1 p-2">
            {/* My Team option */}
            {userTeam && currentUserTeamId && (
              <button
                className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  value === currentUserTeamId
                    ? "bg-gray-100 font-medium"
                    : "hover:bg-gray-50"
                }`}
                onClick={() => {
                  onChange(currentUserTeamId);
                  setIsOpen(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: userTeam.color || "#4B5563" }}
                  />
                  <span>{t("myTeam")} ({userTeam.name})</span>
                </div>
              </button>
            )}

            {/* All Teams option */}
            <button
              className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                value === "all"
                  ? "bg-gray-100 font-medium"
                  : "hover:bg-gray-50"
              }`}
              onClick={() => {
                onChange("all");
                setIsOpen(false);
              }}
            >
              {t("allTeams")}
            </button>

            {/* Divider */}
            {teams.length > 1 && (
              <div className="my-1 h-px bg-gray-100" />
            )}

            {/* Individual team options */}
            {teams
              .filter((team) => team.id !== currentUserTeamId)
              .map((team) => (
                <button
                  key={team.id}
                  className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    value === team.id
                      ? "bg-gray-100 font-medium"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => {
                    onChange(team.id);
                    setIsOpen(false);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: team.color || "#4B5563" }}
                    />
                    <span>{team.name}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
