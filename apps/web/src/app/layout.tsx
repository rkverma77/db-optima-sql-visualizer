import type { Metadata } from "next";
import "@/styles/globals.css";
import { ThemeProvider } from "./providers";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DB Optima — SQL Visualizer",
  description: "Visualize, optimize, and benchmark SQL queries",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased noise-overlay" style={{ fontFamily: "var(--font-inter), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}