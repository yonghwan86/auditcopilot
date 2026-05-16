import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/regulations")({
  head: () => ({
    meta: [
      { title: "규정 라이브러리 — K-Petro 일상감사 AI" },
      { name: "description", content: "감사 근거 규정 라이브러리" },
    ],
  }),
  component: () => <ComingSoon title="규정 라이브러리" description="감사 근거가 되는 법령·내규·지침을 관리하는 화면입니다." />,
});
