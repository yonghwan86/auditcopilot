import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Download,
  Upload as UploadIcon,
  Trash2,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "룰셋 관리 — K-Petro 일상감사 AI" },
      { name: "description", content: "감사 룰셋 관리" },
    ],
  }),
  component: RulesPage,
});

const TRIGGER_TYPES = ["keyword", "required", "forbidden"] as const;
type TriggerType = (typeof TRIGGER_TYPES)[number];
const SEVERITIES = ["상", "중", "하"] as const;
type Severity = (typeof SEVERITIES)[number];

type AuditRule = {
  id: string;
  rule_name: string;
  trigger_type: string;
  trigger_value: string;
  condition_desc: string | null;
  severity: string;
  related_clause_ref: string | null;
  improvement_template: string | null;
  is_active: boolean;
  false_positive_count: number;
  created_at: string;
};

const TRIGGER_LABEL: Record<string, string> = {
  keyword: "키워드",
  required: "필수",
  forbidden: "금지",
};

const SEED_RULES: Omit<AuditRule, "id" | "created_at" | "is_active" | "false_positive_count" | "related_clause_ref">[] = [
  {
    rule_name: "수의계약 5천만원 초과 사유 검토",
    trigger_type: "keyword",
    trigger_value: "수의계약",
    severity: "상",
    condition_desc: "수의계약 언급 시 5천만원 초과 여부 및 사유 검토 필요",
    improvement_template:
      "국가계약법 시행령 제26조에 따라 수의계약 사유와 금액 적정성을 명시 검토 필요",
  },
  {
    rule_name: "예정가격 산정근거 누락",
    trigger_type: "required",
    trigger_value: "예정가격 산정근거",
    severity: "중",
    condition_desc: "문서 내 예정가격 산정근거 명시 여부",
    improvement_template:
      "예정가격 산정 방식과 근거자료(시장조사·원가계산 등) 명시 필요",
  },
  {
    rule_name: "결재라인 누락",
    trigger_type: "required",
    trigger_value: "결재",
    severity: "중",
    condition_desc: "결재 관련 표현 명시 여부",
    improvement_template: "기안·검토·결재 라인을 명시하고 결재일자 기재 필요",
  },
  {
    rule_name: "시행일자 미명시",
    trigger_type: "required",
    trigger_value: "시행일",
    severity: "하",
    condition_desc: "시행일자 명시 여부",
    improvement_template: "문서 효력 발생 시점(시행일) 명시 필요",
  },
  {
    rule_name: "법령 인용 출처 누락",
    trigger_type: "required",
    trigger_value: "근거 법령",
    severity: "하",
    condition_desc: "근거 법령 또는 규정 출처 명시 여부",
    improvement_template: "관련 법령·규정 조항을 구체적으로 인용하여 적시 필요",
  },
];

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "상"
      ? "bg-severity-high/15 text-severity-high border-severity-high/30"
      : severity === "중"
        ? "bg-severity-mid/15 text-severity-mid border-severity-mid/30"
        : "bg-severity-low/15 text-severity-low border-severity-low/30";
  return (
    <Badge variant="outline" className={cls}>
      {severity}
    </Badge>
  );
}

function TriggerBadge({ type }: { type: string }) {
  const label = TRIGGER_LABEL[type] ?? type;
  const cls =
    type === "keyword"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : type === "required"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <Badge variant="outline" className={cls}>
      {label}
    </Badge>
  );
}

