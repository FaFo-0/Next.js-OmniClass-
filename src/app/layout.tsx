import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./providers";
import { OMNICA_FALLBACK } from "@/lib/brand/fallback";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800"],
});

// SSR-time metadata uses the static fallback (Omnica English defaults).
// Once the client mounts, BrandProvider hydrates the actual tenantSettings
// from Convex and updates the runtime CSS vars.
export function generateMetadata(): Metadata {
  const brand = OMNICA_FALLBACK;
  return {
    title: brand.name,
    description: brand.tagline ?? "OmniClass — class management platform",
    icons: brand.faviconUrl
      ? [{ rel: "icon", url: brand.faviconUrl }]
      : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${notoArabic.variable} antialiased`}
      >
        <ConvexClientProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
