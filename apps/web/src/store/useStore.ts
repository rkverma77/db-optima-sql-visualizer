import { create } from "zustand";
import type { TableData, PipelineStep, QueryResult, OptimizationResult, VerifyIndexResult } from "@/types";
import { SAMPLE_DATASETS } from "@/lib/data/datasets";

// The default table set shown on first load reuses the (larger) Sales
// Pipeline sample dataset below, so the two never drift out of sync and the
// app always starts with a reasonably-sized, representative 6-table schema
// (Orders/Customers/Products/Categories/Employees/Addresses) instead of a
// tiny hand-maintained duplicate.
const DEFAULT_DATA: TableData = SAMPLE_DATASETS.salesPipeline.data;

interface AppState {
  tableData: TableData;
  setTableData: (data: TableData) => void;
  addTable: (name: string) => void;
  dropTable: (name: string) => void;
  addRow: (table: string) => void;
  dropRow: (table: string, index: number) => void;
  addColumn: (table: string) => void;
  dropColumn: (table: string, col: string) => void;
  updateCell: (table: string, row: number, col: string, value: string | number | null) => void;
  renameColumn: (table: string, oldName: string, newName: string) => void;

  visualizerSQL: string;
  setVisualizerSQL: (sql: string) => void;
  pipeline: PipelineStep[];
  setPipeline: (steps: PipelineStep[]) => void;
  updateStepStatus: (index: number, status: PipelineStep["status"]) => void;
  queryResult: QueryResult | null;
  setQueryResult: (r: QueryResult | null) => void;
  isRunning: boolean;
  setIsRunning: (v: boolean) => void;
  animSpeed: number;
  setAnimSpeed: (v: number) => void;
  error: string | null;
  setError: (msg: string | null) => void;

  aiSQL: string;
  setAiSQL: (sql: string) => void;
  aiResult: OptimizationResult | null;
  setAiResult: (r: OptimizationResult | null) => void;
  // The exact SQL text that was actually submitted to the AI when aiResult
  // was produced. Needed because aiResult lives in global state and the
  // Performance tab benchmarks independently-edited queries — without
  // this, other consumers of aiResult could silently reuse index
  // suggestions that were generated for an unrelated query.
  aiAnalyzedSQL: string | null;
  setAiAnalyzedSQL: (sql: string | null) => void;
  aiLoading: boolean;
  setAiLoading: (v: boolean) => void;
  aiError: string | null;
  setAiError: (msg: string | null) => void;

  // The Performance tab now has TWO independent query editors so a person
  // can benchmark genuinely different SQL side by side — separate from
  // visualizerSQL (Visualize tab) and aiSQL (AI Optimizer tab). All three
  // tabs still read from the same shared tableData.
  //
  // Editor A — the raw, unoptimized query the user writes themselves.
  perfOriginalSQL: string;
  setPerfOriginalSQL: (sql: string) => void;
  // Editor B — the (possibly AI-rewritten) optimized query. Defaults to ""
  // rather than being auto-filled from aiResult.optimized_sql: silently
  // overwriting it whenever the AI Optimizer tab is re-run would clobber
  // manual edits (same class of bug as the aiAnalyzedSQL guard above) — so
  // pulling in the AI's suggestion is always an explicit, on-demand action.
  perfOptimizedSQL: string;
  setPerfOptimizedSQL: (sql: string) => void;

  dataVolume: number;
  setDataVolume: (v: number) => void;

  verifyResult: VerifyIndexResult | null;
  setVerifyResult: (r: VerifyIndexResult | null) => void;
  verifyLoading: boolean;
  setVerifyLoading: (v: boolean) => void;
  verifyError: string | null;
  setVerifyError: (msg: string | null) => void;

  activeDataset: string | null;
  loadDataset: (key: keyof typeof SAMPLE_DATASETS) => void;

  saveStatus: "idle" | "saving" | "saved" | "error";
  savedQueryId: string | null;
  saveError: string | null;
  setSaveStatus: (s: AppState["saveStatus"]) => void;
  setSavedQueryId: (id: string | null) => void;
  setSaveError: (msg: string | null) => void;

  demoTrigger: number;
  runDemo: () => void;
}

