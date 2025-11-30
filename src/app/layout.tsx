import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { getUser, getProfile } from "@/lib/auth/actions";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QERO CRM - Cold Calling for Recruiters",
  description: "Hyper-focused CRM for recruiters making 100+ calls per day",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();
  const profile = user ? await getProfile() : null;

  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <div className="flex h-screen">
          {user && <Sidebar user={user} profile={profile} />}
          <main className={user ? "flex-1 overflow-hidden" : "flex-1"}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
