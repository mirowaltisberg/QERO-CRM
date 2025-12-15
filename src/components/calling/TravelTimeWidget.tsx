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
      <p className="text-xs uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H19.5m-9.75 0h10.5M3.375 14.25h10.5M3.375 14.25v-1.5c0-.621.504-1.125 1.125-1.125h1.5m0 0h10.5m-10.5 0V9.375c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125v2.25" />
        </svg>
        {t("title")}
      </p>
      
      <div className="flex gap-2 flex-wrap">
        {/* Driving button */}
        <Button
          size="sm"
          variant={drivingResult && !drivingResult.error ? "secondary" : "ghost"}
          onClick={handleDrivingClick}
          disabled={loadingDriving}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            drivingResult && !drivingResult.error && "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
          )}
          title={drivingResult && !drivingResult.error ? t("openInMaps") : t("calculateDriving")}
        >
          {/* Car icon */}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H19.5m-9.75 0h10.5M3.375 14.25h10.5M3.375 14.25v-1.5c0-.621.504-1.125 1.125-1.125h1.5m0 0h10.5m-10.5 0V9.375c0-.621.504-1.125 1.125-1.125h8.25c.621 0 1.125.504 1.125 1.125v2.25" />
          </svg>
          {loadingDriving ? (
            <span className="animate-pulse">{t("calculating")}</span>
          ) : drivingResult ? (
            drivingResult.error ? (
              <span className="text-red-500">{t("error")}</span>
            ) : (
              <span>{formatDurationMinutes(drivingResult.durationMinutes)}</span>
            )
          ) : (
            t("byCar")
          )}
        </Button>

        {/* Transit button */}
        <Button
          size="sm"
          variant={transitResult && !transitResult.error ? "secondary" : "ghost"}
          onClick={handleTransitClick}
          disabled={loadingTransit}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            transitResult && !transitResult.error && "bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
          )}
          title={transitResult && !transitResult.error ? t("openInMaps") : t("calculateTransit")}
        >
          {/* SBB Swiss Railway logo */}
          <svg className="h-4 w-4" viewBox="0 0 298 186" fill="none">
            <path fill="#D82E20" d="M 204.0 154.5 L 169.5 154.0 L 217.0 106.5 L 157.0 106.5 L 156.0 154.5 L 128.5 154.0 L 128.0 106.5 L 68.0 106.5 L 115.5 154.0 L 81.0 154.5 L 18.5 92.0 L 80.0 30.5 L 115.5 31.0 L 68.0 78.5 L 128.0 78.5 L 129.0 30.5 L 156.5 31.0 L 157.0 78.5 L 217.0 78.5 L 169.5 31.0 L 205.0 30.5 L 265.5 93.0 Z"/>
          </svg>
          {loadingTransit ? (
            <span className="animate-pulse">{t("calculating")}</span>
          ) : transitResult ? (
            transitResult.error ? (
              <span className="text-red-500">{t("error")}</span>
            ) : (
              <span>{formatDurationMinutes(transitResult.durationMinutes)}</span>
            )
          ) : (
            t("byTransit")
          )}
        </Button>
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
