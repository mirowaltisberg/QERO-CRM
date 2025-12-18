"use client";

import { memo, useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Vacancy, VacancyUrgency, TmaRole } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { TMA_STATUS_LIST, type DrivingLicense, type ExperienceLevel } from "@/lib/utils/constants";
import { DrivingLicenseSelector } from "@/components/ui/DrivingLicenseBadge";
import { ExperienceLevelSelector } from "@/components/ui/ExperienceLevelSelector";

interface QuickVacancyPopupProps {
  isOpen: boolean;
  onClose: () => void;
  contact: {
    id: string;
    company_name: string;
    city: string | null;
    postal_code: string | null;
    latitude: number | null;
    longitude: number | null;
    team_id: string | null;
  };
  onCreated?: (vacancy: Vacancy) => void;
}

export const QuickVacancyPopup = memo(function QuickVacancyPopup({
  isOpen,
  onClose,
  contact,
  onCreated,
}: QuickVacancyPopupProps) {
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [minQuality, setMinQuality] = useState<"A" | "B" | "C" | "">("");
  const [urgency, setUrgency] = useState<VacancyUrgency>(2);
  const [radiusKm, setRadiusKm] = useState(25);
  const [drivingLicense, setDrivingLicense] = useState<DrivingLicense | null>(null);
  const [minExperience, setMinExperience] = useState<ExperienceLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [roles, setRoles] = useState<TmaRole[]>([]);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  
  const titleInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch roles on mount
  useEffect(() => {
    if (isOpen) {
      fetch("/api/tma/roles/all")
        .then((res) => res.json())
        .then((data) => {
          if (data.data) setRoles(data.data);
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setRole("");
      setDescription("");
      setMinQuality("");
      setUrgency(2);
      setRadiusKm(25);
      setDrivingLicense(null);
      setMinExperience(null);
      setSuccess(false);
      // Focus title input after animation
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Close role dropdown on click outside
  useEffect(() => {
    if (!showRoleDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showRoleDropdown]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/vacancies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact.id,
          title: title.trim(),
          role: role.trim() || null,
          description: description.trim() || null,
          city: contact.city,
          postal_code: contact.postal_code,
          latitude: contact.latitude,
          longitude: contact.longitude,
          radius_km: radiusKm,
          min_quality: minQuality || null,
          urgency,
          driving_license: drivingLicense || null,
          min_experience: minExperience || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create vacancy");

      setSuccess(true);
      onCreated?.(data.data);
      
      // Close after success animation completes
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (error) {
      console.error("Failed to create vacancy:", error);
      alert("Fehler beim Erstellen der Vakanz");
    } finally {
      setSubmitting(false);
    }
  }, [title, role, description, minQuality, urgency, radiusKm, drivingLicense, minExperience, contact, onCreated, onClose, submitting]);

  // Handle Enter to submit
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  if (!isOpen) return null;

  const portalRoot = typeof window !== "undefined" ? document.body : null;
  if (!portalRoot) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/25"
        style={{
          animation: "vacancy-backdrop-enter 300ms ease-out forwards",
        }}
      />
      
      {/* Popup Card */}
      <div
        ref={popupRef}
        className={cn(
          "relative w-full max-w-md bg-white rounded-2xl border border-gray-100",
          success && "pointer-events-none"
        )}
        style={{
          animation: success 
            ? "vacancy-success-glow 600ms ease-out forwards"
            : "vacancy-popup-enter 400ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
        }}
      >
        {/* Success Overlay with Confetti */}
        {success && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl z-10">
            {/* Confetti Particles */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl">
              <span 
                className="absolute w-3 h-3 rounded-full bg-green-400"
                style={{ animation: "vacancy-confetti-1 600ms ease-out forwards" }}
              />
              <span 
                className="absolute w-2 h-2 rounded-full bg-emerald-500"
                style={{ animation: "vacancy-confetti-2 600ms ease-out 50ms forwards" }}
              />
              <span 
                className="absolute w-2.5 h-2.5 rounded-full bg-green-300"
                style={{ animation: "vacancy-confetti-3 600ms ease-out 100ms forwards" }}
              />
              <span 
                className="absolute w-2 h-2 rounded-full bg-teal-400"
                style={{ animation: "vacancy-confetti-4 600ms ease-out 75ms forwards" }}
              />
              <span 
                className="absolute w-1.5 h-1.5 rounded-sm bg-green-500 rotate-45"
                style={{ animation: "vacancy-confetti-1 500ms ease-out 25ms forwards" }}
              />
              <span 
                className="absolute w-1.5 h-1.5 rounded-sm bg-emerald-400 rotate-12"
                style={{ animation: "vacancy-confetti-2 550ms ease-out forwards" }}
              />
            </div>
            
            {/* Success Icon */}
            <div className="flex flex-col items-center gap-3 relative z-10">
              <div 
                className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
                style={{ animation: "vacancy-success-ring 600ms ease-out forwards" }}
              >
                <svg 
                  className="w-8 h-8 text-green-600" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor" 
                  strokeWidth={2.5}
                  style={{ animation: "vacancy-success-check 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards" }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900">Vakanz erstellt!</p>
              <p className="text-sm text-gray-500">Sichtbar in Vakanzen</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Neue Vakanz</h2>
              <p className="text-sm text-gray-500 mt-0.5">{contact.company_name}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4" onKeyDown={handleKeyDown}>
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Stellentitel *
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Elektroinstallateur EFZ"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 transition-colors"
            />
          </div>

          {/* Role Dropdown */}
          <div className="relative" ref={roleDropdownRef}>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Rolle (für TMA-Matching)
            </label>
            <button
              type="button"
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className={cn(
                "w-full px-3 py-2.5 rounded-xl border text-sm text-left transition-colors flex items-center justify-between",
                role ? "border-gray-300 text-gray-900" : "border-gray-200 text-gray-400"
              )}
            >
              <span>{role || "Rolle auswählen..."}</span>
              <svg className={cn("w-4 h-4 text-gray-400 transition-transform", showRoleDropdown && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showRoleDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-20 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setRole("");
                    setShowRoleDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 border-b border-gray-100"
                >
                  Keine Rolle
                </button>
                {roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setRole(r.name);
                      setShowRoleDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: r.color }}
                    />
                    <span className="text-gray-900">{r.name}</span>
                    {r.team && (
                      <span className="text-xs text-gray-400 ml-auto">{r.team.name}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quality & Urgency Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Min Quality */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Min. Qualität
              </label>
              <div className="flex gap-1.5">
                {(["", ...TMA_STATUS_LIST] as const).map((q) => (
                  <button
                    key={q || "all"}
                    type="button"
                    onClick={() => setMinQuality(q as typeof minQuality)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-medium border transition-all",
                      minQuality === q
                        ? q === "A" ? "bg-green-500 text-white border-green-500" :
                          q === "B" ? "bg-amber-500 text-white border-amber-500" :
                          q === "C" ? "bg-red-500 text-white border-red-500" :
                          "bg-gray-900 text-white border-gray-900"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {q || "Alle"}
                  </button>
                ))}
              </div>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Dringlichkeit
              </label>
              <div className="flex gap-1.5">
                {([1, 2, 3] as VacancyUrgency[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUrgency(u)}
                    className={cn(
                      "flex-1 py-2 rounded-lg border transition-all flex items-center justify-center gap-0.5",
                      urgency === u
                        ? "bg-orange-50 border-orange-300"
                        : "bg-white border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {Array.from({ length: u }).map((_, i) => (
                      <FlameIcon 
                        key={i} 
                        className={cn(
                          "w-4 h-4",
                          urgency === u ? "text-orange-500" : "text-gray-300"
                        )} 
                      />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Radius Slider */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Such-Radius: <span className="text-gray-700 font-semibold">{radiusKm} km</span>
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">5</span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
              />
              <span className="text-xs text-gray-400">100</span>
            </div>
            <div className="flex justify-between mt-1.5">
              {[10, 25, 50, 75].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRadiusKm(preset)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                    radiusKm === preset
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {preset} km
                </button>
              ))}
            </div>
          </div>

          {/* Driving License */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Führerschein
            </label>
            <DrivingLicenseSelector value={drivingLicense} onChange={setDrivingLicense} size="sm" />
          </div>

          {/* Min Experience */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Mindest-Berufserfahrung
            </label>
            <ExperienceLevelSelector value={minExperience} onChange={setMinExperience} size="sm" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Beschreibung <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Zusätzliche Infos zur Stelle..."
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 resize-none transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            ⌘+Enter zum Erstellen
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium transition-all",
                title.trim() && !submitting
                  ? "bg-gray-900 text-white hover:bg-gray-800 active:scale-[0.98]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              )}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Erstellen...
                </span>
              ) : (
                "Erstellen"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalRoot
  );
});

// Simple flame icon
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.52 1.17-4.83 3.15-6.42.9-.73 1.85-1.27 2.85-1.58.39-.12.8.16.8.57v.44c0 1.08.22 2.14.65 3.12.15.36.55.48.87.27.17-.11.32-.24.45-.39.72-.8 1.14-1.82 1.23-2.9.09-1.08-.12-2.17-.63-3.14-.25-.47.18-1.02.7-.89 1.76.45 3.38 1.38 4.72 2.73C19.32 8.92 21 11.87 21 15c0 4.42-4.03 8-9 8z"/>
    </svg>
  );
}
