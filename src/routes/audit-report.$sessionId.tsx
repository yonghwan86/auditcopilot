import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, FileDown, FileText, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit-report/$sessionId")({
  head: () => ({ meta: [{ title: "보고서 초안 — 일상감사" }] }),
  component: ReportEditorPage,
});

type Session = {
  id: string;
  target_file_name: string;
  total_sentences: number;
  total_findings: number;
  report_json: ReportJson | null;
};

type Finding = {
  id: string;
  severity: string;
  reason: string | null;
  improvement: string | null;
  excerpt: string;
  reviewed: boolean;
  is_false_positive: boolean;
  matched_clause_id: string | null;
  matched_rule_id: string | null;
};

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

const SEV_RANK: Record<string, number> = { 상: 0, 중: 1, 하: 2 };

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymd(d: string) {
  return d.replace(/-/g, "");
}

function buildOverall(dist: { 상: number; 중: number; 하: number }, total: number) {
  if (total === 0) return "검토 결과 지적사항이 확인되지 않았습니다.";
  const parts = [`총 ${total}건의 지적사항이 확인되었습니다.`];
  if (dist.상 > 0) parts.push(`심각도 '상' ${dist.상}건은 우선 조치가 필요합니다.`);
  if (dist.중 > 0) parts.push(`심각도 '중' ${dist.중}건은 기한 내 보완을 권고합니다.`);
  if (dist.하 > 0) parts.push(`심각도 '하' ${dist.하}건은 검토 후 반영을 권고합니다.`);
  return parts.join(" ");
}

