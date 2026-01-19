import type { ReactNode } from "react";
import "./globals.css";
import AppShell from "@/app/components/layout/AppShell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

