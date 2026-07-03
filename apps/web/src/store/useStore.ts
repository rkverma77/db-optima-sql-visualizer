import { create } from "zustand";
import type { TableData, PipelineStep, QueryResult, OptimizationResult, VerifyIndexResult } from "@/types";
import { SAMPLE_DATASETS } from "@/lib/data/datasets";

// ── Default seed data ─────────────────────────────────────────
const DEFAULT_DATA: TableData = {
  Products: [
    { id: 1, name: "Laptop",   price: 1200, category: "Electronics" },
    { id: 2, name: "Mouse",    price: 25,   category: "Peripherals" },
    { id: 3, name: "Monitor",  price: 300,  category: "Electronics" },
    { id: 4, name: "Keyboard", price: 75,   category: "Peripherals" },
  ],
  Customers: [
    { id: 1, name: "Alice", country: "US" },
    { id: 2, name: "Bob",   country: "UK" },
    { id: 3, name: "Carol", country: "US" },
  ],
  Orders: [
    { id: 101, customer_id: 1, product_id: 1, quantity: 1 },
    { id: 102, customer_id: 2, product_id: 2, quantity: 2 },
    { id: 103, customer_id: 1, product_id: 3, quantity: 1 },
    { id: 104, customer_id: 3, product_id: 4, quantity: 3 },
    { id: 105, customer_id: 2, product_id: 1, quantity: 1 },
  ],
};

// ── Store interface ───────────────────────────────────────────
interface AppState {
  // Schema
  tableData: TableData;
  setTableData: (data: TableData) => void;
  addTable: (name: string) => void;
  dropTable: (name: string) => void;
  addRow: (table: string) => void;
  dropRow: (table: string, index: number) => void;
  addColumn: (table: string) => void;
  updateCell: (table: string, row: number, col: string, value: string | number | null) => void;
  renameColumn: (table: string, oldName: string, newName: string) => void;

  // Visualizer
  visualizerSQL: string;
  setVisualizerSQL: (sql: string) => void;
  pipeline: PipelineStep[];
  setPipeline: (steps: PipelineStep[]) => void;
  updateStepStatus: (index: number, status: PipelineStep["status"]) => void;
  queryResult: QueryResult | null;
  setQueryResult: (r: QueryResult | null) => void;
  isRunning: boolean;
  setIsRunning: (v: boolean) => void;
  animSpeed: number;          // ms between frames
  setAnimSpeed: (v: number) => void;
  error: string | null;
  setError: (msg: string | null) => void;

  // AI Optimizer
  aiSQL: string;
  setAiSQL: (sql: string) => void;
  aiResult: OptimizationResult | null;
  setAiResult: (r: OptimizationResult | null) => void;
  aiLoading: boolean;
  setAiLoading: (v: boolean) => void;
  aiError: string | null;
  setAiError: (msg: string | null) => void;

  // Performance tab
  dataVolume: number;
  setDataVolume: (v: number) => void;

  // Index verification (AI Optimizer "Apply & Verify")
  verifyResult: VerifyIndexResult | null;
  setVerifyResult: (r: VerifyIndexResult | null) => void;
  verifyLoading: boolean;
  setVerifyLoading: (v: boolean) => void;
  verifyError: string | null;
  setVerifyError: (msg: string | null) => void;

  // Sample datasets
  activeDataset: string | null;
  loadDataset: (key: keyof typeof SAMPLE_DATASETS) => void;

  // Save / share
  saveStatus: "idle" | "saving" | "saved" | "error";
  savedQueryId: number | null;
  saveError: string | null;
  setSaveStatus: (s: AppState["saveStatus"]) => void;
  setSavedQueryId: (id: number | null) => void;
  setSaveError: (msg: string | null) => void;

  // Demo mode — Header sets aiSQL + bumps this counter; OptimizerTab watches
  // it and auto-runs "Optimize with AI" once the tab is switched to it.
  demoTrigger: number;
  runDemo: () => void;
}

export const useStore = create<AppState>((set) => ({
  // ── Schema ──
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
      const newRow: Record<string, null> = {};
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

  // ── Visualizer ──
  visualizerSQL: `SELECT
    o.id       AS order_id,
    c.name     AS customer,
    p.name     AS product,
    o.quantity,
    p.price
FROM Orders o
JOIN Customers c ON o.customer_id = c.id
JOIN Products  p ON o.product_id  = p.id
WHERE o.quantity > 0`,
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

  // ── AI Optimizer ──
  aiSQL: `SELECT *
FROM Orders o, Customers c
WHERE o.customer_id = c.id
AND o.quantity > 1`,
  setAiSQL: (sql) => set({ aiSQL: sql }),

  aiResult: null,
  setAiResult: (r) => set({ aiResult: r }),

  aiLoading: false,
  setAiLoading: (v) => set({ aiLoading: v }),

  aiError: null,
  setAiError: (msg) => set({ aiError: msg }),

  // ── Performance ──
  dataVolume: 100_000,
  setDataVolume: (v) => set({ dataVolume: v }),

  // ── Index verification ──
  verifyResult: null,
  setVerifyResult: (r) => set({ verifyResult: r }),
  verifyLoading: false,
  setVerifyLoading: (v) => set({ verifyLoading: v }),
  verifyError: null,
  setVerifyError: (msg) => set({ verifyError: msg }),

  // ── Sample datasets ──
  activeDataset: null,
  loadDataset: (key) =>
    set({
      tableData: JSON.parse(JSON.stringify(SAMPLE_DATASETS[key].data)),
      activeDataset: key,
      queryResult: null,
      pipeline: [],
      aiResult: null,
      verifyResult: null,
    }),

  // ── Save / share ──
  saveStatus: "idle",
  savedQueryId: null,
  saveError: null,
  setSaveStatus: (s) => set({ saveStatus: s }),
  setSavedQueryId: (id) => set({ savedQueryId: id }),
  setSaveError: (msg) => set({ saveError: msg }),

  // ── Demo mode ──
  demoTrigger: 0,
  runDemo: () =>
    set((s) => ({
      aiSQL: `SELECT *\nFROM Orders o, Customers c\nWHERE o.customer_id = c.id\nAND o.quantity > 1`,
      aiResult: null,
      aiError: null,
      verifyResult: null,
      demoTrigger: s.demoTrigger + 1,
    })),
}));
