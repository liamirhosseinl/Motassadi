import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: { default: "املاک متصدی — خرید، فروش و اجارهٔ ملک در زرند", template: "%s | املاک متصدی" },
  icons: { icon: "/brand/motasadi_favicon.svg" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#0A1430", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa-IR" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Marks JS as available so reveal-on-scroll can start hidden; without JS everything stays visible. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        <link rel="preload" href="/fonts/IRANSansX-Regular.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preload" href="/fonts/Lahzeh-Black.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
