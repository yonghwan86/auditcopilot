import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload as UploadIcon,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Download,
  RefreshCw,
  Ban,
  Check,
  Eye,
  FileWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "감사 수행 — K-Petro 일상감사 AI" },
      { name: "description", content: "감사 문서 업로드 및 자동 분석" },
    ],
  }),
  component: AuditPage,
});

// ─────────────── Types ───────────────
type AuditSession = {
  id: string;
  target_file_name: string;
  target_file_format: string;
  target_storage_path: string;
  status: string;
  status_message: string | null;
  progress_percent: number;
  total_sentences: number;
  total_findings: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type AuditFinding = {
  id: string;
  session_id: string;
  finding_type: string;
  excerpt: string;
  excerpt_position: number;
  matched_rule_id: string | null;
  matched_clause_id: string | null;
  severity: string;
  reason: string | null;
  improvement: string | null;
  reviewed: boolean;
  is_false_positive: boolean;
  created_at: string;
};

type RuleInfo = {
  id: string;
  rule_name: string;
  trigger_type: string;
  trigger_value: string;
  condition_desc: string | null;
};

type ClauseInfo = {
  id: string;
  clause_id: string;
  title: string | null;
  content: string;
  regulation_id: string;
};

type RegulationInfo = {
  id: string;
  file_name: string;
  category: string;
};

// ─────────────── Constants ───────────────
const ALLOWED_EXT = [".pdf", ".hwp", ".hwpx", ".txt", ".docx"];
const MAX_SIZE = 50 * 1024 * 1024;

const SEVERITY_COLOR: Record<string, string> = {
  상: "bg-red-500",
  중: "bg-orange-500",
  하: "bg-yellow-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  상: "bg-red-100 text-red-800 border-red-200",
  중: "bg-orange-100 text-orange-800 border-orange-200",
  하: "bg-yellow-100 text-yellow-800 border-yellow-200",
};

const TYPE_LABEL: Record<string, string> = {
  rule_keyword: "룰 매칭(키워드)",
  rule_forbidden: "금지 표현",
  rule_required: "필수항목 누락",
  keyword_overlap: "키워드 매칭 (참고)",
};

const STAGE_ORDER = ["extracting", "matching", "analyzing", "completed"];
const STAGE_LABEL: Record<string, string> = {
  extracting: "문서 텍스트 추출",
  matching: "룰 매칭",
  analyzing: "개선안 생성",
  completed: "완료",
};

function safeUUID() {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }
}

// ─────────────── Main Component ───────────────
function AuditPage() {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["audit-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_sessions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AuditSession[];
    },
  });

  // Realtime: any session change → refresh list
  useEffect(() => {
    const channel = supabase
      .channel("audit-sessions-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_sessions" },
        () => {
          qc.invalidateQueries({ queryKey: ["audit-sessions"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("audit_sessions").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }
    await supabase.from("audit_findings").delete().eq("session_id", id);
    toast.success("세션이 삭제되었습니다");
    if (selectedId === id) setSelectedId(null);
    refetchSessions();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">감사 수행</h1>
          <p className="text-sm text-muted-foreground mt-1">
            감사 대상 문서를 업로드해 자동 분석을 수행합니다.
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <UploadIcon className="size-4" /> 신규 감사 시작
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sessions list */}
        <aside className="w-72 border-r overflow-y-auto bg-muted/30">
          <div className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            감사 세션 ({sessions.length})
          </div>
          {sessions.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">
              아직 감사 이력이 없습니다.
            </div>
          )}
          <ul>
            {sessions.map((s) => (
              <li
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "px-4 py-3 cursor-pointer border-b hover:bg-accent",
                  selectedId === s.id && "bg-accent",
                )}
              >
                <div className="flex items-start gap-2">
                  <FileText className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {s.target_file_name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <span>{new Date(s.created_at).toLocaleDateString("ko-KR")}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main panel */}
        <main className="flex-1 overflow-y-auto">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
              <FileText className="size-12 mb-4 opacity-50" />
              <p>좌측에서 세션을 선택하거나 새 감사를 시작하세요.</p>
            </div>
          )}
          {selected && selected.status !== "completed" && selected.status !== "failed" && (
            <ProgressView session={selected} />
          )}
          {selected && selected.status === "failed" && (
            <FailedView session={selected} onDelete={() => setDeleteId(selected.id)} />
          )}
          {selected && selected.status === "completed" && (
            <ResultsView
              session={selected}
              onDelete={() => setDeleteId(selected.id)}
            />
          )}
        </main>
      </div>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(id) => {
          setSelectedId(id);
          setUploadOpen(false);
          refetchSessions();
        }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>세션을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없으며, 모든 분석 결과가 함께 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) handleDelete(deleteId);
                setDeleteId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────── Status Badge ───────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "대기", cls: "bg-gray-100 text-gray-700" },
    extracting: { label: "추출중", cls: "bg-blue-100 text-blue-700" },
    matching: { label: "매칭중", cls: "bg-blue-100 text-blue-700" },
    analyzing: { label: "분석중", cls: "bg-blue-100 text-blue-700" },
    completed: { label: "완료", cls: "bg-green-100 text-green-700" },
    failed: { label: "실패", cls: "bg-red-100 text-red-700" },
  };
  const v = map[status] ?? { label: status, cls: "bg-gray-100" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", v.cls)}>
      {v.label}
    </span>
  );
}

