"use client";

import { memo, useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils/cn";

interface LanguageSwitcherProps {
  currentLocale: Locale;
  variant?: "dropdown" | "buttons";
  size?: "sm" | "md";
}

// Flag emojis for each locale
const flagEmojis: Record<Locale, string> = {
  de: "🇨🇭", // Swiss flag for German
  en: "🇺🇸", // American flag for English
};

export const LanguageSwitcher = memo(function LanguageSwitcher({
  currentLocale,
  variant = "dropdown",
  size = "md",
}: LanguageSwitcherProps) {
  const t = useTranslations("settings");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLocaleChange = async (locale: Locale) => {
    // Set cookie and reload
    document.cookie = `locale=${locale};path=/;max-age=31536000`;
    setIsOpen(false);
    window.location.reload();
  };

  if (variant === "buttons") {
    return (
      <div className="flex gap-1">
        {locales.map((locale) => (
          <button
            key={locale}
            onClick={() => handleLocaleChange(locale)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors flex items-center justify-center",
              currentLocale === locale
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            )}
            title={localeNames[locale]}
          >
            <span className="text-lg">{flagEmojis[locale]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300",
          size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
        )}
      >
        <GlobeIcon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span className="font-medium">{localeNames[currentLocale]}</span>
        <ChevronDownIcon className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {locales.map((locale) => (
            <button
              key={locale}
              onClick={() => handleLocaleChange(locale)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                currentLocale === locale
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {currentLocale === locale && (
                <CheckIcon className="h-4 w-4 text-blue-600" />
              )}
              <span className="text-lg">{flagEmojis[locale]}</span>
              <span className={currentLocale !== locale ? "" : ""}>
                {localeNames[locale]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
