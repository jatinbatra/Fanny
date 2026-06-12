import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TurbRadar — Live Flight Turbulence Monitor",
  description:
    "Real-time flight turbulence radar — track which flights are in turbulence, severity levels, and duration estimates.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0e1a] text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
