"use client";

import { useEffect, useState } from "react";

export function useActiveCompanyId() {
  const [companyId, setCompanyId] = useState<string>("");

  useEffect(() => {
    const read = () => {
      try {
        setCompanyId(localStorage.getItem("active_company_id") ?? "");
      } catch {
        setCompanyId("");
      }
    };

    read();
    window.addEventListener("company:changed", read as any);

    return () => {
      window.removeEventListener("company:changed", read as any);
    };
  }, []);

  return companyId;
}
