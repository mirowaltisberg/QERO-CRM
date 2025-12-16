"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { z } from "zod";

// Validation schemas
const emailSchema = z
  .string()
  .email("Invalid email address")
  .refine((email) => email.endsWith("@qero.ch"), {
    message: "Only @qero.ch email addresses are allowed",
  });

const phoneSchema = z
  .string()
  .min(10, "Phone number is too short")
  .refine(
    (phone) => {
      // Swiss phone formats: +41 xx xxx xx xx, 0xx xxx xx xx
      const cleaned = phone.replace(/\s+/g, "");
      return /^(\+41|0)\d{9,10}$/.test(cleaned);
    },
    { message: "Please enter a valid Swiss phone number" }
  );

const RegisterSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2, "Full name is required"),
  phone: phoneSchema,
  teamId: z.string().min(1, "Please select your team"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type AuthResult = {
  success: boolean;
  error?: string;
  requiresMfa?: boolean;
  factorId?: string;
};

export async function signUp(formData: FormData): Promise<AuthResult> {
  const rawData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    fullName: formData.get("fullName") as string,
    phone: formData.get("phone") as string,
    teamId: formData.get("teamId") as string,
  };

  const parsed = RegisterSchema.safeParse(rawData);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return {
      success: false,
      error: issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        phone: parsed.data.phone,
        team_id: parsed.data.teamId,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://qero.international"}/auth/callback`,
    },
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return { success: true };
}

export async function getTeams(): Promise<Array<{ id: string; name: string; color: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, color")
    .order("name");

  if (error) {
    console.error("Error fetching teams:", error);
    return [];
  }

  return data || [];
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const rawData = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const parsed = LoginSchema.safeParse(rawData);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    return {
      success: false,
      error: issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  // Check if user has MFA factors enrolled
  if (data.user) {
    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    
    console.log("[MFA Debug] listFactors response:", {
      factorsData,
      factorsError,
      totp: factorsData?.totp,
      all: factorsData?.all,
    });
    
    const totpFactor = factorsData?.totp?.find((factor: any) => factor.status === "verified");
    
    console.log("[MFA Debug] Found TOTP factor:", totpFactor);
    
    if (totpFactor) {
      // User has MFA enabled, return factor ID for challenge (don't redirect)
      return {
        success: true,
        requiresMfa: true,
        factorId: totpFactor.id,
      };
    }
  }

  // No MFA required, redirect to app
  redirect("/calling");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function resetPassword(formData: FormData): Promise<AuthResult> {
  const email = formData.get("email") as string;

  if (!email) {
    return { success: false, error: "Email is required" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "https://qero.international"}/auth/reset-password`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updatePassword(formData: FormData): Promise<AuthResult> {
  const password = formData.get("password") as string;

  if (!password || password.length < 8) {
    return { success: false, error: "Password must be at least 8 characters" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      *,
      team:teams(id, name, color)
    `)
    .eq("id", user.id)
    .single();

  return profile;
}

