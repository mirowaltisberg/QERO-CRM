"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { searchLocationsClient } from "@/lib/geo/client";
import type { PlzEntry } from "@/lib/geo/shared";

interface Props {
  value: { city: string | null; postal_code: string | null };
  onChange: (value: { city: string | null; postal_code: string | null; canton?: string | null }) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Swiss City Autocomplete Component
 * Searches Swiss PLZ dataset and auto-fills city + postal_code when selected
 */
export function SwissCityAutocomplete({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
}: Props) {
  const t = useTranslations("tma");
  
  // Display value: "PLZ City" format
  const displayValue = [value.postal_code, value.city].filter(Boolean).join(" ");
  
  const [inputValue, setInputValue] = useState(displayValue);
  const [suggestions, setSuggestions] = useState<PlzEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync input value when external value changes
  useEffect(() => {
    const newDisplayValue = [value.postal_code, value.city].filter(Boolean).join(" ");
    setInputValue(newDisplayValue);
  }, [value.city, value.postal_code]);

  // Search for locations
  const searchLocations = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const results = await searchLocationsClient(query, 10);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setHighlightIndex(-1);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setInputValue(newValue);

      // Debounce search
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        searchLocations(newValue);
      }, 200);
    },
    [searchLocations]
  );

  // Select a suggestion
  const selectSuggestion = useCallback(
    (suggestion: PlzEntry) => {
      const newValue = {
        city: suggestion.name,
        postal_code: suggestion.plz,
        canton: suggestion.canton ?? null,
      };
      onChange(newValue);
      setInputValue(`${suggestion.plz} ${suggestion.name}`);
      setShowSuggestions(false);
      setSuggestions([]);
      inputRef.current?.blur();
    },
    [onChange]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) {
        // Allow Enter to confirm manual input
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex >= 0) {
          selectSuggestion(suggestions[highlightIndex]);
        } else if (suggestions.length > 0) {
          selectSuggestion(suggestions[0]);
        }
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
      }
    },
    [showSuggestions, suggestions, highlightIndex, selectSuggestion]
  );

  // Handle blur - allow manual text entry
  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        // If user typed something manually without selecting, keep it as city
        if (inputValue && inputValue !== displayValue) {
          // Try to parse "PLZ City" format
          const plzMatch = inputValue.match(/^(\d{4})\s+(.+)$/);
          if (plzMatch) {
            onChange({
              postal_code: plzMatch[1],
              city: plzMatch[2].trim(),
            });
          } else {
            // Just treat as city name
            onChange({
              city: inputValue.trim() || null,
              postal_code: value.postal_code,
            });
          }
        }
      }
    }, 150);
  }, [inputValue, displayValue, onChange, value.postal_code]);

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
    <div ref={containerRef} className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) {
            setShowSuggestions(true);
          }
        }}
        onBlur={handleBlur}
        placeholder={placeholder ?? t("searchCityPlz")}
        disabled={disabled}
        className={cn(loading && "pr-8")}
      />
      
      {/* Loading indicator */}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-60 overflow-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.plz}-${suggestion.name}`}
              type="button"
              className={cn(
                "w-full px-3 py-2 text-left text-sm transition-colors",
                index === highlightIndex
                  ? "bg-blue-50 text-blue-900"
                  : "hover:bg-gray-50"
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                selectSuggestion(suggestion);
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <span className="font-medium">{suggestion.plz}</span>
              <span className="ml-2 text-gray-700">{suggestion.name}</span>
              {suggestion.canton && (
                <span className="ml-1 text-gray-400">({suggestion.canton})</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
