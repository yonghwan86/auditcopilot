import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-card rounded-2xl border border-border shadow-sm min-h-[500px] flex flex-col items-center justify-center p-12 text-center">
        <div className="size-20 bg-slate-50 border border-border rounded-full flex items-center justify-center mb-5">
          <Construction className="size-8 text-kpetro-gray" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {description ?? "준비 중입니다. 다음 단계에서 구현될 예정입니다."}
        </p>
        <span className="mt-6 px-3 py-1 text-[11px] font-semibold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
          준비 중
        </span>
      </div>
    </div>
  );
}
