"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { signOut } from "@/lib/auth/actions";
import { motion } from "framer-motion";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
  
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createClient();

  async function handleAvatarUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "Please upload an image file" });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: "error", text: "Image must be less than 2MB" });
      return;
    }

    setUploadingAvatar(true);
    setMessage(null);

    try {
      // Create unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      setMessage({ type: "success", text: "Avatar updated!" });
      router.refresh();
    } catch (error) {
      console.error("Avatar upload error:", error);
      setMessage({ type: "error", text: "Failed to upload avatar" });
    } finally {
      setUploadingAvatar(false);
    }
  }

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
                <img
                  src={avatarUrl}
                  alt="Avatar"
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
              <p className="text-xs text-gray-500">Click to upload (max 2MB)</p>
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

      {/* Danger Zone */}
      <Panel title="Sign Out" description="Sign out of your account">
        <form action={signOut}>
          <Button type="submit" variant="danger">
            Sign Out
          </Button>
        </form>
      </Panel>
    </div>
  );
}

