import type { Metadata } from "next";
import "@/styles/globals.css";
import { ThemeProvider } from "./providers";

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
    <html lang="en" data-theme="dark">
      <body className="min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}