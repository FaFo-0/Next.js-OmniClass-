import type { Metadata } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "./providers";
import { OMNICA_FALLBACK } from "@/lib/brand/fallback";
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
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://next-js-omni-class.vercel.app"),
    title: {
      default: "Английский онлайн с преподавателем — Omnica English",
      template: `%s`,
    },
    description: "Индивидуальные онлайн-уроки английского: гибкое расписание, материалы после урока, домашние задания и понятные цены в тенге.",
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: brand.name,
      title: "Английский онлайн с преподавателем — Omnica English",
      description: "Индивидуальные уроки в Google Meet, материалы после занятия и понятные пакеты в тенге.",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Omnica English — индивидуальные уроки английского онлайн" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Английский онлайн с преподавателем — Omnica English",
      description: "Индивидуальные уроки в Google Meet, материалы после занятия и понятные пакеты в тенге.",
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
    <html lang="ru">
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
