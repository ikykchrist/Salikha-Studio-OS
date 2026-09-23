import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salikha Studio OS",
  description: "Internal operations system for Salikha Studio.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
