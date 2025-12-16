"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mfaStep, setMfaStep] = useState<"password" | "mfa">("password");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [verifyingMfa, setVerifyingMfa] = useState(false);
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  async function handleSubmit(formData: FormData) {
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
      setLoading(false);
      
      // Create MFA challenge
      try {
        const challengeRes = await fetch("/api/auth/mfa/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factorId: result.factorId }),
        });
        const challengeJson = await challengeRes.json();

        if (!challengeRes.ok) {
          throw new Error(challengeJson.error || "Failed to create MFA challenge");
        }

        setMfaChallengeId(challengeJson.data.id);
        setMfaStep("mfa");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start MFA verification");
        setLoading(false);
      }
    }
    // If no MFA required, signIn redirects automatically
  }

  async function handleMfaVerify() {
    if (!mfaFactorId || !mfaChallengeId || !mfaCode.trim()) {
      setError("Please enter the 6-digit code");
      return;
    }

    setVerifyingMfa(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/mfa/verify-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: mfaFactorId,
          challengeId: mfaChallengeId,
          code: mfaCode.trim(),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Invalid code");
      }

      // MFA verified successfully, redirect to app
      router.push("/calling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
      setVerifyingMfa(false);
    }
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
          {(error || callbackError) && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error || "Authentication failed. Please try again."}
            </div>
          )}

          {mfaStep === "password" ? (
            <>
              <form action={handleSubmit} className="space-y-4">
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

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
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
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <div className="space-y-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setMfaCode(value);
                    setError(null);
                  }}
                  placeholder="000000"
                  label="Authentication Code"
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMfaStep("password");
                    setMfaCode("");
                    setMfaFactorId(null);
                    setMfaChallengeId(null);
                    setError(null);
                  }}
                  disabled={verifyingMfa}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleMfaVerify}
                  disabled={verifyingMfa || mfaCode.length !== 6}
                  className="flex-1"
                >
                  {verifyingMfa ? "Verifying..." : "Verify"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Only @qero.ch email addresses are allowed
        </p>
      </motion.div>
    </div>
  );
}

