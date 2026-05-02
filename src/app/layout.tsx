import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./providers";
import { CURRENT_TENANT_BRAND } from "@/lib/brand/current-tenant-brand";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700", "800"],
});

export function generateMetadata(): Metadata {
  const brand = CURRENT_TENANT_BRAND;
  return {
    title: brand.name,
    description: brand.tagline ?? "Language academy platform",
    icons: brand.faviconUrl ? [{ rel: "icon", url: brand.faviconUrl }] : undefined,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${plusJakarta.variable} ${notoArabic.variable} antialiased`}>
        <ConvexClientProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
