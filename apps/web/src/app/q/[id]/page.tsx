"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/useStore";
import type { SavedQuery } from "@/types";

export default function SharedQueryPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { setVisualizerSQL, setTableData } = useStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/queries/${params.id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Query not found");
        const query = data as SavedQuery;
        if (cancelled) return;
        setVisualizerSQL(query.sql);
        setTableData(query.schemaJson);
        router.replace("/dashboard");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: "var(--bg)", color: "var(--muted)" }}>
      {error ? (
        <div className="text-center">
          <p className="text-[13px] mb-2" style={{ color: "var(--danger)" }}>⚠ {error}</p>
          <a href="/dashboard" className="text-[12px] underline" style={{ color: "var(--accent)" }}>Go to dashboard</a>
        </div>
      ) : (
        <p className="text-[12.5px] animate-pulse">Loading shared query…</p>
      )}
    </div>
  );
}
