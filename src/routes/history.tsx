import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "감사 이력 — K-Petro 일상감사 AI" },
      { name: "description", content: "수행된 감사 이력 조회" },
    ],
  }),
  component: () => <ComingSoon title="감사 이력" description="수행된 감사 이력과 지적 사항을 조회하는 화면입니다." />,
});
