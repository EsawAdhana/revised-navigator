import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { AnalyticsProvider } from '@/components/analytics-provider';
import { DeferredShell } from '@/components/deferred-shell';
import { ThemedToaster } from '@/components/themed-toaster';
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://stanford-root.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Stanford Root — A better way to browse Stanford courses",
  description: "Search Stanford's full course catalog, read student evaluations, and build your weekly schedule — fast, clean, and free.",
  applicationName: "Stanford Root",
  openGraph: {
    title: "Stanford Root — A better way to browse Stanford courses",
    description: "Search Stanford's full course catalog, read student evaluations, and build your weekly schedule.",
    url: siteUrl,
    siteName: "Stanford Root",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stanford Root — A better way to browse Stanford courses",
    description: "Search Stanford's full course catalog, read student evaluations, and build your weekly schedule.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${outfit.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NuqsAdapter>
            <AuthProvider>
              {children}
            </AuthProvider>
            <AnalyticsProvider />
            <ThemedToaster />
            <DeferredShell />
          </NuqsAdapter>
        </ThemeProvider>
      </body>
    </html>
  );
}