export const useStore = create<AppState>((set) => ({
  tableData: JSON.parse(JSON.stringify(DEFAULT_DATA)),
  setTableData: (data) => set({ tableData: data }),

  addTable: (name) =>
    set((s) => ({
      tableData: { ...s.tableData, [name]: [{ id: 1 }] },
    })),

  dropTable: (name) =>
    set((s) => {
      const next = { ...s.tableData };
      delete next[name];
      return { tableData: next };
    }),

  addRow: (table) =>
    set((s) => {
      const rows = s.tableData[table];
      const cols = rows[0] ? Object.keys(rows[0]) : ["id"];
      const newRow: Record<string, string | number | null> = {};
      cols.forEach((c) => (newRow[c] = null));
      return { tableData: { ...s.tableData, [table]: [...rows, newRow] } };
    }),

  dropRow: (table, index) =>
    set((s) => ({
      tableData: {
        ...s.tableData,
        [table]: s.tableData[table].filter((_, i) => i !== index),
      },
    })),

  addColumn: (table) =>
    set((s) => {
      const rows = s.tableData[table];
      const colName = `col${Object.keys(rows[0] ?? {}).length + 1}`;
      return {
        tableData: {
          ...s.tableData,
          [table]: rows.map((r) => ({ ...r, [colName]: null })),
        },
      };
    }),

  dropColumn: (table, col) =>
    set((s) => {
      const rows = s.tableData[table];
      // Guard against leaving a table with zero columns — nothing left to
      // render or query against.
      if (!rows.length || Object.keys(rows[0]).length <= 1) return s;
      return {
        tableData: {
          ...s.tableData,
          [table]: rows.map((r) => {
            const n = { ...r };
            delete n[col];
            return n;
          }),
        },
      };
    }),

  updateCell: (table, rowIdx, col, value) =>
    set((s) => {
      const rows = [...s.tableData[table]];
      rows[rowIdx] = { ...rows[rowIdx], [col]: value };
      return { tableData: { ...s.tableData, [table]: rows } };
    }),

  renameColumn: (table, oldName, newName) =>
    set((s) => {
      if (!newName || oldName === newName) return s;
      const rows = s.tableData[table].map((r) => {
        const n = { ...r };
        n[newName] = n[oldName];
        delete n[oldName];
        return n;
      });
      return { tableData: { ...s.tableData, [table]: rows } };
    }),

  visualizerSQL: SAMPLE_DATASETS.salesPipeline.query,
  setVisualizerSQL: (sql) => set({ visualizerSQL: sql }),

  pipeline: [],
  setPipeline: (steps) => set({ pipeline: steps }),
  updateStepStatus: (index, status) =>
    set((s) => {
      const pipeline = [...s.pipeline];
      pipeline[index] = { ...pipeline[index], status };
      return { pipeline };
    }),

  queryResult: null,
  setQueryResult: (r) => set({ queryResult: r }),

  isRunning: false,
  setIsRunning: (v) => set({ isRunning: v }),

  animSpeed: 350,
  setAnimSpeed: (v) => set({ animSpeed: v }),

  error: null,
  setError: (msg) => set({ error: msg }),

  aiSQL: `SELECT *
FROM Orders o, Customers c
WHERE o.customer_id = c.id
AND o.quantity > 1`,
  setAiSQL: (sql) => set({ aiSQL: sql }),

  aiResult: null,
  setAiResult: (r) => set({ aiResult: r }),

  aiAnalyzedSQL: null,
  setAiAnalyzedSQL: (sql) => set({ aiAnalyzedSQL: sql }),

  aiLoading: false,
  setAiLoading: (v) => set({ aiLoading: v }),

  aiError: null,
  setAiError: (msg) => set({ aiError: msg }),

  perfOriginalSQL: SAMPLE_DATASETS.salesPipeline.query,
  setPerfOriginalSQL: (sql) => set({ perfOriginalSQL: sql }),

  perfOptimizedSQL: "",
  setPerfOptimizedSQL: (sql) => set({ perfOptimizedSQL: sql }),

  dataVolume: 10_000,
  setDataVolume: (v) => set({ dataVolume: v }),

  verifyResult: null,
  setVerifyResult: (r) => set({ verifyResult: r }),
  verifyLoading: false,
  setVerifyLoading: (v) => set({ verifyLoading: v }),
  verifyError: null,
  setVerifyError: (msg) => set({ verifyError: msg }),

  activeDataset: null,
  loadDataset: (key) =>
    set({
      tableData: JSON.parse(JSON.stringify(SAMPLE_DATASETS[key].data)),
      activeDataset: key,
      visualizerSQL: SAMPLE_DATASETS[key].query,
      perfOriginalSQL: SAMPLE_DATASETS[key].query,
      perfOptimizedSQL: "",
      queryResult: null,
      pipeline: [],
      aiResult: null,
      aiAnalyzedSQL: null,
      verifyResult: null,
    }),

  saveStatus: "idle",
  savedQueryId: null,
  saveError: null,
  setSaveStatus: (s) => set({ saveStatus: s }),
  setSavedQueryId: (id) => set({ savedQueryId: id }),
  setSaveError: (msg) => set({ saveError: msg }),

  demoTrigger: 0,
  runDemo: () =>
    set((s) => ({
      aiSQL: `SELECT *\nFROM Orders o, Customers c\nWHERE o.customer_id = c.id\nAND o.quantity > 1`,
      aiResult: null,
      aiAnalyzedSQL: null,
      aiError: null,
      verifyResult: null,
      demoTrigger: s.demoTrigger + 1,
    })),
}));