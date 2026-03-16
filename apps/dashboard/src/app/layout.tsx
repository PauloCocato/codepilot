import type { Metadata } from "next";
import { LayoutShell } from "@/components/layout-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodePilot Dashboard",
  description: "Monitor and manage your CodePilot agent runs",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
