import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, FileText, Plus, BookOpen, ClipboardList, TrendingUp, Calendar } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "대시보드 — K-Petro 일상감사 AI" },
      { name: "description", content: "한국석유관리원 일상감사 AI 어시스턴트 대시보드" },
    ],
  }),
  component: Dashboard,
});

const kpis = [
  { label: "등록 규정", value: "0", suffix: "건", icon: BookOpen },
  { label: "누적 감사", value: "0", suffix: "회", icon: ClipboardList },
  { label: "평균 지적", value: "0.0", suffix: "건", icon: TrendingUp },
  { label: "이번 달 감사", value: "0", suffix: "건", icon: Calendar },
];

function Dashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 데모 안내 배너 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-900">
        <AlertTriangle className="size-5 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <p className="font-bold text-sm">시연용 안내</p>
          <p className="text-sm opacity-90 mt-0.5">
            본 사이트는 시연용 데모입니다. 실제 감사 데이터를 업로드하지 마세요.
          </p>
        </div>
      </div>

      {/* KPI 카드 */}
      <section aria-label="주요 지표" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="bg-card p-6 rounded-2xl border border-border shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <Icon className="size-4 text-kpetro-gray" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-foreground">{k.value}</span>
                <span className="text-sm text-muted-foreground">{k.suffix}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* 최근 감사 이력 */}
      <section className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-slate-800">최근 감사 이력</h2>
          <button
            type="button"
            className="text-sm font-medium text-kpetro-blue hover:underline disabled:opacity-50"
            disabled
          >
            전체보기
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="size-20 bg-slate-50 border border-border rounded-full flex items-center justify-center mb-4">
            <FileText className="size-8 text-slate-300" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 mb-2">
            최근 수행된 감사가 없습니다
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            일상감사 AI 어시스턴트를 통해 문서를 분석하고 지적 사항을 자동으로 도출해 보세요.
          </p>
          <button
            type="button"
            className="px-5 py-2.5 bg-kpetro-navy text-white rounded-lg font-medium hover:bg-kpetro-navy-hover transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
            disabled
          >
            <Plus className="size-4" /> 새로운 감사 시작하기
          </button>
        </div>
      </section>
    </div>
  );
}