function ReportEditorPage() {
  const { sessionId } = Route.useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<ReportJson | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-report-data", sessionId],
    queryFn: async () => {
      const { data: session, error: e1 } = await supabase
        .from("audit_sessions")
        .select("id, target_file_name, total_sentences, total_findings, report_json")
        .eq("id", sessionId)
        .single();
      if (e1) throw e1;

      const { data: findings, error: e2 } = await supabase
        .from("audit_findings")
        .select("*")
        .eq("session_id", sessionId);
      if (e2) throw e2;

      // refs
      const clauseIds = [...new Set((findings ?? []).map((f) => f.matched_clause_id).filter(Boolean))] as string[];
      const ruleIds = [...new Set((findings ?? []).map((f) => f.matched_rule_id).filter(Boolean))] as string[];
      const [clauses, rules] = await Promise.all([
        clauseIds.length
          ? supabase.from("regulation_clauses").select("id, clause_id, title, regulation_id").in("id", clauseIds)
          : Promise.resolve({ data: [] as any[] }),
        ruleIds.length
          ? supabase.from("audit_rules").select("id, rule_name, related_clause_ref").in("id", ruleIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const regIds = [...new Set((clauses.data ?? []).map((c: any) => c.regulation_id))];
      const regs = regIds.length
        ? (await supabase.from("regulations").select("id, file_name").in("id", regIds)).data ?? []
        : [];
      const regMap = new Map(regs.map((r: any) => [r.id, r.file_name]));
      const clauseMap = new Map(
        (clauses.data ?? []).map((c: any) => [
          c.id,
          `${regMap.get(c.regulation_id) ?? "규정"} ${c.clause_id}${c.title ? ` (${c.title})` : ""}`,
        ]),
      );
      const ruleMap = new Map(
        (rules.data ?? []).map((r: any) => [r.id, r.related_clause_ref ? `${r.rule_name} · ${r.related_clause_ref}` : r.rule_name]),
      );

      return { session: session as Session, findings: (findings ?? []) as Finding[], clauseMap, ruleMap };
    },
  });

  useEffect(() => {
    if (!data) return;
    // Initialize report from existing report_json or fresh build
    if (data.session.report_json) {
      setReport(data.session.report_json);
      return;
    }
    const filtered = data.findings.filter((f) => !f.is_false_positive);
    filtered.sort((a, b) => {
      if (a.reviewed !== b.reviewed) return a.reviewed ? -1 : 1;
      return (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
    });
    const dist = { 상: 0, 중: 0, 하: 0 } as Record<"상" | "중" | "하", number>;
    filtered.forEach((f) => {
      if (f.severity in dist) dist[f.severity as "상" | "중" | "하"]++;
    });
    const findings: ReportFinding[] = filtered.map((f, i) => ({
      no: i + 1,
      severity: f.severity,
      reason: f.reason ?? "",
      related_ref:
        (f.matched_clause_id && data.clauseMap.get(f.matched_clause_id)) ||
        (f.matched_rule_id && data.ruleMap.get(f.matched_rule_id)) ||
        "",
      excerpt: f.excerpt,
      improvement: f.improvement ?? "",
    }));
    setReport({
      auditor_name: "",
      audit_date: todayISO(),
      summary: {
        total_sentences: data.session.total_sentences,
        ok_count: Math.max(0, data.session.total_sentences - filtered.length),
        issue_count: filtered.length,
        severity_dist: dist,
      },
      findings,
      overall_comment: buildOverall(dist, filtered.length),
    });
  }, [data]);

  const handleSave = async () => {
    if (!report) return;
    if (!report.auditor_name.trim()) {
      toast.error("감사자를 입력해 주세요");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("audit_sessions")
      .update({ report_json: report as any })
      .eq("id", sessionId);
    setSaving(false);
    if (error) toast.error("저장 실패: " + error.message);
    else toast.success("보고서가 저장되었습니다");
  };

  const handleExportPDF = async () => {
    if (!report || !data) return;
    if (!report.auditor_name.trim()) return toast.error("감사자를 입력해 주세요");
    setExporting("pdf");
    try {
      const { generateReportPDF } = await import("@/lib/report-pdf");
      const blob = await generateReportPDF(report, data.session.target_file_name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.session.target_file_name}_일상감사결과_${ymd(report.audit_date)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("PDF 생성 실패: " + (e?.message ?? e));
    } finally {
      setExporting(null);
    }
  };

  const handleExportDOCX = async () => {
    if (!report || !data) return;
    if (!report.auditor_name.trim()) return toast.error("감사자를 입력해 주세요");
    setExporting("docx");
    try {
      const { generateReportDOCX } = await import("@/lib/report-docx");
      const blob = await generateReportDOCX(report, data.session.target_file_name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.session.target_file_name}_일상감사결과_${ymd(report.audit_date)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error("DOCX 생성 실패: " + (e?.message ?? e));
    } finally {
      setExporting(null);
    }
  };

  if (isLoading || !report || !data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" /> 보고서 데이터 로딩 중…
      </div>
    );
  }

  const updateFinding = (i: number, patch: Partial<ReportFinding>) => {
    setReport((r) => (r ? { ...r, findings: r.findings.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) } : r));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="gap-2">
            <Link to="/audit">
              <ArrowLeft className="size-4" /> 결과로 돌아가기
            </Link>
          </Button>
          <div>
            <h1 className="font-semibold">일상감사 결과 (초안)</h1>
            <p className="text-xs text-muted-foreground">{data.session.target_file_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!!exporting} className="gap-2">
            {exporting === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            PDF 다운로드
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportDOCX} disabled={!!exporting} className="gap-2">
            {exporting === "docx" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            DOCX 다운로드
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            저장
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/30">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {/* Header card */}
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="text-xl font-bold border-b pb-2">일상감사 결과 (초안)</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">감사대상 문서</Label>
                <div className="mt-1 px-3 py-2 border rounded bg-muted/50 text-sm">{data.session.target_file_name}</div>
              </div>
              <div>
                <Label className="text-xs" htmlFor="audit_date">감사일자</Label>
                <Input
                  id="audit_date"
                  type="date"
                  value={report.audit_date}
                  onChange={(e) => setReport({ ...report, audit_date: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs" htmlFor="auditor">감사자 *</Label>
                <Input
                  id="auditor"
                  value={report.auditor_name}
                  onChange={(e) => setReport({ ...report, auditor_name: e.target.value })}
                  placeholder="홍길동"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-3">감사 결과 요약</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <SumBox label="검토 문장 수" value={report.summary.total_sentences} />
              <SumBox label="적정" value={report.summary.ok_count} />
              <SumBox label="개선필요" value={report.summary.issue_count} />
              <SumBox
                label="심각도"
                value={`상 ${report.summary.severity_dist.상} / 중 ${report.summary.severity_dist.중} / 하 ${report.summary.severity_dist.하}`}
              />
            </div>
          </div>

          {/* Findings */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-3">세부 지적사항 ({report.findings.length}건)</h3>
            {report.findings.length === 0 && (
              <p className="text-sm text-muted-foreground">지적사항이 없습니다.</p>
            )}
            <div className="space-y-4">
              {report.findings.map((f, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">#{f.no}</Badge>
                    <Badge
                      className={cn(
                        "border",
                        f.severity === "상" && "bg-red-100 text-red-800 border-red-200",
                        f.severity === "중" && "bg-orange-100 text-orange-800 border-orange-200",
                        f.severity === "하" && "bg-yellow-100 text-yellow-800 border-yellow-200",
                      )}
                    >
                      심각도 {f.severity}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-xs">지적사항</Label>
                    <div className="mt-1 text-sm">{f.reason || "(사유 없음)"}</div>
                  </div>
                  {f.related_ref && (
                    <div>
                      <Label className="text-xs">관련근거</Label>
                      <div className="mt-1 text-sm text-muted-foreground">{f.related_ref}</div>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">발췌내용</Label>
                    <div className="mt-1 text-sm bg-muted/50 px-3 py-2 rounded border italic">"{f.excerpt}"</div>
                  </div>
                  <div>
                    <Label className="text-xs">개선의견</Label>
                    <Textarea
                      value={f.improvement}
                      onChange={(e) => updateFinding(i, { improvement: e.target.value })}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Overall */}
          <div className="rounded-lg border bg-card p-6">
            <h3 className="font-semibold mb-3">종합 의견</h3>
            <Textarea
              value={report.overall_comment}
              onChange={(e) => setReport({ ...report, overall_comment: e.target.value })}
              rows={5}
            />
          </div>

          <div className="text-xs text-muted-foreground px-2">
            ※ 본 보고서는 키워드·필수항목 룰 기반 분석 결과의 초안이며, 최종 결재 전 담당자 검토가 필요합니다.
            개선의견은 템플릿 기반으로 생성되었으므로 필요 시 수정 후 사용하십시오.
          </div>
        </div>
      </div>
    </div>
  );
}

function SumBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border rounded p-3 bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
