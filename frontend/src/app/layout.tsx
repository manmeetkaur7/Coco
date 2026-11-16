import type { Metadata } from "next";
import "./globals.css";
import { AmbientBackground } from "@/components/ambient-background";
export const metadata: Metadata = {
  title: "Coco | A new era of hospitality",
  description:
    "Coco — local Round Table Pizza menu and deterministic demo ordering with browser voice. No real order submission.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AmbientBackground />
        {children}
      </body>
    </html>
  );
}
