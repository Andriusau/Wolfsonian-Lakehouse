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
  title: "Wolfsonian-FIU Lakehouse",
  description: "Explore over 116,000 museum and library collection artifacts from the Wolfsonian-FIU through our lightning-fast, zero-latency Data Lakehouse.",
  keywords: ["Wolfsonian", "FIU", "Museum", "Library", "Art", "Design", "Data Lakehouse", "Digital Archive"],
  authors: [{ name: "Andrius Aukstuolis" }, { name: "Wolfsonian-FIU" }],
  openGraph: {
    title: "Wolfsonian-FIU Lakehouse",
    description: "Explore over 116,000 museum and library collection artifacts from the Wolfsonian-FIU.",
    url: "https://lakehouse.wolfsonian.org",
    siteName: "Wolfsonian-FIU Lakehouse",
    images: [
      {
        url: "https://lakehouse.wolfsonian.org/art-swipe-thumbnail.png",
        width: 1200,
        height: 630,
        alt: "Wolfsonian Lakehouse Explorer",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wolfsonian-FIU Lakehouse",
    description: "Explore over 116,000 museum and library collection artifacts through our zero-latency Data Lakehouse.",
    images: ["https://lakehouse.wolfsonian.org/art-swipe-thumbnail.png"],
  },
  metadataBase: new URL("https://lakehouse.wolfsonian.org"),
};

import Chatbot from "../components/Chatbot";
import { DuckDBProvider } from "@/providers/DuckDBProvider";

import { GoogleAnalytics } from "@next/third-parties/google";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DuckDBProvider>
          {children}
          <Chatbot />
        </DuckDBProvider>
      </body>
      {process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
    </html>
  );
}
