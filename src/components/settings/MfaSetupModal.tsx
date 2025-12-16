"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

interface MfaSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface EnrollmentData {
  id: string;
  qr_code: string;
  secret: string;
  uri: string;
}

export function MfaSetupModal({ open, onClose, onSuccess }: MfaSetupModalProps) {
  const [step, setStep] = useState<"qr" | "verify">("qr");
  const [enrollmentData, setEnrollmentData] = useState<EnrollmentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleStartEnrollment = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || "Failed to start enrollment");
      }

      setEnrollmentData(json.data);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start enrollment");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!enrollmentData || !verificationCode.trim()) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factorId: enrollmentData.id,
          code: verificationCode.trim(),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Invalid code");
      }

      onSuccess();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep("qr");
    setEnrollmentData(null);
    setVerificationCode("");
    setError(null);
    onClose();
  };

  const handleCopySecret = () => {
    if (enrollmentData?.secret) {
      navigator.clipboard.writeText(enrollmentData.secret);
      // Could show a toast here
    }
  };

  return (
    <Modal open={open} onClose={handleClose}>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Enable Two-Factor Authentication</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add an extra layer of security to your account
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {step === "qr" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Setup Instructions</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Download Google Authenticator (or any TOTP app) on your phone</li>
                <li>Click "Start Setup" to generate a QR code</li>
                <li>Scan the QR code with your authenticator app</li>
                <li>Enter the 6-digit code to verify</li>
              </ol>
            </div>

            <Button
              onClick={handleStartEnrollment}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Generating QR code..." : "Start Setup"}
            </Button>
          </div>
        )}

        {step === "verify" && enrollmentData && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-lg border-2 border-gray-200 bg-white p-4">
                <img
                  src={enrollmentData.qr_code}
                  alt="QR Code"
                  className="h-64 w-64"
                />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Scan this QR code with Google Authenticator or any TOTP app
              </p>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs text-gray-500 mb-2">Can't scan? Enter this code manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-900">
                  {enrollmentData.secret}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopySecret}
                  className="shrink-0"
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Enter 6-digit code from your app
              </label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setVerificationCode(value);
                  setError(null);
                }}
                placeholder="000000"
                className="text-center text-2xl tracking-widest font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("qr");
                  setEnrollmentData(null);
                  setVerificationCode("");
                  setError(null);
                }}
                disabled={loading}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || verificationCode.length !== 6}
                className="flex-1"
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

