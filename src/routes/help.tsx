import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "도움말 — K-Petro 일상감사 AI" },
      { name: "description", content: "사용 방법 및 안내" },
    ],
  }),
  component: () => <ComingSoon title="도움말" description="시스템 사용 방법과 자주 묻는 질문 안내 화면입니다." />,
});
