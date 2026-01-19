"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function AppShell({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
        />

        <div className="flex min-h-screen flex-1 flex-col">
          <Header collapsed={sidebarCollapsed} />

          {/* 👇 CLAVE: sin “card” centrado, sin max-w, padding mínimo */}
          <main className="flex-1 bg-[#eef2f7] px-2 py-2">
            <div className="w-full">
              {children}
            </div>
          </main>

          <Footer />
        </div>
      </div>
    </div>
  );
}

