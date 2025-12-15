"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { buildGoogleMapsDirectionsUrl, formatDurationMinutes } from "@/lib/geo/travel";
import { cn } from "@/lib/utils/cn";

interface TravelTimeWidgetProps {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  candidateName?: string;
  companyName?: string;
  className?: string;
}

interface TravelResult {
  durationMinutes: number;
  originStation?: string;
  destStation?: string;
  error?: string;
}

type TravelMode = "driving" | "transit";

export function TravelTimeWidget({
  fromLat,
  fromLng,
  toLat,
  toLng,
  candidateName,
  companyName,
  className,
}: TravelTimeWidgetProps) {
  const t = useTranslations("travelTime");
  
  const [drivingResult, setDrivingResult] = useState<TravelResult | null>(null);
  const [transitResult, setTransitResult] = useState<TravelResult | null>(null);
  const [loadingDriving, setLoadingDriving] = useState(false);
  const [loadingTransit, setLoadingTransit] = useState(false);

  const fetchTravelTime = useCallback(async (mode: TravelMode) => {
    const setLoading = mode === "driving" ? setLoadingDriving : setLoadingTransit;
    const setResult = mode === "driving" ? setDrivingResult : setTransitResult;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        fromLat: fromLat.toString(),
        fromLng: fromLng.toString(),
        toLat: toLat.toString(),
        toLng: toLng.toString(),
        mode,
      });
      
      const response = await fetch(`/api/travel-time?${params}`);
      const json = await response.json();
      
      if (!response.ok) {
        setResult({ durationMinutes: 0, error: json.error || t("routeError") });
        return;
      }
      
      setResult({
        durationMinutes: json.data.durationMinutes,
        originStation: json.data.originStation,
        destStation: json.data.destStation,
      });
    } catch (err) {
      console.error(`[TravelTime] Error fetching ${mode}:`, err);
      setResult({ durationMinutes: 0, error: t("routeError") });
    } finally {
      setLoading(false);
    }
  }, [fromLat, fromLng, toLat, toLng, t]);

  const handleDrivingClick = useCallback(() => {
    if (drivingResult && !drivingResult.error) {
      // Already have result, open Google Maps
      const url = buildGoogleMapsDirectionsUrl({
        fromLat,
        fromLng,
        toLat,
        toLng,
        mode: "driving",
      });
      window.open(url, "_blank");
    } else {
      // Fetch the driving time
      fetchTravelTime("driving");
    }
  }, [drivingResult, fromLat, fromLng, toLat, toLng, fetchTravelTime]);

  const handleTransitClick = useCallback(() => {
    if (transitResult && !transitResult.error) {
      // Already have result, open Google Maps
      const url = buildGoogleMapsDirectionsUrl({
        fromLat,
        fromLng,
        toLat,
        toLng,
        mode: "transit",
      });
      window.open(url, "_blank");
    } else {
      // Fetch the transit time
      fetchTravelTime("transit");
    }
  }, [transitResult, fromLat, fromLng, toLat, toLng, fetchTravelTime]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="text-xs uppercase tracking-wide text-gray-400">
        {t("title")}
      </p>
      
      <div className="flex gap-3 items-center">
        {/* Driving button - Car logo */}
        <button
          onClick={handleDrivingClick}
          disabled={loadingDriving}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
            "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500",
            loadingDriving && "opacity-50 cursor-wait",
            drivingResult && !drivingResult.error 
              ? "bg-blue-50 border-blue-200 hover:bg-blue-100" 
              : "bg-white border-gray-200 hover:border-gray-300"
          )}
          title={drivingResult && !drivingResult.error ? t("openInMaps") : t("calculateDriving")}
        >
          {/* Car logo - filled style */}
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path 
              d="M5 11l1.5-4.5a2 2 0 0 1 1.9-1.5h7.2a2 2 0 0 1 1.9 1.5L19 11M5 11v6a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-6M5 11h14M7.5 14.5a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0Zm8 0a.5.5 0 1 0 1 0 .5.5 0 0 0-1 0Z" 
              stroke="#2563eb" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
          {loadingDriving ? (
            <span className="text-sm text-gray-500 animate-pulse">...</span>
          ) : drivingResult ? (
            drivingResult.error ? (
              <span className="text-sm text-red-500">!</span>
            ) : (
              <span className="text-sm font-medium text-blue-700">
                {formatDurationMinutes(drivingResult.durationMinutes)}
              </span>
            )
          ) : null}
        </button>

        {/* Transit button - SBB logo */}
        <button
          onClick={handleTransitClick}
          disabled={loadingTransit}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
            "hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500",
            loadingTransit && "opacity-50 cursor-wait",
            transitResult && !transitResult.error 
              ? "bg-red-50 border-red-200 hover:bg-red-100" 
              : "bg-white border-gray-200 hover:border-gray-300"
          )}
          title={transitResult && !transitResult.error ? t("openInMaps") : t("calculateTransit")}
        >
          {/* SBB Swiss Railway logo */}
          <svg className="h-6 w-6" viewBox="0 0 298 186" fill="none">
            <path fill="#D82E20" d="M 204.0 154.5 L 169.5 154.0 L 217.0 106.5 L 157.0 106.5 L 156.0 154.5 L 128.5 154.0 L 128.0 106.5 L 68.0 106.5 L 115.5 154.0 L 81.0 154.5 L 18.5 92.0 L 80.0 30.5 L 115.5 31.0 L 68.0 78.5 L 128.0 78.5 L 129.0 30.5 L 156.5 31.0 L 157.0 78.5 L 217.0 78.5 L 169.5 31.0 L 205.0 30.5 L 265.5 93.0 Z"/>
          </svg>
          {loadingTransit ? (
            <span className="text-sm text-gray-500 animate-pulse">...</span>
          ) : transitResult ? (
            transitResult.error ? (
              <span className="text-sm text-red-500">!</span>
            ) : (
              <span className="text-sm font-medium text-red-700">
                {formatDurationMinutes(transitResult.durationMinutes)}
              </span>
            )
          ) : null}
        </button>
      </div>

      {/* Show station info for transit if available */}
      {transitResult && !transitResult.error && transitResult.originStation && (
        <p className="text-xs text-gray-400">
          {transitResult.originStation} → {transitResult.destStation}
        </p>
      )}
    </div>
  );
}