function RulesPage() {
  const qc = useQueryClient();
  const seededRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AuditRule | null>(null);
  const [form, setForm] = useState({
    rule_name: "",
    trigger_type: "keyword" as TriggerType,
    trigger_value: "",
    condition_desc: "",
    severity: "중" as Severity,
    related_clause_ref: "",
    improvement_template: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<AuditRule | null>(null);
  const [importPreview, setImportPreview] = useState<AuditRule[] | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["audit-rules"],
    queryFn: async (): Promise<AuditRule[]> => {
      const { data, error } = await supabase
        .from("audit_rules")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AuditRule[];
    },
  });

  // 첫 진입 시 룰이 0개면 시드 데이터 삽입 (한 번만 시도)
  useEffect(() => {
    if (isLoading) return;
    if (seededRef.current) return;
    if (rules.length > 0) return;
    seededRef.current = true;
    (async () => {
      const { error } = await supabase.from("audit_rules").insert(
        SEED_RULES.map((r) => ({
          ...r,
          is_active: true,
          false_positive_count: 0,
        })),
      );
      if (error) {
        toast.error("기본 룰셋 시드 실패", { description: error.message });
        return;
      }
      toast.success("기본 룰셋 5건이 추가되었습니다");
      qc.invalidateQueries({ queryKey: ["audit-rules"] });
    })();
  }, [isLoading, rules.length, qc]);

  function openCreate() {
    setEditing(null);
    setForm({
      rule_name: "",
      trigger_type: "keyword",
      trigger_value: "",
      condition_desc: "",
      severity: "중",
      related_clause_ref: "",
      improvement_template: "",
    });
    setDialogOpen(true);
  }

  function openEdit(r: AuditRule) {
    setEditing(r);
    setForm({
      rule_name: r.rule_name,
      trigger_type: (r.trigger_type as TriggerType) ?? "keyword",
      trigger_value: r.trigger_value,
      condition_desc: r.condition_desc ?? "",
      severity: (r.severity as Severity) ?? "중",
      related_clause_ref: r.related_clause_ref ?? "",
      improvement_template: r.improvement_template ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.rule_name.trim() || !form.trigger_value.trim()) {
      toast.error("룰명과 트리거 값을 입력해주세요");
      return;
    }
    const payload = {
      rule_name: form.rule_name.trim(),
      trigger_type: form.trigger_type,
      trigger_value: form.trigger_value.trim(),
      condition_desc: form.condition_desc.trim() || null,
      severity: form.severity,
      related_clause_ref: form.related_clause_ref.trim() || null,
      improvement_template: form.improvement_template.trim() || null,
    };
    if (editing) {
      const { error } = await supabase
        .from("audit_rules")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        toast.error("수정 실패", { description: error.message });
        return;
      }
      toast.success("룰이 수정되었습니다");
    } else {
      const { error } = await supabase
        .from("audit_rules")
        .insert({ ...payload, is_active: true, false_positive_count: 0 });
      if (error) {
        toast.error("추가 실패", { description: error.message });
        return;
      }
      toast.success("룰이 추가되었습니다");
    }
    setDialogOpen(false);
    qc.invalidateQueries({ queryKey: ["audit-rules"] });
  }

  async function toggleActive(r: AuditRule, next: boolean) {
    const { error } = await supabase
      .from("audit_rules")
      .update({ is_active: next })
      .eq("id", r.id);
    if (error) {
      toast.error("상태 변경 실패", { description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ["audit-rules"] });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("audit_rules")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("삭제 실패", { description: error.message });
      return;
    }
    toast.success("룰이 삭제되었습니다");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["audit-rules"] });
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(rules, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit_rules.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("배열 형식이 아닙니다");
        setImportPreview(parsed as AuditRule[]);
      } catch (err) {
        toast.error("JSON 파싱 실패", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  }

  async function confirmImport() {
    if (!importPreview) return;
    const rows = importPreview.map((r) => ({
      id: r.id,
      rule_name: r.rule_name,
      trigger_type: r.trigger_type,
      trigger_value: r.trigger_value,
      condition_desc: r.condition_desc ?? null,
      severity: r.severity,
      related_clause_ref: r.related_clause_ref ?? null,
      improvement_template: r.improvement_template ?? null,
      is_active: r.is_active ?? true,
      false_positive_count: r.false_positive_count ?? 0,
    }));
    const { error } = await supabase
      .from("audit_rules")
      .upsert(rows, { onConflict: "id" });
    if (error) {
      toast.error("가져오기 실패", { description: error.message });
      return;
    }
    toast.success(`${rows.length}건 가져오기 완료`);
    setImportPreview(null);
    qc.invalidateQueries({ queryKey: ["audit-rules"] });
  }

  const stats = useMemo(() => {
    const total = rules.length;
    const active = rules.filter((r) => r.is_active).length;
    const fp = rules.reduce((s, r) => s + (r.false_positive_count ?? 0), 0);
    return { total, active, fp };
  }, [rules]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">룰셋 관리</h1>
            <p className="text-sm text-muted-foreground mt-1">
              감사 수행 시 적용되는 룰을 등록/수정하고, JSON으로 내보내거나 가져올 수 있습니다.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportPick}
            />
            <Button variant="outline" onClick={() => importInputRef.current?.click()}>
              <UploadIcon className="size-4 mr-1.5" />
              JSON 가져오기
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={rules.length === 0}>
              <Download className="size-4 mr-1.5" />
              JSON 내보내기
            </Button>
            <Button onClick={openCreate}>
              <Plus className="size-4 mr-1.5" />
              신규 룰 추가
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">전체 룰</p>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">활성 룰</p>
            <p className="text-2xl font-bold mt-1 text-kpetro-green">{stats.active}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">누적 오탐</p>
            <p className="text-2xl font-bold mt-1 text-severity-mid">{stats.fp}</p>
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[260px]">룰명</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>트리거 값</TableHead>
                <TableHead>심각도</TableHead>
                <TableHead className="text-center">활성</TableHead>
                <TableHead className="text-center">오탐</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    불러오는 중...
                  </TableCell>
                </TableRow>
              ) : rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    등록된 룰이 없습니다. "신규 룰 추가"로 시작하세요.
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.rule_name}</div>
                      {r.condition_desc && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {r.condition_desc}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <TriggerBadge type={r.trigger_type} />
                    </TableCell>
                    <TableCell className="text-sm">{r.trigger_value}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={r.severity} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => toggleActive(r, v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="tabular-nums text-sm">
                          {r.false_positive_count}건
                        </span>
                        {r.false_positive_count >= 3 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="size-4 text-severity-mid" />
                            </TooltipTrigger>
                            <TooltipContent>
                              오탐이 누적되었습니다. 룰 검토를 권장합니다.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(r)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create/Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "룰 수정" : "신규 룰 추가"}</DialogTitle>
              <DialogDescription>
                감사 수행 시 문서에서 자동으로 검출할 조건을 정의합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>룰명 *</Label>
                <Input
                  value={form.rule_name}
                  onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                  placeholder="예: 수의계약 5천만원 초과 사유 검토"
                />
              </div>
              <div>
                <Label>유형 *</Label>
                <Select
                  value={form.trigger_type}
                  onValueChange={(v) => setForm({ ...form, trigger_type: v as TriggerType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRIGGER_LABEL[t]} ({t})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>심각도 *</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v as Severity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>트리거 값 *</Label>
                <Input
                  value={form.trigger_value}
                  onChange={(e) => setForm({ ...form, trigger_value: e.target.value })}
                  placeholder="예: 수의계약, 예정가격 산정근거"
                />
              </div>
              <div className="col-span-2">
                <Label>조건 설명</Label>
                <Textarea
                  rows={2}
                  value={form.condition_desc}
                  onChange={(e) => setForm({ ...form, condition_desc: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>관련 조항 참조</Label>
                <Input
                  value={form.related_clause_ref}
                  onChange={(e) =>
                    setForm({ ...form, related_clause_ref: e.target.value })
                  }
                  placeholder="예: 국가계약법 시행령 제26조"
                />
              </div>
              <div className="col-span-2">
                <Label>개선 의견 템플릿</Label>
                <Textarea
                  rows={3}
                  value={form.improvement_template}
                  onChange={(e) =>
                    setForm({ ...form, improvement_template: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSubmit}>{editing ? "수정" : "추가"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>룰 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleteTarget?.rule_name}" 룰을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Import preview */}
        <Dialog
          open={!!importPreview}
          onOpenChange={(o) => !o && setImportPreview(null)}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>가져오기 미리보기</DialogTitle>
              <DialogDescription>
                동일 id의 룰은 덮어쓰기됩니다. 총 {importPreview?.length ?? 0}건.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[420px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>룰명</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>트리거</TableHead>
                    <TableHead>심각도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(importPreview ?? []).map((r, i) => (
                    <TableRow key={r.id ?? i}>
                      <TableCell>{r.rule_name}</TableCell>
                      <TableCell>
                        <TriggerBadge type={r.trigger_type} />
                      </TableCell>
                      <TableCell className="text-sm">{r.trigger_value}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={r.severity} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportPreview(null)}>
                취소
              </Button>
              <Button onClick={confirmImport}>가져오기 확정</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
