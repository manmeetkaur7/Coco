import type { Metadata } from "next";
import "./globals.css";
import { AmbientBackground } from "@/components/ambient-background";
export const metadata: Metadata = {
  title: "Coco | A new era of hospitality",
  description:
    "Coco restaurant assistant — Sprint 1 foundation preview with clearly labeled sample restaurant data.",
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
