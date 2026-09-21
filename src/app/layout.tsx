import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ElectroRaid · City of Tshwane",
  description:
    "Report. Track. Restore. ElectroRaid is the City of Tshwane outage and revenue-protection platform — report a fault, track the technician live, and confirm when power is back.",
  applicationName: "ElectroRaid",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "ElectroRaid",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#24A148",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
