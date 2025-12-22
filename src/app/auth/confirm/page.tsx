"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";

/**
 * /auth/confirm
 * 
 * Landing page for Supabase magic links (invites, password resets, etc.)
 * Consumes the session from URL hash/params and routes accordingly.
 */
export default function AuthConfirmPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function confirmAuth() {
      try {
        const supabase = createClient();
        
        console.log("[Auth Confirm] Processing authentication...");
        console.log("[Auth Confirm] Full URL:", window.location.href);
        console.log("[Auth Confirm] Hash:", window.location.hash);
        console.log("[Auth Confirm] Search:", window.location.search);

        // Wait a bit for Supabase to process any pending auth state
        await new Promise(resolve => setTimeout(resolve, 500));

        // Get session - for invite flows, Supabase should have already set the session via cookies
        const { data, error } = await supabase.auth.getSession();
        
        console.log("[Auth Confirm] Session check:", { hasSession: !!data.session, error });

        if (!data.session) {
          // No session yet - check if there's a code or hash token to process
          const urlParams = new URLSearchParams(window.location.search);
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          
          const code = urlParams.get("code");
          const accessToken = hashParams.get("access_token") || urlParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token") || urlParams.get("refresh_token");
          
          console.log("[Auth Confirm] Checking URL params:", { 
            hasCode: !!code, 
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken
          });
          
          if (code) {
            console.log("[Auth Confirm] Found code param, exchanging for session...");
            const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            
            if (exchangeError || !sessionData.session) {
              console.error("[Auth Confirm] Code exchange failed:", exchangeError);
              throw new Error(exchangeError?.message || "Failed to establish session");
            }
            
            console.log("[Auth Confirm] Session established via code exchange");
          } else if (accessToken && refreshToken) {
            console.log("[Auth Confirm] Found tokens, setting session...");
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (setSessionError) {
              console.error("[Auth Confirm] Set session failed:", setSessionError);
              throw new Error(setSessionError.message || "Failed to establish session");
            }
            
            console.log("[Auth Confirm] Session established via tokens");
          } else {
            // For invite flows from Supabase, session should be automatically set via cookies
            // Wait a bit more and retry
            console.log("[Auth Confirm] No tokens found, waiting for cookie-based session...");
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const { data: retryData } = await supabase.auth.getSession();
            if (!retryData.session) {
              // One more attempt using refreshSession
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
              if (refreshError || !refreshData.session) {
                throw new Error("No authentication session found. The invite link may have expired. Please request a new invitation.");
              }
            }
          }
        }

        // Get user info
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          throw new Error(userError?.message || "Failed to get user info");
        }

        console.log("[Auth Confirm] User authenticated:", user.email);
        console.log("[Auth Confirm] User metadata:", JSON.stringify(user.user_metadata));

        // Check if user needs setup (invited user)
        const needsSetup = 
          user.user_metadata?.must_change_password === true ||
          user.user_metadata?.must_setup_2fa === true;

        console.log("[Auth Confirm] Needs setup:", needsSetup);

        if (needsSetup) {
          // Check if profile exists, create if not
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id, must_change_password, must_setup_2fa")
            .eq("id", user.id)
            .single();

          if (!existingProfile) {
            console.log("[Auth Confirm] Creating profile for invited user...");
            // Profile doesn't exist - create it
            const { error: insertError } = await supabase
              .from("profiles")
              .insert({
                id: user.id,
                full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
                phone: user.user_metadata?.phone || "",
                team_id: user.user_metadata?.team_id || null,
                must_change_password: true,
                must_setup_2fa: true,
              });

            if (insertError) {
              console.error("[Auth Confirm] Error creating profile:", insertError);
              // Continue anyway - setup page will handle missing profile
            }

            // Mark invitation as accepted if invitation_id exists
            if (user.user_metadata?.invitation_id) {
              await supabase
                .from("user_invitations")
                .update({
                  status: "accepted",
                  accepted_at: new Date().toISOString(),
                })
                .eq("id", user.user_metadata.invitation_id);
            }
          }

          console.log("[Auth Confirm] Redirecting to setup-account...");
          router.replace("/setup-account");
        } else {
          console.log("[Auth Confirm] User fully set up, redirecting to app...");
          router.replace("/calling");
        }
      } catch (err) {
        console.error("[Auth Confirm] Error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Authentication failed");
        setStatus("error");
      }
    }

    confirmAuth();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image
            src="/qero-logo.svg"
            alt="QERO"
            width={120}
            height={40}
            className="h-10 w-auto"
          />
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
          {status === "loading" ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="mt-4 text-sm text-gray-500">
                Authentifizierung wird verarbeitet...
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <svg
                  className="h-8 w-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Authentifizierung fehlgeschlagen
              </h2>
              <p className="text-sm text-gray-600 mb-6">
                {errorMessage || "Bitte versuchen Sie es erneut oder wenden Sie sich an den Support."}
              </p>
              <button
                onClick={() => router.push("/login")}
                className="inline-flex items-center justify-center rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition"
              >
                Zurück zum Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

