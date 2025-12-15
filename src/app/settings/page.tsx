import { redirect } from "next/navigation";
import { getUser, getProfile } from "@/lib/auth/actions";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getUser();
  
  if (!user) {
    redirect("/login");
  }

  const profile = await getProfile();

  return (
    <div className="h-full overflow-y-auto">
      <div 
        className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Account Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your profile and account preferences
          </p>
        </div>

        <SettingsForm
          user={user}
          profile={profile}
        />
      </div>
    </div>
  );
}

