/**
 * Travel-related helper functions for routing and Google Maps integration
 */

export type TravelMode = "driving" | "transit";

export interface GoogleMapsDirectionsParams {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  mode: TravelMode;
}

/**
 * Build a Google Maps directions URL with prefilled origin, destination, and travel mode
 * 
 * @example
 * buildGoogleMapsDirectionsUrl({
 *   fromLat: 47.3769,
 *   fromLng: 8.5417,
 *   toLat: 47.0502,
 *   toLng: 8.3093,
 *   mode: "driving"
 * })
 * // Returns: "https://www.google.com/maps/dir/?api=1&origin=47.3769,8.5417&destination=47.0502,8.3093&travelmode=driving"
 */
export function buildGoogleMapsDirectionsUrl(params: GoogleMapsDirectionsParams): string {
  const { fromLat, fromLng, toLat, toLng, mode } = params;
  
  const origin = `${fromLat},${fromLng}`;
  const destination = `${toLat},${toLng}`;
  
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
}

/**
 * Parse Swiss transport API duration format
 * Format: "DDdHH:MM:SS" (e.g., "00d00:47:00" = 47 minutes)
 * 
 * @param duration - Duration string from transport.opendata.ch API
 * @returns Duration in seconds
 * 
 * @example
 * parseTransportApiDuration("00d00:47:00") // Returns: 2820 (47 minutes)
 * parseTransportApiDuration("00d01:30:00") // Returns: 5400 (1.5 hours)
 * parseTransportApiDuration("01d02:15:30") // Returns: 94530 (1 day, 2 hours, 15 minutes, 30 seconds)
 */
export function parseTransportApiDuration(duration: string): number {
  // Format: DDdHH:MM:SS
  const match = duration.match(/^(\d+)d(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  
  const [, days, hours, minutes, seconds] = match;
  return (
    parseInt(days, 10) * 86400 +
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10)
  );
}

/**
 * Format duration in minutes for display
 * 
 * @param minutes - Duration in minutes
 * @returns Formatted string like "47 min" or "1h 30min"
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}min`;
}
