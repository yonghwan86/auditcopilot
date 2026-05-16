import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "통합 검색 — K-Petro 일상감사 AI" },
      { name: "description", content: "규정·감사 이력 통합 검색" },
    ],
  }),
  component: () => <ComingSoon title="통합 검색" description="규정, 감사 이력, 지적 사항을 통합 검색하는 화면입니다." />,
});
