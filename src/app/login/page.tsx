"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const [resumingMfa, setResumingMfa] = useState(false);
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const mfaRequired = searchParams.get("mfa") === "1";
  const idleReason = searchParams.get("reason") === "idle";
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated (e.g., from magic link invite)
  // Also handle hash fragments from Supabase magic links
  useEffect(() => {
    async function checkExistingAuth() {
      try {
        const supabase = createClient();
        
        // Check for hash fragment (Supabase sometimes puts auth data there)
        const hash = window.location.hash;
        if (hash && hash.includes("access_token")) {
          console.log("[Login] Found access_token in hash, letting Supabase handle it...");
          // Supabase client should auto-detect and establish session
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check for URL params that might indicate invite flow
        const urlParams = new URLSearchParams(window.location.search);
        const tokenHash = urlParams.get("token_hash");
        const authType = urlParams.get("type");
        
        if (tokenHash && authType === "invite") {
          console.log("[Login] Found invite token_hash, verifying OTP...");
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "invite",
          });
          
          if (!error && data.user) {
            console.log("[Login] OTP verified, redirecting to setup...");
            window.location.href = "/setup-account";
            return;
          } else {
            console.error("[Login] OTP verification failed:", error);
          }
        }

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          console.log("[Login] User already authenticated:", user.email);
          console.log("[Login] User metadata:", JSON.stringify(user.user_metadata));

          // Check if this is an invited user that needs setup
          const needsSetup = 
            user.user_metadata?.must_change_password === true ||
            user.user_metadata?.must_setup_2fa === true;

          if (needsSetup) {
            console.log("[Login] Invited user needs setup, redirecting...");
            window.location.href = "/setup-account";
            return;
          }

          // User is fully set up, redirect to app
          console.log("[Login] User fully authenticated, redirecting to app...");
          window.location.href = "/calling";
          return;
        } else {
          console.log("[Login] No authenticated user found");
        }
      } catch (err) {
        console.error("[Login] Error checking auth:", err);
      } finally {
        setCheckingAuth(false);
      }
    }

    checkExistingAuth();
  }, []);

  // Resume MFA step if redirected back with ?mfa=1 (e.g., after page refresh during MFA)
  const resumeMfaChallenge = useCallback(async () => {
    setResumingMfa(true);
    setError(null);

    try {
      const supabase = createClient();
      
      // Check if user has a session and MFA factors
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactor = factorsData?.totp?.find((f) => f.status === "verified");

      if (!totpFactor) {
        // No MFA factor found - user may have been signed out
        setResumingMfa(false);
        return;
      }

      setMfaFactorId(totpFactor.id);
      setStep("mfa");
    } catch (err) {
      console.error("[Login] Failed to resume MFA:", err);
    } finally {
      setResumingMfa(false);
    }
  }, []);

  // Check if we need to resume MFA on mount
  useEffect(() => {
    if (mfaRequired && step === "password") {
      resumeMfaChallenge();
    }
  }, [mfaRequired, step, resumeMfaChallenge]);

  async function handlePasswordSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await signIn(formData);

    if (!result.success) {
      setError(result.error || "Login failed");
      setLoading(false);
      return;
    }

    // Check if MFA is required
    if (result.requiresMfa && result.factorId) {
      setMfaFactorId(result.factorId);
      setStep("mfa");
      setLoading(false);
    }
    // If no MFA required, signIn redirects automatically
  }

  async function handleMfaVerify(code: string) {
    if (!mfaFactorId || code.length !== 6) {
      return;
    }

    setVerifyingMfa(true);
    setError(null);

    try {
      const supabase = createClient();

      // Create challenge and verify - all client-side to avoid IP mismatch
      const { data: challengeData, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: mfaFactorId });

      if (challengeError) {
        throw new Error(challengeError.message);
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: code,
      });

      if (verifyError) {
        throw new Error(verifyError.message);
      }

      // Clear the MFA pending cookie via API
      await fetch("/api/auth/mfa/clear-pending", { method: "POST" });

      // MFA verified successfully - hard redirect to ensure session is fresh
      window.location.href = "/calling";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      setMfaCode("");
      setVerifyingMfa(false);
    }
  }

  function handleCodeChange(value: string) {
    setMfaCode(value);
    setError(null);

    // Auto-submit when 6 digits entered
    if (value.length === 6) {
      handleMfaVerify(value);
    }
  }

  function handleBackToPassword() {
    setStep("password");
    setMfaCode("");
    setMfaFactorId(null);
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">QERO CRM</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to your account</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {idleReason && (
            <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Your session expired due to inactivity. Please sign in again.
            </div>
          )}

          {(error || callbackError) && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error || "Authentication failed. Please try again."}
            </div>
          )}

          {checkingAuth ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              <p className="mt-4 text-sm text-gray-500">Checking authentication...</p>
            </div>
          ) : resumingMfa ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              <p className="mt-4 text-sm text-gray-500">Resuming authentication...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {step === "password" ? (
                <motion.div
                  key="password"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <form action={handlePasswordSubmit} className="space-y-4">
                    <Input
                      name="email"
                      type="email"
                      label="Email"
                      placeholder="you@qero.ch"
                      required
                      autoComplete="email"
                    />

                    <Input
                      name="password"
                      type="password"
                      label="Password"
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />

                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>

                  <div className="mt-4 text-center text-sm text-gray-500">
                    Don&apos;t have an account?{" "}
                    <Link
                      href="/register"
                      className="font-medium text-gray-900 hover:underline"
                    >
                      Register
                    </Link>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="mfa"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                      <Shield className="h-7 w-7 text-gray-700" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Two-Factor Authentication
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Enter the 6-digit code from your authenticator app
                    </p>
                  </div>

                  {/* OTP Input */}
                  <div className="flex flex-col items-center gap-4">
                    <InputOTP
                      maxLength={6}
                      value={mfaCode}
                      onChange={handleCodeChange}
                      disabled={verifyingMfa}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                      </InputOTPGroup>
                      <InputOTPSeparator />
                      <InputOTPGroup>
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {/* Buttons */}
                  <div className="space-y-3">
                    <Button
                      onClick={() => handleMfaVerify(mfaCode)}
                      disabled={verifyingMfa || mfaCode.length !== 6}
                      className="w-full"
                    >
                      {verifyingMfa ? "Verifying..." : "Verify Code"}
                    </Button>

                    <button
                      type="button"
                      onClick={handleBackToPassword}
                      disabled={verifyingMfa}
                      className="flex w-full items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Sign In
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Only @qero.ch email addresses are allowed
        </p>
      </motion.div>
    </div>
  );
}
