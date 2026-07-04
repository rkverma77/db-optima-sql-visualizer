"use client";

import { useRef, useCallback, useEffect } from "react";

let requestId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

export function useSqlWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("@/lib/sql/sql.worker.ts", import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { id, result, error } = e.data;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);
      if (error) req.reject(new Error(error));
      else req.resolve(result);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const send = useCallback(<T>(type: string, payload: Record<string, any>): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error("Worker not initialized"));
        return;
      }
      const id = ++requestId;
      pending.set(id, { resolve, reject });
      workerRef.current.postMessage({ id, type, ...payload });
    });
  }, []);

  const runQuery = useCallback(
    (sql: string, data: Record<string, any[]>) => send("runQuery", { sql, data }),
    [send]
  );

  const explainQueryPlan = useCallback(
    (sql: string, data: Record<string, any[]>) => send("explainQueryPlan", { sql, data }),
    [send]
  );

  const benchmark = useCallback(
    (sql: string, data: Record<string, any[]>, indexDdl: string[], volumes: number[], buildData: (rows: number) => Record<string, any[]>) => {
      // buildData can't be sent to worker, so we handle benchmark differently
      // For now, return a promise that resolves after worker processes
      return send("benchmark", { sql, data, indexDdl, volumes });
    },
    [send]
  );

  return { runQuery, explainQueryPlan, benchmark };
}