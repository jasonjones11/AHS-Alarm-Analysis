import type { Metadata } from "next";
import "./globals.css";
import { LicenseProvider } from "@/context/LicenseContext";

// SECURITY FIX: Removed Google Fonts for offline deployment
// Using system fonts instead for USB deployment compatibility

export const metadata: Metadata = {
  title: "AHS Alarm Analysis",
  description: "Mining truck alarm analysis and telemetry visualization",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-raleway bg-[#425563] text-white">
        <LicenseProvider>
          {children}
        </LicenseProvider>
      </body>
    </html>
  );
}
