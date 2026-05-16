import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Library,
  ClipboardCheck,
  Search,
  Settings,
  History,
  HelpCircle,
} from "lucide-react";

const menu = [
  { to: "/", label: "대시보드", icon: LayoutDashboard, exact: true },
  { to: "/regulations", label: "규정 라이브러리", icon: Library },
  { to: "/audit", label: "감사 수행", icon: ClipboardCheck },
  { to: "/search", label: "통합 검색", icon: Search },
  { to: "/rules", label: "룰셋 관리", icon: Settings },
  { to: "/history", label: "감사 이력", icon: History },
  { to: "/help", label: "도움말", icon: HelpCircle },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="w-72 bg-kpetro-navy text-white flex flex-col shrink-0 min-h-screen">
      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-9 bg-white/15 rounded-md flex items-center justify-center font-bold text-white tracking-tight">
            K
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight">K-Petro AI</span>
            <span className="text-[11px] text-slate-300">일상감사 어시스턴트</span>
          </div>
        </div>

        <nav className="space-y-1">
          {menu.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors " +
                  (active
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white")
                }
              >
                <Icon className="size-4 opacity-80" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-6">
          <div className="bg-white/5 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">접속 계정</p>
            <p className="text-sm font-medium">감사팀 데모 사용자</p>
            <p className="text-[11px] text-slate-400 mt-0.5">데모 환경 · 인증 없음</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
