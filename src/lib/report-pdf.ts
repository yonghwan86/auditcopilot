// PDF report generation using @react-pdf/renderer with Pretendard Korean font.
// If font registration fails the renderer falls back to default which may not
// render Hangul; we still attempt and surface errors to the caller.
import { Document, Page, Text, View, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import React from "react";

type ReportFinding = {
  no: number;
  severity: string;
  reason: string;
  related_ref: string;
  excerpt: string;
  improvement: string;
};

type ReportJson = {
  auditor_name: string;
  audit_date: string;
  summary: {
    total_sentences: number;
    ok_count: number;
    issue_count: number;
    severity_dist: { 상: number; 중: number; 하: number };
  };
  findings: ReportFinding[];
  overall_comment: string;
};

let fontRegistered = false;
function registerFont() {
  if (fontRegistered) return;
  try {
    Font.register({
      family: "Pretendard",
      fonts: [
        {
          src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.ttf",
          fontWeight: "normal",
        },
        {
          src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.ttf",
          fontWeight: "bold",
        },
      ],
    });
    fontRegistered = true;
  } catch (e) {
    console.warn("[report-pdf] Font registration failed, falling back", e);
  }
}

const NAVY = "#1e3a5f";

const styles = StyleSheet.create({
  page: { padding: 70, fontFamily: "Pretendard", fontSize: 10, color: "#111" },
  h1: { fontSize: 18, fontWeight: "bold", color: NAVY, textAlign: "center", marginBottom: 16 },
  h2: { fontSize: 12, fontWeight: "bold", color: NAVY, marginTop: 14, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: NAVY, paddingBottom: 3 },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 90, fontWeight: "bold" },
  val: { flex: 1 },
  bullet: { marginLeft: 8, marginBottom: 2 },
  findingBox: { marginBottom: 10, padding: 8, borderWidth: 1, borderColor: "#ccc", borderRadius: 3 },
  findingHead: { flexDirection: "row", marginBottom: 4 },
  findingNo: { fontWeight: "bold", marginRight: 6 },
  small: { fontSize: 9, color: "#555" },
  excerpt: { fontSize: 9, color: "#333", marginTop: 2, padding: 4, backgroundColor: "#f5f5f5" },
  overall: { padding: 8, borderWidth: 1, borderColor: "#ccc", lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 30, left: 70, right: 70, fontSize: 8, color: "#888", textAlign: "center" },
});

function ReportDoc({ report, fileName }: { report: ReportJson; fileName: string }) {
  const s = report.summary;
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.h1 }, "일상감사 결과 (초안)"),

      React.createElement(View, { style: styles.row }, React.createElement(Text, { style: styles.label }, "1. 감사대상 문서"), React.createElement(Text, { style: styles.val }, fileName)),
      React.createElement(View, { style: styles.row }, React.createElement(Text, { style: styles.label }, "2. 감사일자"), React.createElement(Text, { style: styles.val }, report.audit_date)),
      React.createElement(View, { style: styles.row }, React.createElement(Text, { style: styles.label }, "3. 감사자"), React.createElement(Text, { style: styles.val }, report.auditor_name)),

      React.createElement(Text, { style: styles.h2 }, "4. 감사 결과 요약"),
      React.createElement(Text, { style: styles.bullet }, `· 검토 문장 수: ${s.total_sentences}건`),
      React.createElement(Text, { style: styles.bullet }, `· 적정: ${s.ok_count}건 / 개선필요: ${s.issue_count}건`),
      React.createElement(Text, { style: styles.bullet }, `· 심각도 분포: 상 ${s.severity_dist.상} / 중 ${s.severity_dist.중} / 하 ${s.severity_dist.하}`),

      React.createElement(Text, { style: styles.h2 }, "5. 세부 지적사항"),
      ...(report.findings.length === 0
        ? [React.createElement(Text, { key: "no", style: styles.bullet }, "지적사항이 없습니다.")]
        : report.findings.map((f) =>
            React.createElement(
              View,
              { key: f.no, style: styles.findingBox, wrap: false },
              React.createElement(
                View,
                { style: styles.findingHead },
                React.createElement(Text, { style: styles.findingNo }, `① ${f.no}`),
                React.createElement(Text, null, `[심각도 ${f.severity}] ${f.reason || ""}`),
              ),
              f.related_ref ? React.createElement(Text, { style: styles.small }, `관련근거: ${f.related_ref}`) : null,
              React.createElement(Text, { style: styles.excerpt }, `발췌: "${f.excerpt}"`),
              React.createElement(Text, { style: { marginTop: 4 } }, `개선의견: ${f.improvement || "-"}`),
            ),
          )),

      React.createElement(Text, { style: styles.h2 }, "6. 종합 의견"),
      React.createElement(View, { style: styles.overall }, React.createElement(Text, null, report.overall_comment)),

      React.createElement(
        Text,
        { style: styles.footer, render: ({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`, fixed: true },
      ),
    ),
  );
}

export async function generateReportPDF(report: ReportJson, fileName: string): Promise<Blob> {
  registerFont();
  const blob = await pdf(ReportDoc({ report, fileName }) as any).toBlob();
  return blob;
}
