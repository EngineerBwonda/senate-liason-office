"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function PageVisitTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef("");

  useEffect(() => {
    if (!pathname || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    void fetch("/api/page-visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch((error: unknown) => {
      console.error("Could not record page visit:", error);
    });
  }, [pathname]);

  return null;
}
