// app/workspace/layout.tsx
import type { ReactNode } from "react";
import AppShell from "./components/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
