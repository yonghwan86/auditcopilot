import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "감사 수행 — K-Petro 일상감사 AI" },
      { name: "description", content: "감사 문서 업로드 및 자동 분석" },
    ],
  }),
  component: () => <ComingSoon title="감사 수행" description="감사 대상 문서를 업로드하고 AI 자동 분석을 수행하는 화면입니다." />,
});
