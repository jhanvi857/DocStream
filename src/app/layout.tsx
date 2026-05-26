import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocStream — Write, Collaborate, and Share Documents Effortlessly",
  description: "Create documents, collaborate in real time with your team, and keep your ideas synced everywhere. A premium document workspace built for modern product teams.",
  keywords: ["document collaboration", "real-time editor", "notion alternative", "google docs alternative", "team workspace", "document sharing"],
  authors: [{ name: "DocStream Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-slate-900 font-sans flex flex-col">
        {children}
      </body>
    </html>
  );
}

