import { Header } from "@/components/ui/Header";
import { SchemaPanel } from "@/components/schema/SchemaPanel";
import { Workbench } from "@/components/ui/Workbench";

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header />
      <main className="flex flex-1 min-h-0 overflow-hidden" style={{ background: "var(--bg)" }}>
        <SchemaPanel />
        <Workbench />
      </main>
    </div>
  );
}