"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { signOut } from "@/lib/auth/actions";
import { motion } from "framer-motion";
import { Modal } from "@/components/ui/modal";

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
  const [cropSource, setCropSource] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);

  const supabase = createClient();

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
        const fileExt = originalName.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = `${user.id}/avatar.${fileExt}`;
        const croppedFile = new File([blob], `avatar.${fileExt}`, { type: blob.type || "image/jpeg" });

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, croppedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(fileName);

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

      {/* Danger Zone */}
      <Panel title="Sign Out" description="Sign out of your account">
        <form action={signOut}>
          <Button type="submit" variant="danger">
            Sign Out
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
    </div>
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

        const cropWidth = width / zoom;
        const cropHeight = height / zoom;
        const maxShiftX = width - cropWidth;
        const maxShiftY = height - cropHeight;
        const originX = ((offsetX + 1) / 2) * maxShiftX;
        const originY = ((offsetY + 1) / 2) * maxShiftY;

        ctx.drawImage(image, originX, originY, cropWidth, cropHeight, 0, 0, size, size);
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

