"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { ReactNode } from "react";
import AppShell from "./components/AppShell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        router.replace("/login");
      }
    };
    check();
  }, [router]);

  return <AppShell>{children}</AppShell>;
}
