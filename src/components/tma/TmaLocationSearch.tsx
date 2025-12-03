"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { PlzEntry } from "@/lib/geo/shared";
import { searchLocationsClient } from "@/lib/geo/client";

interface Props {
  onSearch: (query: string, radiusKm: number) => void;
  onClear: () => void;
  onRadiusChange: (radiusKm: number) => void;
  isActive: boolean;
  isLoading: boolean;
  currentLocation: {
    name: string;
    plz: string;
    lat: number;
    lng: number;
  } | null;
  currentRadius: number;
}

const RADIUS_OPTIONS = [10, 25, 50, 100];

export function TmaLocationSearch({
  onSearch,
  onClear,
  onRadiusChange,
  isActive,
  isLoading,
  currentLocation,
  currentRadius,
}: Props) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<PlzEntry[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showRadiusSlider, setShowRadiusSlider] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // Handle clicks outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setShowRadiusSlider(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update suggestions as user types
  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionsLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setSuggestionsLoading(true);

    searchLocationsClient(trimmed, 8)
      .then((results) => {
        if (requestId !== requestIdRef.current) return;
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setShowSuggestions(false);
      })
      .finally(() => {
        if (requestId !== requestIdRef.current) return;
        setSuggestionsLoading(false);
      });
  }, []);

  const handleSelectSuggestion = useCallback(
    (entry: PlzEntry) => {
      setQuery(`${entry.name} (${entry.plz})`);
      setShowSuggestions(false);
      setShowRadiusSlider(true);
      // Trigger search with selected location
      onSearch(entry.plz, currentRadius);
    },
    [onSearch, currentRadius]
  );

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      onSearch(query.trim(), currentRadius);
      setShowSuggestions(false);
      setShowRadiusSlider(true);
    }
  }, [query, currentRadius, onSearch]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSearch();
      } else if (event.key === "Escape") {
        setShowSuggestions(false);
        setShowRadiusSlider(false);
      }
    },
    [handleSearch]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setShowRadiusSlider(false);
    onClear();
  }, [onClear]);

  const handleRadiusChange = useCallback(
    (radius: number) => {
      onRadiusChange(radius);
    },
    [onRadiusChange]
  );

  if (isActive && currentLocation) {
    return (
      <div ref={containerRef} className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs">
          <svg
            className="h-3.5 w-3.5 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span className="font-medium text-blue-700">
            {currentLocation.name}
          </span>
          <span className="text-blue-500">({currentLocation.plz})</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowRadiusSlider(!showRadiusSlider)}
            className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <span>{currentRadius} km</span>
            <svg
              className={`h-3 w-3 transition-transform ${showRadiusSlider ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showRadiusSlider && (
            <div className="absolute top-full left-0 z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 text-xs font-medium text-gray-600">Search radius</div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={currentRadius}
                onChange={(e) => handleRadiusChange(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className="mt-2 flex justify-between text-[10px] text-gray-400">
                <span>5 km</span>
                <span className="font-medium text-gray-700">{currentRadius} km</span>
                <span>100 km</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRadiusChange(r)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      currentRadius === r
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {r} km
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleClear}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Clear location search"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Search by location..."
            className="w-36 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
            disabled={isLoading}
          />
          {(isLoading || suggestionsLoading) && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg
                className="h-3.5 w-3.5 animate-spin text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          )}
        </div>

        {query && !isLoading && (
          <Button variant="ghost" size="sm" onClick={handleSearch} className="px-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </Button>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Locations
          </div>
          {suggestions.map((entry) => (
            <button
              key={entry.plz}
              onClick={() => handleSelectSuggestion(entry)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors"
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
              </svg>
              <span className="font-medium text-gray-800">{entry.name}</span>
              <span className="text-gray-400">{entry.plz}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