// ─────────────── Upload Modal ───────────────
function UploadModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (sessionId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      toast.error("허용되지 않는 파일 형식입니다");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("파일 크기는 50MB 이하여야 합니다");
      return;
    }
    setUploading(true);
    try {
      const path = `${safeUUID()}/${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("audit-targets")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: inserted, error: insErr } = await supabase
        .from("audit_sessions")
        .insert({
          target_file_name: file.name,
          target_file_format: ext.slice(1),
          target_storage_path: path,
          status: "pending",
          status_message: "분석 대기 중",
          progress_percent: 0,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      // Fire-and-forget edge function call
      supabase.functions
        .invoke("analyze-audit", { body: { session_id: inserted.id } })
        .catch((e) => {
          console.error("analyze-audit invoke failed", e);
        });

      toast.success("분석을 시작했습니다");
      setFile(null);
      onCreated(inserted.id);
    } catch (e) {
      toast.error("업로드 실패: " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>감사 대상 문서 업로드</DialogTitle>
          <DialogDescription>
            허용 형식: PDF, HWP, HWPX, TXT, DOCX (50MB 이하)
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>파일 선택</Label>
          <Input
            type="file"
            accept={ALLOWED_EXT.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="text-sm text-muted-foreground">
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)}MB)
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!file || uploading}>
            {uploading && <Loader2 className="size-4 animate-spin" />}
            업로드 및 분석 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Progress View ───────────────
function ProgressView({ session }: { session: AuditSession }) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("audit-session-" + session.id)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "audit_sessions",
          filter: "id=eq." + session.id,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["audit-sessions"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, qc]);

  const currentStageIdx = STAGE_ORDER.indexOf(session.status);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Loader2 className="size-5 animate-spin text-primary" />
          <div>
            <h2 className="font-semibold">{session.target_file_name}</h2>
            <p className="text-sm text-muted-foreground">
              {session.status_message ?? "분석 중..."}
            </p>
          </div>
        </div>
        <Progress value={session.progress_percent} className="mb-2" />
        <p className="text-xs text-muted-foreground text-right">
          {session.progress_percent}%
        </p>

        <div className="mt-6 space-y-2">
          {STAGE_ORDER.map((st, idx) => {
            const done = idx < currentStageIdx || session.status === "completed";
            const active = idx === currentStageIdx;
            return (
              <div key={st} className="flex items-center gap-3 text-sm">
                {done ? (
                  <CheckCircle2 className="size-5 text-green-600" />
                ) : active ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <div className="size-5 rounded-full border-2 border-muted" />
                )}
                <span className={cn(active && "font-medium", !done && !active && "text-muted-foreground")}>
                  {STAGE_LABEL[st]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────── Failed View ───────────────
function FailedView({
  session,
  onDelete,
}: {
  session: AuditSession;
  onDelete: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => {
    setRetrying(true);
    try {
      await supabase
        .from("audit_sessions")
        .update({
          status: "pending",
          status_message: "재시도 대기 중",
          progress_percent: 0,
          error_message: null,
        })
        .eq("id", session.id);
      await supabase.functions.invoke("analyze-audit", {
        body: { session_id: session.id },
      });
      toast.success("재시도를 시작했습니다");
    } catch (e) {
      toast.error("재시도 실패: " + (e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6">
        <div className="flex items-start gap-3 mb-4">
          <XCircle className="size-6 text-destructive shrink-0" />
          <div>
            <h2 className="font-semibold">{session.target_file_name}</h2>
            <p className="text-sm text-muted-foreground">분석 실패</p>
          </div>
        </div>
        <div className="rounded bg-background border p-3 text-sm font-mono whitespace-pre-wrap">
          {session.error_message ?? "알 수 없는 오류"}
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleRetry} disabled={retrying} className="gap-2">
            {retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            재시도
          </Button>
          <Button variant="outline" onClick={onDelete} className="gap-2">
            <Trash2 className="size-4" /> 세션 삭제
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────── Results View ───────────────
function ResultsView({
  session,
  onDelete,
}: {
  session: AuditSession;
  onDelete: () => void;
}) {
  const qc = useQueryClient();
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");

  const { data: findings = [] } = useQuery({
    queryKey: ["audit-findings", session.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_findings")
        .select("*")
        .eq("session_id", session.id)
        .order("excerpt_position", { ascending: true });
      if (error) throw error;
      return data as AuditFinding[];
    },
  });

  // Fetch related rules & clauses & regulations
  const ruleIds = useMemo(
    () => Array.from(new Set(findings.map((f) => f.matched_rule_id).filter(Boolean) as string[])),
    [findings],
  );
  const clauseIds = useMemo(
    () => Array.from(new Set(findings.map((f) => f.matched_clause_id).filter(Boolean) as string[])),
    [findings],
  );

  const { data: rules = [] } = useQuery({
    queryKey: ["audit-rules-refs", ruleIds],
    enabled: ruleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_rules")
        .select("id, rule_name, trigger_type, trigger_value, condition_desc")
        .in("id", ruleIds);
      if (error) throw error;
      return data as RuleInfo[];
    },
  });

  const { data: clauses = [] } = useQuery({
    queryKey: ["audit-clauses-refs", clauseIds],
    enabled: clauseIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulation_clauses")
        .select("id, clause_id, title, content, regulation_id")
        .in("id", clauseIds);
      if (error) throw error;
      return data as ClauseInfo[];
    },
  });

  const regIds = useMemo(
    () => Array.from(new Set(clauses.map((c) => c.regulation_id))),
    [clauses],
  );

  const { data: regulations = [] } = useQuery({
    queryKey: ["audit-regs-refs", regIds],
    enabled: regIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulations")
        .select("id, file_name, category")
        .in("id", regIds);
      if (error) throw error;
      return data as RegulationInfo[];
    },
  });

  const rulesMap = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);
  const clausesMap = useMemo(() => new Map(clauses.map((c) => [c.id, c])), [clauses]);
  const regsMap = useMemo(() => new Map(regulations.map((r) => [r.id, r])), [regulations]);

  // Filtering
  const filtered = useMemo(() => {
    return findings.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (typeFilter !== "all" && f.finding_type !== typeFilter) return false;
      if (reviewFilter === "unreviewed" && (f.reviewed || f.is_false_positive)) return false;
      if (reviewFilter === "reviewed" && !f.reviewed) return false;
      if (reviewFilter === "false_positive" && !f.is_false_positive) return false;
      return true;
    });
  }, [findings, severityFilter, typeFilter, reviewFilter]);

  // Summary stats
  const stats = useMemo(() => {
    const nonFp = findings.filter((f) => !f.is_false_positive);
    const sev = { 상: 0, 중: 0, 하: 0 } as Record<string, number>;
    const types: Record<string, number> = {};
    for (const f of nonFp) {
      sev[f.severity] = (sev[f.severity] ?? 0) + 1;
      types[f.finding_type] = (types[f.finding_type] ?? 0) + 1;
    }
    return {
      total: findings.length,
      nonFp: nonFp.length,
      sev,
      types,
    };
  }, [findings]);

  const selectedFinding = findings.find((f) => f.id === selectedFindingId) ?? null;

  const handleDownload = async () => {
    const { data, error } = await supabase.storage
      .from("audit-targets")
      .createSignedUrl(session.target_storage_path, 60);
    if (error || !data) {
      toast.error("다운로드 URL 생성 실패");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Action bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div>
          <h2 className="font-semibold">{session.target_file_name}</h2>
          <p className="text-xs text-muted-foreground">
            {new Date(session.created_at).toLocaleString("ko-KR")} · 완료
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled className="gap-2">
            <FileText className="size-4" /> 보고서 초안 생성
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
            <Download className="size-4" /> 원본 다운로드
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} className="gap-2">
            <Trash2 className="size-4" /> 세션 삭제
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left 2/3 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Summary */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-3">요약</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Stat label="검토 문장 수" value={session.total_sentences} />
              <Stat
                label="지적 건수"
                value={stats.total}
                sub={`오탐 제외 ${stats.nonFp}`}
              />
              <Stat label="심각도 '상'" value={stats.sev["상"] ?? 0} />
              <Stat label="심각도 '중'" value={stats.sev["중"] ?? 0} />
            </div>

            {/* Severity bars */}
            <div className="space-y-1.5 mb-4">
              {(["상", "중", "하"] as const).map((sv) => {
                const n = stats.sev[sv] ?? 0;
                const pct = stats.nonFp > 0 ? (n / stats.nonFp) * 100 : 0;
                return (
                  <div key={sv} className="flex items-center gap-2 text-xs">
                    <span className="w-6">{sv}</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div className={cn("h-full", SEVERITY_COLOR[sv])} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right">{n}</span>
                  </div>
                );
              })}
            </div>

            {/* Type distribution */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.types).map(([t, n]) => (
                <Badge key={t} variant="outline">
                  {TYPE_LABEL[t] ?? t}: {n}
                </Badge>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="심각도" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">심각도 전체</SelectItem>
                <SelectItem value="상">상</SelectItem>
                <SelectItem value="중">중</SelectItem>
                <SelectItem value="하">하</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="유형" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">유형 전체</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reviewFilter} onValueChange={setReviewFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="검토상태" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">검토상태 전체</SelectItem>
                <SelectItem value="unreviewed">미검토</SelectItem>
                <SelectItem value="reviewed">완료</SelectItem>
                <SelectItem value="false_positive">오탐</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {filtered.length} / {findings.length}건
            </span>
          </div>

          {/* Findings list */}
          {findings.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              <FileWarning className="size-10 mx-auto mb-3 opacity-50" />
              검토 결과 지적사항이 없습니다. 다만 본 결과는 키워드·필수항목 룰 기준이며,
              문맥적 판단은 담당자 검토가 필요합니다.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((f) => (
                <FindingCard
                  key={f.id}
                  finding={f}
                  rule={f.matched_rule_id ? rulesMap.get(f.matched_rule_id) ?? null : null}
                  clause={f.matched_clause_id ? clausesMap.get(f.matched_clause_id) ?? null : null}
                  regulation={
                    f.matched_clause_id
                      ? (() => {
                          const c = clausesMap.get(f.matched_clause_id);
                          return c ? regsMap.get(c.regulation_id) ?? null : null;
                        })()
                      : null
                  }
                  isSelected={selectedFindingId === f.id}
                  onSelect={() => setSelectedFindingId(f.id)}
                  onChanged={() => qc.invalidateQueries({ queryKey: ["audit-findings", session.id] })}
                  
                />
              ))}
            </div>
          )}
        </div>

        {/* Right 1/3 */}
        <aside className="w-96 border-l overflow-y-auto bg-muted/30 p-4">
          <h3 className="font-semibold mb-3">관련 근거</h3>
          {!selectedFinding && (
            <p className="text-sm text-muted-foreground">
              지적사항 카드를 선택하면 관련 근거가 표시됩니다.
            </p>
          )}
          {selectedFinding && (
            <EvidencePanel
              finding={selectedFinding}
              rule={
                selectedFinding.matched_rule_id
                  ? rulesMap.get(selectedFinding.matched_rule_id) ?? null
                  : null
              }
              clause={
                selectedFinding.matched_clause_id
                  ? clausesMap.get(selectedFinding.matched_clause_id) ?? null
                  : null
              }
              regulation={(() => {
                if (!selectedFinding.matched_clause_id) return null;
                const c = clausesMap.get(selectedFinding.matched_clause_id);
                return c ? regsMap.get(c.regulation_id) ?? null : null;
              })()}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─────────────── Finding Card ───────────────
function FindingCard({
  finding,
  rule,
  clause,
  regulation,
  isSelected,
  onSelect,
  onChanged,
}: {
  finding: AuditFinding;
  rule: RuleInfo | null;
  clause: ClauseInfo | null;
  regulation: RegulationInfo | null;
  isSelected: boolean;
  onSelect: () => void;
  onChanged: () => void;
  fullText?: string | null;
}) {
  const [improvement, setImprovement] = useState(finding.improvement ?? "");
  const [saving, setSaving] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);

  useEffect(() => {
    setImprovement(finding.improvement ?? "");
  }, [finding.improvement]);

  const tokens = useMemo(() => {
    if (rule?.trigger_value) return [rule.trigger_value];
    return [];
  }, [rule]);

  const highlight = (text: string) => {
    if (tokens.length === 0) return text;
    const parts: Array<{ text: string; hit: boolean }> = [{ text, hit: false }];
    for (const tk of tokens) {
      const next: typeof parts = [];
      for (const p of parts) {
        if (p.hit) {
          next.push(p);
          continue;
        }
        const segs = p.text.split(tk);
        segs.forEach((s, i) => {
          if (s) next.push({ text: s, hit: false });
          if (i < segs.length - 1) next.push({ text: tk, hit: true });
        });
      }
      parts.splice(0, parts.length, ...next);
    }
    return parts.map((p, i) =>
      p.hit ? <mark key={i} className="bg-yellow-200 px-0.5 rounded">{p.text}</mark> : <span key={i}>{p.text}</span>,
    );
  };

  const saveImprovement = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("audit_findings")
      .update({ improvement })
      .eq("id", finding.id);
    setSaving(false);
    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    toast.success("개선안이 저장되었습니다");
    onChanged();
  };

  const markReviewed = async () => {
    const { error } = await supabase
      .from("audit_findings")
      .update({ reviewed: !finding.reviewed })
      .eq("id", finding.id);
    if (error) {
      toast.error("실패: " + error.message);
      return;
    }
    onChanged();
  };

  const markFalsePositive = async () => {
    const becoming = !finding.is_false_positive;
    const { error } = await supabase
      .from("audit_findings")
      .update({ is_false_positive: becoming })
      .eq("id", finding.id);
    if (error) {
      toast.error("실패: " + error.message);
      return;
    }
    if (becoming && finding.matched_rule_id) {
      // increment fp count
      const { data: r } = await supabase
        .from("audit_rules")
        .select("false_positive_count")
        .eq("id", finding.matched_rule_id)
        .single();
      if (r) {
        await supabase
          .from("audit_rules")
          .update({ false_positive_count: (r.false_positive_count ?? 0) + 1 })
          .eq("id", finding.matched_rule_id);
      }
    }
    toast.success(becoming ? "오탐으로 표시되었습니다" : "오탐 표시 해제");
    onChanged();
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-lg border bg-card overflow-hidden cursor-pointer transition",
        isSelected && "ring-2 ring-primary",
        finding.is_false_positive && "opacity-60",
      )}
    >
      <div className="flex">
        <div className={cn("w-1.5", SEVERITY_COLOR[finding.severity] ?? "bg-gray-300")} />
        <div className="flex-1 p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Badge variant="outline">{TYPE_LABEL[finding.finding_type] ?? finding.finding_type}</Badge>
            <Badge className={cn(SEVERITY_BADGE[finding.severity], "border")}>심각도 {finding.severity}</Badge>
            {finding.is_false_positive && <Badge variant="secondary">오탐</Badge>}
            {finding.reviewed && !finding.is_false_positive && (
              <Badge className="bg-green-100 text-green-800 border-green-200 border">검토완료</Badge>
            )}
          </div>

          <p className="text-sm leading-relaxed">{highlight(finding.excerpt)}</p>

          <div className="text-xs text-muted-foreground space-y-1">
            {rule && (
              <div>
                <span className="font-medium">관련 룰: </span>
                {rule.rule_name} ({rule.trigger_value})
              </div>
            )}
            {clause && regulation && (
              <div>
                <span className="font-medium">관련 조항: </span>
                {regulation.file_name} · {clause.clause_id}
                {clause.title && ` (${clause.title})`}
              </div>
            )}
            {finding.reason && (
              <div>
                <span className="font-medium">사유: </span>
                {finding.reason}
              </div>
            )}
          </div>

          <div onClick={(e) => e.stopPropagation()} className="space-y-2">
            <Label className="text-xs">개선안</Label>
            <Textarea
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <Button size="sm" variant="outline" onClick={saveImprovement} disabled={saving}>
              {saving && <Loader2 className="size-3 animate-spin" />}
              개선안 저장
            </Button>
          </div>

          <div onClick={(e) => e.stopPropagation()} className="flex flex-wrap gap-2 pt-2 border-t">
            <Button size="sm" variant={finding.reviewed ? "default" : "outline"} onClick={markReviewed} className="gap-1">
              <Check className="size-3.5" /> {finding.reviewed ? "검토완료" : "검토완료 표시"}
            </Button>
            <Button size="sm" variant={finding.is_false_positive ? "default" : "outline"} onClick={markFalsePositive} className="gap-1">
              <Ban className="size-3.5" /> {finding.is_false_positive ? "오탐 해제" : "오탐 표시"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOriginalOpen(true)} className="gap-1">
              <Eye className="size-3.5" /> 원문 보기
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={originalOpen} onOpenChange={setOriginalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>발췌 원문</DialogTitle>
            <DialogDescription>
              위치: {finding.excerpt_position.toLocaleString()}자
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <p className="text-sm whitespace-pre-wrap">{finding.excerpt}</p>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────── Evidence Panel ───────────────
function EvidencePanel({
  finding,
  rule,
  clause,
  regulation,
}: {
  finding: AuditFinding;
  rule: RuleInfo | null;
  clause: ClauseInfo | null;
  regulation: RegulationInfo | null;
}) {
  return (
    <div className="space-y-4">
      {rule && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">룰</div>
          <div className="text-sm font-medium">{rule.rule_name}</div>
          <div className="text-xs space-y-1">
            <div><span className="text-muted-foreground">트리거 유형:</span> {rule.trigger_type}</div>
            <div><span className="text-muted-foreground">트리거 값:</span> {rule.trigger_value}</div>
            {rule.condition_desc && (
              <div><span className="text-muted-foreground">조건:</span> {rule.condition_desc}</div>
            )}
          </div>
        </div>
      )}

      {clause && regulation && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">규정 조항</div>
          <div className="text-sm font-medium">{regulation.file_name}</div>
          <div className="text-xs text-muted-foreground">
            {regulation.category} · {clause.clause_id}
            {clause.title && ` — ${clause.title}`}
          </div>
          <ScrollArea className="max-h-80 mt-2">
            <p className="text-sm whitespace-pre-wrap">{clause.content}</p>
          </ScrollArea>
        </div>
      )}

      {!rule && !clause && (
        <p className="text-sm text-muted-foreground">연결된 근거가 없습니다.</p>
      )}

      {finding.finding_type === "keyword_overlap" && (
        <div className="text-xs text-muted-foreground p-2 bg-yellow-50 border border-yellow-200 rounded">
          ⚠ "키워드 매칭"은 의미 분석이 아닌 단순 키워드 중첩 결과입니다.
          담당자 컨텍스트 검토가 필요합니다.
        </div>
      )}
    </div>
  );
}
