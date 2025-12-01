"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { signUp, getTeams } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";

interface Team {
  id: string;
  name: string;
  color: string | null;
}

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");

  useEffect(() => {
    getTeams().then(setTeams);
  }, []);

  async function handleSubmit(formData: FormData) {
    if (!selectedTeam) {
      setError("Please select your team");
      return;
    }
    
    setLoading(true);
    setError(null);

    formData.set("teamId", selectedTeam);
    const result = await signUp(formData);
    
    if (result.success) {
      setSuccess(true);
    } else {
      setError(result.error || "Registration failed");
    }
    setLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm text-center"
        >
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Check your email</h2>
            <p className="mt-2 text-sm text-gray-500">
              We&apos;ve sent a confirmation link to your email address. Click the link to activate your account.
            </p>
            <Link href="/login">
              <Button variant="secondary" className="mt-6 w-full">
                Back to login
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
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
          <p className="mt-2 text-sm text-gray-500">Create your account</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form action={handleSubmit} className="space-y-4">
            <Input
              name="fullName"
              type="text"
              label="Full Name"
              placeholder="Max Muster"
              required
              autoComplete="name"
            />

            <Input
              name="phone"
              type="tel"
              label="Phone Number"
              placeholder="+41 79 123 45 67"
              hint="Swiss phone number"
              required
              autoComplete="tel"
            />

            <Input
              name="email"
              type="email"
              label="Email"
              placeholder="you@qero.ch"
              hint="Only @qero.ch emails allowed"
              required
              autoComplete="email"
            />

            <Input
              name="password"
              type="password"
              label="Password"
              placeholder="••••••••"
              hint="Minimum 8 characters"
              required
              autoComplete="new-password"
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Team / Vertical
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 transition-colors focus:border-gray-400 focus:outline-none focus:ring-0"
                required
              >
                <option value="">Select your team...</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-gray-400">
                Which industry vertical do you work with?
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-gray-900 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

