import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "룰셋 관리 — K-Petro 일상감사 AI" },
      { name: "description", content: "AI 감사 룰셋 관리" },
    ],
  }),
  component: () => <ComingSoon title="룰셋 관리" description="AI가 사용하는 감사 룰셋을 등록·관리하는 화면입니다." />,
});
