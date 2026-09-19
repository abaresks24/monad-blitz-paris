import type { Metadata, Viewport } from "next";
import { Anton, Archivo } from "next/font/google";
import "./globals.css";

const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const sans = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Fraude sur le RER B",
  description: "Cachez-vous dans le bon wagon. Les contrôleurs rôdent.",
};

export const viewport: Viewport = {
  themeColor: "#0F1017",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans paper min-h-[100dvh] antialiased">{children}</body>
    </html>
  );
}
