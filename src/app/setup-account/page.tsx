"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Step = "password" | "2fa-enroll" | "2fa-verify" | "complete";

export default function SetupAccountPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("password");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password step
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordUpdating, setPasswordUpdating] = useState(false);

  // 2FA step
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  // User info
  const [userName, setUserName] = useState<string | null>(null);

  // Check authentication and setup requirements on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/login");
          return;
        }

        setUserName(user.user_metadata?.full_name || user.email || "User");

        // Check if user needs to complete setup
        const { data: profile } = await supabase
          .from("profiles")
          .select("must_change_password, must_setup_2fa")
          .eq("id", user.id)
          .single();

        if (!profile) {
          // New user from invitation - needs full setup
          setStep("password");
        } else if (profile.must_change_password) {
          setStep("password");
        } else if (profile.must_setup_2fa) {
          setStep("2fa-enroll");
        } else {
          // No setup needed, redirect to app
          router.replace("/calling");
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error("Auth check error:", err);
        router.replace("/login");
      }
    }

    checkAuth();
  }, [supabase, router]);

  // Handle password update
  const handlePasswordSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein");
      return;
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein");
      return;
    }

    setPasswordUpdating(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      // Clear the must_change_password flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ must_change_password: false })
          .eq("id", user.id);
      }

      setSuccess("Passwort erfolgreich geändert!");
      
      // Move to 2FA step after a brief delay
      setTimeout(() => {
        setSuccess(null);
        setStep("2fa-enroll");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Ändern des Passworts");
    } finally {
      setPasswordUpdating(false);
    }
  }, [password, confirmPassword, supabase]);

  // Start 2FA enrollment
  const handleStartEnrollment = useCallback(async () => {
    setError(null);
    setEnrolling(true);

    try {
      const response = await fetch("/api/auth/mfa/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendlyName: "QERO CRM" }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Enrollment failed");
      }

      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("2fa-verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler bei der 2FA-Einrichtung");
    } finally {
      setEnrolling(false);
    }
  }, []);

  // Verify 2FA code
  const handleVerify2FA = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (verifyCode.length !== 6) {
      setError("Bitte geben Sie einen 6-stelligen Code ein");
      return;
    }

    setVerifying(true);

    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId,
          code: verifyCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Verification failed");
      }

      // Clear the must_setup_2fa flag
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ must_setup_2fa: false })
          .eq("id", user.id);
      }

      setStep("complete");
      
      // Redirect to app after showing success
      setTimeout(() => {
        router.replace("/calling");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ungültiger Code");
    } finally {
      setVerifying(false);
    }
  }, [verifyCode, factorId, supabase, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
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
          {/* Welcome header */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              {step === "complete" ? "Geschafft! 🎉" : `Willkommen, ${userName}!`}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              {step === "password" && "Bitte legen Sie Ihr sicheres Passwort fest"}
              {step === "2fa-enroll" && "Zum Schutz Ihres Kontos aktivieren Sie jetzt 2FA"}
              {step === "2fa-verify" && "Scannen Sie den QR-Code und geben Sie den Code ein"}
              {step === "complete" && "Ihr Konto ist vollständig eingerichtet"}
            </p>
          </div>

          {/* Progress indicator */}
          {step !== "complete" && (
            <div className="mb-8 flex items-center justify-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  step === "password"
                    ? "bg-blue-500 text-white"
                    : "bg-green-500 text-white"
                }`}
              >
                {step === "password" ? "1" : "✓"}
              </div>
              <div className="h-0.5 w-12 bg-gray-200" />
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  step === "password"
                    ? "bg-gray-200 text-gray-500"
                    : "bg-blue-500 text-white"
                }`}
              >
                2
              </div>
            </div>
          )}

          {/* Error/Success messages */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600">
              {success}
            </div>
          )}

          {/* Step: Password */}
          {step === "password" && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Neues Passwort
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Passwort bestätigen
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Passwort wiederholen"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={passwordUpdating || !password || !confirmPassword}
              >
                {passwordUpdating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Wird gespeichert...
                  </span>
                ) : (
                  "Weiter"
                )}
              </Button>
            </form>
          )}

          {/* Step: 2FA Enrollment */}
          {step === "2fa-enroll" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <div className="flex gap-3">
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-blue-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Zwei-Faktor-Authentifizierung</p>
                    <p className="mt-1 text-blue-700">
                      Verwenden Sie eine Authenticator-App wie Google Authenticator oder Authy.
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleStartEnrollment}
                className="w-full"
                disabled={enrolling}
              >
                {enrolling ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Wird vorbereitet...
                  </span>
                ) : (
                  "2FA einrichten"
                )}
              </Button>
            </div>
          )}

          {/* Step: 2FA Verify */}
          {step === "2fa-verify" && (
            <div className="space-y-4">
              {qrCode && (
                <div className="flex justify-center">
                  <img
                    src={qrCode}
                    alt="QR Code"
                    className="h-48 w-48 rounded-lg border border-gray-200"
                  />
                </div>
              )}
              {secret && (
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">Oder manuell eingeben:</p>
                  <code className="text-sm font-mono text-gray-700">{secret}</code>
                </div>
              )}
              <form onSubmit={handleVerify2FA} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Verifizierungscode
                  </label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="text-center text-xl tracking-widest"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verifying || verifyCode.length !== 6}
                >
                  {verifying ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Wird verifiziert...
                    </span>
                  ) : (
                    "Bestätigen"
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* Step: Complete */}
          {step === "complete" && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-gray-600">
                Sie werden zum QERO CRM weitergeleitet...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

