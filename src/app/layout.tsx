import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Nav } from "@/components/nav";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LineupIQ",
  description: "Fair Little League lineups, automatically",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-[#F7F9FC]`}
      >
        <Nav />
        <main className="max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>
        <footer className="hidden md:block text-center text-xs text-[#94A3B8] py-4">
          &copy; 2026 LineupIQ
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
