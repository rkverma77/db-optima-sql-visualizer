import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "DB Optima — SQL Optimization Dashboard",
  description:
    "Visualize SQL execution, optimize queries with Gemini AI, and benchmark index performance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
