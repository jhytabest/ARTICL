import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARTICL Mini App",
  description: "Pay-per-call API tickets on Base",
  other: {
    "fc:miniapp": JSON.stringify({
      version: "next",
      imageUrl: "https://demo.articl.app/embed-image.png",
      button: {
        title: "Launch ARTICL",
        action: {
          type: "launch_miniapp",
          name: "ARTICL Mini App",
          url: "https://articl.vercel.app/",
          splashImageUrl: "https://demo.articl.app/splash.png",
          splashBackgroundColor: "#0C0C0D",
        },
      },
    }),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
