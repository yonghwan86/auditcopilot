export function AppHeader() {
  return (
    <header className="h-16 bg-white border-b border-border flex items-center justify-between px-8 shrink-0">
      <h1 className="text-base md:text-lg font-bold text-slate-800 tracking-tight">
        한국석유관리원 일상감사 AI 어시스턴트{" "}
        <span className="text-slate-400 font-medium">(데모)</span>
      </h1>
      <div className="flex items-center gap-3">
        <span className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
          DEMO
        </span>
        <span className="px-3 py-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-md">
          v0.1.0
        </span>
      </div>
    </header>
  );
}
