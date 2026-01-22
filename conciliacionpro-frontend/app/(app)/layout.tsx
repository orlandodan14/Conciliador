"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Header from "@/app/(app)/components/Header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        router.replace("/login");
      }
    };
    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-100">
      <Header showCompanySwitch={false} />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

