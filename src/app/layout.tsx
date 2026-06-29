import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Fraunces } from "next/font/google";
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { HumanBehaviorProvider } from '@/components/humanbehavior-provider';
import { DeferredShell } from '@/components/deferred-shell';
import { ThemedToaster } from '@/components/themed-toaster';
import { SITE_URL } from '@/lib/site';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Stanford Root — Search every Stanford course and evaluation",
  description: "Browse Stanford's full course catalog, read real student course evaluations, and build a conflict-free weekly schedule.",
  applicationName: "Stanford Root",
  openGraph: {
    title: "Stanford Root — Search every Stanford course and evaluation",
    description: "Browse Stanford's full course catalog, read real student course evaluations, and build a conflict-free weekly schedule.",
    url: siteUrl,
    siteName: "Stanford Root",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stanford Root — Search every Stanford course and evaluation",
    description: "Browse Stanford's full course catalog, read real student course evaluations, and build a conflict-free weekly schedule.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${fraunces.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NuqsAdapter>
            <Suspense fallback={null}>
              <AuthProvider>
                {children}
              </AuthProvider>
            </Suspense>
            <AnalyticsProvider />
            <HumanBehaviorProvider />
            <ThemedToaster />
            <DeferredShell />
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
