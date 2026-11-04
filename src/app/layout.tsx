import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./providers";
import { OMNICA_FALLBACK } from "@/lib/brand/fallback";
import { PUBLIC_SHARE_CARD } from "@/lib/publicShareCard";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
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
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://omnicaenglish.com"),
    title: {
      default: PUBLIC_SHARE_CARD.title,
      template: `%s`,
    },
    description: "One-to-one online English lessons with teachers from different countries, including native English speakers. A live conversation becomes words, flashcards and practice between lessons.",
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: brand.name,
      title: PUBLIC_SHARE_CARD.title,
      description: PUBLIC_SHARE_CARD.description,
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: PUBLIC_SHARE_CARD.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: PUBLIC_SHARE_CARD.title,
      description: PUBLIC_SHARE_CARD.description,
      images: ["/opengraph-image"],
    },
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
    <html lang="ru" translate="no" className="notranslate" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${notoArabic.variable} antialiased`}
      >
        <ThemeProvider>
          <ConvexClientProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
