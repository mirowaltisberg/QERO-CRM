"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const ACTIVITY_THROTTLE_MS = 30 * 1000; // Only update localStorage once per 30 seconds
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const STORAGE_KEY = "qero_last_activity";

/**
 * Hook that signs out the user after 4 hours of inactivity.
 * 
 * Activity is tracked via:
 * - Mouse/touch events (click, touchstart, mousemove)
 * - Keyboard events (keydown)
 * - Scroll events
 * 
 * Checks are performed:
 * - On mount
 * - On visibility change (when user returns to tab/app)
 * - On a periodic interval
 * 
 * @param enabled - Whether the hook should be active (pass false when user is not authenticated)
 */
export function useIdleLogout(enabled: boolean = true) {
  const router = useRouter();
  const lastActivityWriteRef = useRef<number>(0);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sign out and redirect to login
  const performLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[IdleLogout] Error signing out:", err);
    }
    
    // Clear the activity timestamp
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
    
    // Redirect to login with reason
    router.push("/login?reason=idle");
  }, [router]);

  // Check if user has been idle too long
  const checkIdleTimeout = useCallback(() => {
    try {
      const lastActivity = localStorage.getItem(STORAGE_KEY);
      
      if (!lastActivity) {
        // No recorded activity - set it now
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        return;
      }
      
      const elapsed = Date.now() - parseInt(lastActivity, 10);
      
      if (elapsed >= IDLE_TIMEOUT_MS) {
        console.log("[IdleLogout] User idle for", Math.round(elapsed / 60000), "minutes. Signing out.");
        performLogout();
      }
    } catch (err) {
      // localStorage might not be available (SSR, private mode, etc.)
      console.warn("[IdleLogout] Could not check idle timeout:", err);
    }
  }, [performLogout]);

  // Update the last activity timestamp (throttled)
  const updateActivity = useCallback(() => {
    const now = Date.now();
    
    // Throttle writes to localStorage
    if (now - lastActivityWriteRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    
    lastActivityWriteRef.current = now;
    
    try {
      localStorage.setItem(STORAGE_KEY, now.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Handle visibility change (user returns to tab/app)
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible") {
      checkIdleTimeout();
    }
  }, [checkIdleTimeout]);

  useEffect(() => {
    // Skip if not enabled (user not authenticated)
    if (!enabled) {
      return;
    }

    // Initial check on mount
    checkIdleTimeout();

    // Set up activity listeners
    const activityEvents = ["click", "touchstart", "mousemove", "keydown", "scroll"];
    
    activityEvents.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Set up visibility change listener
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Set up periodic check
    checkIntervalRef.current = setInterval(checkIdleTimeout, CHECK_INTERVAL_MS);

    // Update activity on mount
    updateActivity();

    return () => {
      // Clean up listeners
      activityEvents.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
      
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [enabled, checkIdleTimeout, updateActivity, handleVisibilityChange]);
}
