"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { signOut } from "@/lib/auth/actions";
import { motion } from "framer-motion";
import { Modal } from "@/components/ui/modal";
import type { EmailAccount } from "@/lib/types";
import type { Locale } from "@/i18n/config";
import { Changelog } from "./Changelog";
import { MfaSetupModal } from "./MfaSetupModal";
import { InviteUserModal } from "./InviteUserModal";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";

interface Profile {
  id: string;
  full_name: string;
  phone: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SettingsFormProps {
  user: User;
  profile: Profile | null;
}

export function SettingsForm({ user, profile }: SettingsFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [cropSource, setCropSource] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);

  // Email integration state
  const [emailAccount, setEmailAccount] = useState<EmailAccount | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  // Signature state
  const [signatureText, setSignatureText] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureLoading, setSignatureLoading] = useState(true);
  const [savingSignature, setSavingSignature] = useState(false);
  const [isDefaultSignature, setIsDefaultSignature] = useState(true);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  const [disablingMfa, setDisablingMfa] = useState(false);
  const [resettingMfa, setResettingMfa] = useState(false);

  // Admin invite state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [teams, setTeams] = useState<Array<{ id: string; name: string; color: string | null }>>([]);
  const isAdmin = isCleanupAllowed(user.email);

  const supabase = createClient();

  // Fetch email account status on mount
  useEffect(() => {
    async function fetchEmailAccount() {
      try {
        const response = await fetch("/api/email/account");
        const json = await response.json();
        if (response.ok && json.data) {
          setEmailAccount(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch email account:", err);
      } finally {
        setEmailLoading(false);
      }
    }
    fetchEmailAccount();
  }, []);

  // Fetch teams for admin invite (only for admins)
  useEffect(() => {
    if (!isAdmin) return;
    async function fetchTeams() {
      try {
        const response = await fetch("/api/teams");
        const json = await response.json();
        if (response.ok && json.data) {
          setTeams(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch teams:", err);
      }
    }
    fetchTeams();
  }, [isAdmin]);

  // Fetch signature on mount
  useEffect(() => {
    async function fetchSignature() {
      try {
        const response = await fetch("/api/settings/signature");
        const json = await response.json();
        if (response.ok && json.data) {
          setSignatureText(json.data.signature_text || "");
          setSignatureHtml(json.data.signature_html || "");
          setIsDefaultSignature(json.data.is_default);
        }
      } catch (err) {
        console.error("Failed to fetch signature:", err);
      } finally {
        setSignatureLoading(false);
      }
    }
    fetchSignature();
  }, []);

  // Fetch MFA status on mount
  useEffect(() => {
    async function fetchMfaStatus() {
      try {
        const response = await fetch("/api/auth/mfa/status");
        const json = await response.json();
        if (response.ok && json.data) {
          setMfaEnabled(json.data.enabled);
          setMfaFactorId(json.data.factor?.id || null);
        }
      } catch (err) {
        console.error("Failed to fetch MFA status:", err);
      } finally {
        setMfaLoading(false);
      }
    }
    fetchMfaStatus();
  }, []);

  // Handle OAuth callback messages
  useEffect(() => {
    const emailConnected = searchParams.get("email_connected");
    const error = searchParams.get("error");

    if (emailConnected === "true") {
      setMessage({ type: "success", text: "Outlook connected successfully!" });
      // Refresh email account status
      fetch("/api/email/account")
        .then((res) => res.json())
        .then((json) => {
          if (json.data) setEmailAccount(json.data);
        });
      // Clean URL
      router.replace("/settings", { scroll: false });
    } else if (error) {
      const errorMessages: Record<string, string> = {
        config: "Email integration is not configured. Contact support.",
        missing_params: "OAuth parameters missing. Please try again.",
        expired_state: "OAuth session expired. Please try again.",
        invalid_state: "Invalid OAuth state. Please try again.",
        token_exchange: "Failed to authenticate with Microsoft.",
        user_info: "Failed to get user info from Microsoft.",
        db_error: "Failed to save email account.",
        access_denied: "Access was denied. Please grant permissions.",
        unknown: "An unknown error occurred.",
      };
      setMessage({ type: "error", text: errorMessages[error] || `Error: ${error}` });
      router.replace("/settings", { scroll: false });
    }
  }, [searchParams, router]);

  // Signature handlers
  async function handleSaveSignature() {
    setSavingSignature(true);
    try {
      const response = await fetch("/api/settings/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature_text: signatureText,
          signature_html: signatureHtml,
        }),
      });
      if (response.ok) {
        setMessage({ type: "success", text: "Signature saved!" });
        setIsDefaultSignature(false);
      } else {
        throw new Error("Failed to save signature");
      }
    } catch (err) {
      console.error("Save signature error:", err);
      setMessage({ type: "error", text: "Failed to save signature." });
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleResetSignature() {
    if (!confirm("Reset to default signature?")) return;
    setSavingSignature(true);
    try {
      const response = await fetch("/api/settings/signature", { method: "DELETE" });
      const json = await response.json();
      if (response.ok && json.data) {
        setSignatureText(json.data.signature_text || "");
        setSignatureHtml(json.data.signature_html || "");
        setIsDefaultSignature(true);
        setMessage({ type: "success", text: "Signature reset to default!" });
      } else {
        throw new Error("Failed to reset signature");
      }
    } catch (err) {
      console.error("Reset signature error:", err);
      setMessage({ type: "error", text: "Failed to reset signature." });
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleDisconnectEmail() {
    if (!confirm("Disconnect your Outlook account? This will remove all synced emails.")) return;
    setDisconnecting(true);
    try {
      const response = await fetch("/api/email/auth/disconnect", { method: "POST" });
      if (response.ok) {
        setEmailAccount(null);
        setMessage({ type: "success", text: "Outlook disconnected." });
      } else {
        throw new Error("Failed to disconnect");
      }
    } catch (err) {
      console.error("Disconnect error:", err);
      setMessage({ type: "error", text: "Failed to disconnect email account." });
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleDisableMfa() {
    if (!confirm("Disable two-factor authentication? Your account will be less secure.")) return;
    if (!mfaFactorId) return;

    setDisablingMfa(true);
    try {
      const response = await fetch(`/api/auth/mfa/unenroll?factorId=${mfaFactorId}`, {
        method: "DELETE",
      });
      const json = await response.json();

      if (response.ok) {
        setMfaEnabled(false);
        setMfaFactorId(null);
        setMessage({ type: "success", text: "Two-factor authentication disabled." });
      } else {
        throw new Error(json.error || "Failed to disable MFA");
      }
    } catch (err) {
      console.error("Disable MFA error:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to disable two-factor authentication.",
      });
    } finally {
      setDisablingMfa(false);
    }
  }

  function handleMfaSetupSuccess() {
    setMfaEnabled(true);
    // Refetch MFA status to get the factor ID
    fetch("/api/auth/mfa/status")
      .then((res) => res.json())
      .then((json) => {
        if (json.data) {
          setMfaFactorId(json.data.factor?.id || null);
        }
      });
    setMessage({ type: "success", text: "Two-factor authentication enabled successfully!" });
  }

  async function handleResetMfa() {
    if (!confirm("This will remove ALL 2FA factors (including failed setup attempts). Continue?")) return;

    setResettingMfa(true);
    try {
      const response = await fetch("/api/auth/mfa/reset", { method: "DELETE" });
      const json = await response.json();

      if (response.ok) {
        setMfaEnabled(false);
        setMfaFactorId(null);
        setMessage({ 
          type: "success", 
          text: json.message || "All 2FA factors removed. You can now set up 2FA again." 
        });
      } else {
        throw new Error(json.error || "Failed to reset MFA");
      }
    } catch (err) {
      console.error("Reset MFA error:", err);
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to reset two-factor authentication.",
      });
    } finally {
      setResettingMfa(false);
    }
  }

  const openCropper = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      setCropSource({
        file,
        url: objectUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setMessage({ type: "error", text: "Failed to load image preview" });
    };
    img.src = objectUrl;
  }, []);

  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please upload an image file" });
      resetFileInput();
      return;
    }

    setMessage(null);
    openCropper(file);
  }

  const handleCropCancel = useCallback(() => {
    if (cropSource) {
      URL.revokeObjectURL(cropSource.url);
    }
    setCropSource(null);
    resetFileInput();
  }, [cropSource]);

  const uploadCroppedAvatar = useCallback(
    async (blob: Blob, originalName: string) => {
      setUploadingAvatar(true);
      try {
        const fileExt = (originalName.split(".").pop() || "jpg").toLowerCase();
        const timestamp = Date.now();
        const storagePath = `${user.id}/avatar-${timestamp}.${fileExt}`;
        const croppedFile = new File([blob], `avatar-${timestamp}.${fileExt}`, {
          type: blob.type || `image/${fileExt}`,
        });

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(storagePath, croppedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(storagePath);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq("id", user.id);

        if (updateError) throw updateError;

        // Append cache buster so the new image loads immediately everywhere
        setAvatarUrl(`${publicUrl}?v=${timestamp}`);
        setMessage({ type: "success", text: "Avatar updated!" });
        router.refresh();
      } catch (error) {
        console.error("Avatar upload error:", error);
        setMessage({ type: "error", text: "Failed to upload avatar" });
      } finally {
        setUploadingAvatar(false);
      }
    },
    [router, supabase, user.id]
  );

  const handleCropSave = useCallback(
    async (blob: Blob) => {
      if (!cropSource) return;
      await uploadCroppedAvatar(blob, cropSource.file.name);
      handleCropCancel();
    },
    [cropSource, uploadCroppedAvatar, handleCropCancel]
  );

  async function handleSaveProfile() {
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone: phone,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setMessage({ type: "success", text: "Profile saved!" });
      router.refresh();
    } catch (error) {
      console.error("Save profile error:", error);
      setMessage({ type: "error", text: "Failed to save profile" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(formData: FormData) {
    const newPassword = formData.get("newPassword") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setMessage({ type: "success", text: "Password updated!" });
      
      // Clear form
      const form = document.getElementById("password-form") as HTMLFormElement;
      form?.reset();
    } catch (error) {
      console.error("Change password error:", error);
      setMessage({ type: "error", text: "Failed to change password" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-xl px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </motion.div>
      )}

      {/* Profile Section */}
      <Panel title="Profile" description="Your personal information">
        <div className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div
              className="group relative h-20 w-20 cursor-pointer overflow-hidden rounded-full bg-gray-100"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={80}
                  height={80}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-medium text-gray-400">
                  {fullName?.charAt(0)?.toUpperCase() || "?"}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                {uploadingAvatar ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Profile Photo</p>
              <p className="text-xs text-gray-500">Click to upload (crop before save)</p>
            </div>
          </div>

          {/* Name & Phone */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Max Muster"
            />
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 123 45 67"
            />
          </div>

          {/* Email (read-only) */}
          <Input
            label="Email"
            value={user.email || ""}
            disabled
            hint="Email cannot be changed"
          />

          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </Panel>

      {/* Password Section */}
      <Panel title="Change Password" description="Update your password">
        <form id="password-form" action={handleChangePassword} className="space-y-4">
          <Input
            name="newPassword"
            type="password"
            label="New Password"
            placeholder="••••••••"
            hint="Minimum 8 characters"
          />
          <Input
            name="confirmPassword"
            type="password"
            label="Confirm Password"
            placeholder="••••••••"
          />
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </Panel>

      {/* Email Integration */}
      <Panel title="Email Integration" description="Connect your Outlook account to send and receive emails">
        {emailLoading ? (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Loading...
          </div>
        ) : emailAccount ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <OutlookIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{emailAccount.mailbox}</p>
                <p className="text-xs text-gray-500">
                  {emailAccount.last_sync_at
                    ? `Last synced ${formatRelativeTime(emailAccount.last_sync_at)}`
                    : "Not synced yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              </div>
            </div>
            {emailAccount.sync_error && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                Sync error: {emailAccount.sync_error}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisconnectEmail}
                disabled={disconnecting}
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Connect your Microsoft 365 / Outlook account to send and receive emails directly from QERO.
            </p>
            <a
              href="/api/email/auth/connect"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 hover:border-gray-300"
            >
              <OutlookIcon className="h-5 w-5 text-blue-600" />
              Connect Outlook
            </a>
          </div>
        )}
      </Panel>


      {/* Email Signature */}
      {emailAccount && (
        <Panel title="Email Signature" description="Customize your email signature">
          {signatureLoading ? (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              Loading...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-gray-400">
                  Plain Text (shown in compose)
                </label>
                <textarea
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="Enter your signature..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-gray-400">
                  HTML (used when sending)
                </label>
                <textarea
                  value={signatureHtml}
                  onChange={(e) => setSignatureHtml(e.target.value)}
                  rows={10}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-mono text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  placeholder="Enter HTML signature..."
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {isDefaultSignature ? "Using default signature" : "Custom signature"}
                </div>
                <div className="flex gap-2">
                  {!isDefaultSignature && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleResetSignature}
                      disabled={savingSignature}
                    >
                      Reset to Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveSignature}
                    disabled={savingSignature}
                  >
                    {savingSignature ? "Saving..." : "Save Signature"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* Two-Factor Authentication */}
      <Panel title="Two-Factor Authentication" description="Add an extra layer of security to your account">
        {mfaLoading ? (
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
            Loading...
          </div>
        ) : mfaEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">Two-Factor Authentication Enabled</p>
                <p className="text-xs text-gray-500">
                  Your account is protected with an authenticator app
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Active
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={handleDisableMfa}
                disabled={disablingMfa}
              >
                {disablingMfa ? "Disabling..." : "Disable 2FA"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p className="font-medium">Protect your account</p>
              <p className="mt-1 text-blue-600">
                Enable two-factor authentication to require a code from your phone in addition to your password when signing in.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setMfaSetupOpen(true)} className="w-full sm:w-auto">
                Enable Two-Factor Authentication
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleResetMfa}
                disabled={resettingMfa}
                className="text-gray-500"
              >
                {resettingMfa ? "Resetting..." : "Reset failed attempts"}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* Language */}
      <Panel title={t("language")} description={t("languageDescription")}>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {locale === "de" ? "Deutsch" : "English"}
          </div>
          <LanguageSwitcher currentLocale={locale} variant="buttons" />
        </div>
      </Panel>

      {/* Admin Section - Only visible to admins */}
      {isAdmin && (
        <Panel title={t("adminSection")} description={t("teamManagement")}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{t("inviteUser")}</p>
                <p className="text-xs text-gray-500">
                  Senden Sie eine Einladung per Magic Link
                </p>
              </div>
              <Button
                onClick={() => setInviteModalOpen(true)}
                className="flex items-center gap-2"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                {t("inviteUser")}
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {/* Changelog */}
      <Changelog />

      {/* Danger Zone */}
      <Panel title={tCommon("logout")} description="Sign out of your account">
        <form action={signOut}>
          <Button type="submit" variant="danger">
            {tCommon("logout")}
          </Button>
        </form>
      </Panel>
      {cropSource && (
        <AvatarCropModal
          url={cropSource.url}
          width={cropSource.width}
          height={cropSource.height}
          onCancel={handleCropCancel}
          onConfirm={handleCropSave}
          loading={uploadingAvatar}
        />
      )}

      <MfaSetupModal
        open={mfaSetupOpen}
        onClose={() => setMfaSetupOpen(false)}
        onSuccess={handleMfaSetupSuccess}
      />

      {isAdmin && (
        <InviteUserModal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          teams={teams}
        />
      )}
    </div>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

interface AvatarCropModalProps {
  url: string;
  width: number;
  height: number;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void>;
}

function AvatarCropModal({ url, width, height, loading, onCancel, onConfirm }: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1.2);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    const sensitivity = 220;
    setOffset((prev) => ({
      x: clamp(prev.x + deltaX / sensitivity, -1, 1),
      y: clamp(prev.y + deltaY / sensitivity, -1, 1),
    }));
    dragRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const blob = await generateCroppedBlob(url, width, height, zoom, offset.x, offset.y);
      await onConfirm(blob);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={loading ? () => {} : onCancel}>
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900">Adjust avatar</h3>
          <p className="text-sm text-gray-500">Drag the image to reposition. Use the slider to zoom.</p>
        </div>
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-48 w-48 overflow-hidden rounded-full bg-gray-100 shadow-inner border border-gray-200">
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              style={{
                backgroundImage: `url(${url})`,
                backgroundSize: `${zoom * 100}%`,
                backgroundPosition: `${50 + offset.x * 50}% ${50 + offset.y * 50}%`,
                backgroundRepeat: "no-repeat",
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => (dragRef.current = null)}
            />
          </div>
          <label className="w-full text-xs uppercase text-gray-400">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full mt-1"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving || loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving || loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function generateCroppedBlob(
  url: string,
  width: number,
  height: number,
  zoom: number,
  offsetX: number,
  offsetY: number
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    const image = new window.Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 512;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }

        const squareBase = Math.min(width, height);
        const cropSize = squareBase / zoom;
        const maxShiftX = Math.max(0, width - cropSize);
        const maxShiftY = Math.max(0, height - cropSize);
        const originX = clamp(((offsetX + 1) / 2) * maxShiftX, 0, maxShiftX);
        const originY = clamp(((offsetY + 1) / 2) * maxShiftY, 0, maxShiftY);

        ctx.drawImage(image, originX, originY, cropSize, cropSize, 0, 0, size, size);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create avatar blob"));
        }, "image/jpeg", 0.9);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = url;
  });
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.88 12.04q0 .45-.11.87-.1.41-.33.74-.22.33-.58.52-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55-.22-.33-.33-.75-.1-.42-.1-.86t.1-.87q.1-.43.34-.76.22-.34.59-.54.36-.2.87-.2t.86.2q.35.21.57.55.22.34.31.77.1.43.1.88zM24 12v9.38q0 .46-.33.8-.33.32-.8.32H7.13q-.46 0-.8-.33-.32-.33-.32-.8V18H1q-.41 0-.7-.3-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75.3-.3.75-.3h12.9q.44 0 .75.3.3.3.3.75V12zm-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5 1.34-.8v-2.73zM9 3.75V6h2l.13.01.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3.7-.32 1.19-.86.48-.55.73-1.28.25-.74.25-1.61 0-.83-.25-1.55-.24-.71-.71-1.24t-1.15-.83q-.68-.3-1.55-.3-.92 0-1.64.3-.71.3-1.2.85-.5.54-.75 1.3-.25.74-.25 1.63 0 .85.26 1.56.26.72.74 1.23.48.52 1.17.81.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z" />
    </svg>
  );
}

