import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navigation/navbar";
import { BottomNav } from "@/components/navigation/bottom-nav";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "아 그거 어딨지 - 생활 기록장",
  description: "보관함과 운동 기록처럼 잊기 쉬운 생활 정보를 빠르게 남기고 다시 찾는 개인 기록장입니다.",
  applicationName: "아 그거 어딨지",
  authors: [{ name: "Storage Manager Team" }],
  keywords: ["보관함", "물품관리", "운동기록", "생활기록", "정리", "수납"],
  creator: "Storage Manager Team",
  publisher: "Storage Manager Team",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    title: "아 그거 어딨지",
    statusBarStyle: "default",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Navbar />
        <main className="container mx-auto p-4 pb-20 md:pb-4">{children}</main>
        <BottomNav />
        <Toaster />
      </body>
    </html>
  );
}
