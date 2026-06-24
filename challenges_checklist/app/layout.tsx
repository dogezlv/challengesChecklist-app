import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import LiteModeBoot from "./components/LiteModeBoot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fuentes Fortnite reales (archivos en public/):
//  - Burbank Big Regular Bold → títulos/encabezados/botones por defecto (700)
//    (la Condensed Black queda registrada como 900 por si se quiere más peso)
//  - Burbank Small Medium → textos descriptivos
const titleFont = localFont({
  src: [
    { path: "../public/Burbank Big Regular Bold.otf", weight: "700", style: "normal" },
    { path: "../public/BurbankBigCondensed-Black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-title",
  display: "swap",
  declarations: [
    { prop: "ascent-override", value: "83%" },
    { prop: "descent-override", value: "11%" },
    { prop: "line-gap-override", value: "0%" },
  ],
});

const bodyFont = localFont({
  src: "../public/Burbank Small Medium.otf",
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Desafíos semanales — Fortnite Temporada 8",
  description: "Checklist de desafíos estilo Fortnite Temporada 8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${titleFont.variable} ${bodyFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LiteModeBoot />
        {children}
      </body>
    </html>
  );
}
