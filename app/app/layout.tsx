import type { Metadata, Viewport } from "next";
import { Baloo_2, VT323 } from "next/font/google";
import "./globals.css";

const sans = Baloo_2({ subsets: ["latin"], variable: "--font-sans", weight: ["400", "500", "600", "700", "800"] });
const led = VT323({ subsets: ["latin"], variable: "--font-led", weight: "400" });

export const metadata: Metadata = {
  title: "Fraude sur le RER B",
  description: "Payez votre ticket ou fraudez. Des contrôleurs se cachent parmi vous.",
};

export const viewport: Viewport = {
  themeColor: "#0B0F1A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${sans.variable} ${led.variable}`}>
      <body className="font-sans bg-metro min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
