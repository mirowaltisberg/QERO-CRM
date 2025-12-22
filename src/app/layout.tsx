import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { Providers } from "@/components/layout/Providers";
import { getUser, getProfile } from "@/lib/auth/actions";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QERO CRM - Cold Calling for Recruiters v1.55.2",
  description: "Hyper-focused CRM for recruiters making 100+ calls per day",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QERO CRM",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/qero-logo.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();
  const profile = user ? await getProfile() : null;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              console.log('%c╔══════════════════════════════════════════════════════════╗', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║                                                          ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║  🚀  QERO Momentum                 ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║                                                          ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║  Made with ❤️  by Miró Waltisberg                       ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║  📞 +41 76 703 77 00                                    ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║  🏢 QERO AG                                             ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c║                                                          ║', 'color: #3b82f6; font-weight: bold;');
              console.log('%c╚══════════════════════════════════════════════════════════╝', 'color: #3b82f6; font-weight: bold;');
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers user={user} profile={profile}>
            <AppShell user={user} profile={profile}>
              {children}
            </AppShell>
          </Providers>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}

