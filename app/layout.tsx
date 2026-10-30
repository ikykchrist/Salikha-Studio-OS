import type { Metadata } from "next";
import "./globals.css";
import "./workflow.css";
import "./dark-mode.css";
import Script from "next/script";
import { PwaRegister } from "./pwa-register";

export const metadata: Metadata = {
  title: "Salikha Studio OS",
  description: "Internal operations system for Salikha Studio.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg?v=2", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg?v=2", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Salikha OS" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning><Script id="salikha-theme" strategy="beforeInteractive">{`try { document.documentElement.dataset.theme = localStorage.getItem('salikha-theme') === 'dark' ? 'dark' : 'light'; } catch { document.documentElement.dataset.theme = 'light'; }`}</Script><PwaRegister />{children}</body>
    </html>
  );
}
