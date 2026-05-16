import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Search as SearchIcon,
  Trash2,
  Eye,
  Loader2,
  File,
  AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/regulations")({
  head: () => ({
    meta: [
      { title: "규정 라이브러리 — K-Petro 일상감사 AI" },
      { name: "description", content: "감사 근거 규정 라이브러리" },
    ],
  }),
  component: RegulationsPage,
});

// --- 상수 ---
const ALLOWED_EXTS = ["pdf", "hwp", "hwpx", "txt", "docx"] as const;
type FileFormat = (typeof ALLOWED_EXTS)[number];
const CATEGORIES = ["법률", "시행령", "시행규칙", "내부규정", "지침"] as const;
type Category = (typeof CATEGORIES)[number];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type Regulation = {
  id: string;
  file_name: string;
  file_format: string;
  category: string;
  effective_date: string | null;
  storage_path: string;
  parse_status: string;
  parse_error: string | null;
  note: string | null;
  is_image_based: boolean;
  created_at: string;
};

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function nameWithoutExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function parseStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">완료</Badge>;
    case "parsing":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">파싱 중</Badge>;
    case "failed":
      return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200">실패</Badge>;
    case "pending":
    default:
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">대기</Badge>;
  }
}

function RegulationsPage() {
  const qc = useQueryClient();

  // 업로드/모달 상태
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState<Category>("내부규정");
  const [effectiveDate, setEffectiveDate] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // 목록 필터
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // 선택 / 삭제
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Regulation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["regulations"],
    queryFn: async (): Promise<Regulation[]> => {
      const { data, error } = await supabase
        .from("regulations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Regulation[];
    },
  });

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (keyword.trim() && !r.file_name.toLowerCase().includes(keyword.trim().toLowerCase()))
        return false;
      return true;
    });
  }, [items, keyword, categoryFilter]);

  const selected = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  );

  // 선택된 항목이 목록에서 사라지면 해제
  useEffect(() => {
    if (selectedId && !items.find((r) => r.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  function handleFileChosen(file: File) {
    const ext = extOf(file.name);
    if (!ALLOWED_EXTS.includes(ext as FileFormat)) {
      toast.error("지원하지 않는 파일 형식입니다.", {
        description: "허용 확장자: .pdf .hwp .hwpx .txt .docx",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("파일 용량 초과", {
        description: `최대 50MB까지 업로드 가능합니다. (선택 파일: ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      });
      return;
    }
    setPendingFile(file);
    setDocName(nameWithoutExt(file.name));
    setCategory("내부규정");
    setEffectiveDate("");
    setNote("");
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileChosen(f);
  }

  async function handleSubmit() {
    if (!pendingFile || !docName.trim()) {
      toast.error("문서명을 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    const ext = extOf(pendingFile.name) as FileFormat;
    const storagePath = `${crypto.randomUUID()}.${ext}`;

    try {
      // 1) Storage 업로드
      const { error: upErr } = await supabase.storage
        .from("regulations")
        .upload(storagePath, pendingFile, {
          contentType: pendingFile.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;

      // 2) DB INSERT
      const { error: insErr } = await supabase.from("regulations").insert({
        file_name: docName.trim(),
        file_format: ext,
        category,
        effective_date: effectiveDate || null,
        storage_path: storagePath,
        parse_status: "pending",
        note: note.trim() || null,
      });

      if (insErr) {
        // INSERT 실패 시 업로드된 파일 정리
        await supabase.storage.from("regulations").remove([storagePath]);
        throw insErr;
      }

      toast.success("규정이 등록되었습니다.", {
        description: "다음 단계에서 자동 파싱이 진행될 예정입니다.",
      });
      setPendingFile(null);
      setDocName("");
      setNote("");
      setEffectiveDate("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["regulations"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.";
      toast.error("등록 실패", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      // Storage 파일 삭제 (실패해도 계속 진행)
      const { error: storageErr } = await supabase.storage
        .from("regulations")
        .remove([pendingDelete.storage_path]);
      if (storageErr) {
        console.warn("Storage 삭제 실패:", storageErr.message);
      }

      // DB 삭제 (조항은 CASCADE)
      const { error: dbErr } = await supabase
        .from("regulations")
        .delete()
        .eq("id", pendingDelete.id);
      if (dbErr) throw dbErr;

      toast.success("규정이 삭제되었습니다.");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["regulations"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.";
      toast.error("삭제 실패", { description: msg });
    } finally {
      setDeleting(false);
    }
  }

  async function handleView(r: Regulation) {
    setSelectedId(r.id);
    try {
      const { data, error } = await supabase.storage
        .from("regulations")
        .createSignedUrl(r.storage_path, 60);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "파일을 열 수 없습니다.";
      toast.error("파일 열기 실패", { description: msg });
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">규정 라이브러리</h1>
        <p className="text-sm text-muted-foreground mt-1">
          감사 근거가 되는 법령·내규·지침을 등록하고 관리합니다.
        </p>
      </div>

      {/* 업로드 영역 */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={
          "bg-card border-2 border-dashed rounded-2xl p-8 transition-colors " +
          (dragActive ? "border-kpetro-blue bg-blue-50/40" : "border-border")
        }
      >
        <div className="flex flex-col items-center text-center">
          <div className="size-12 rounded-full bg-kpetro-navy/5 flex items-center justify-center mb-3">
            <Upload className="size-6 text-kpetro-navy" />
          </div>
          <h2 className="font-semibold text-slate-800">파일을 드래그하거나 클릭하여 업로드</h2>
          <p className="text-sm text-muted-foreground mt-1">
            허용 확장자: .pdf · .hwp · .hwpx · .txt · .docx — 최대 50MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.hwp,.hwpx,.txt,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileChosen(f);
            }}
          />
          <Button
            type="button"
            className="mt-4 bg-kpetro-navy hover:bg-kpetro-navy-hover"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4 mr-2" /> 파일 선택
          </Button>
        </div>
      </section>

      {/* 목록 */}
      <section className="bg-card border border-border rounded-2xl shadow-sm">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <h2 className="font-semibold text-slate-800">등록된 규정 목록</h2>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <SearchIcon className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="문서명 검색"
                className="pl-8 w-56"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="분류" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 분류</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">문서명</TableHead>
                <TableHead>분류</TableHead>
                <TableHead>형식</TableHead>
                <TableHead>시행일</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead>파싱 상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Loader2 className="inline size-4 animate-spin mr-2" />
                    불러오는 중…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16">
                    <div className="flex flex-col items-center text-muted-foreground">
                      <FileText className="size-8 mb-2 text-slate-300" />
                      <p className="text-sm">등록된 규정이 없습니다.</p>
                      <p className="text-xs mt-1">상단에서 파일을 업로드해 보세요.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    data-state={selectedId === r.id ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <TableCell className="font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <File className="size-4 text-kpetro-gray shrink-0" />
                        <span className="truncate">{r.file_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {r.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="uppercase text-xs text-muted-foreground">
                      {r.file_format}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.effective_date ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>{parseStatusBadge(r.parse_status)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleView(r)}
                          title="파일 열기"
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => setPendingDelete(r)}
                          title="삭제"
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
      </section>

      {/* 상세 패널 */}
      <section className="bg-card border border-border rounded-2xl shadow-sm">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-slate-800">상세 정보</h2>
        </div>
        <div className="p-6">
          {!selected ? (
            <div className="flex flex-col items-center text-center py-8 text-muted-foreground">
              <AlertCircle className="size-6 mb-2 text-slate-300" />
              <p className="text-sm">위 목록에서 규정을 선택하면 상세 정보가 표시됩니다.</p>
            </div>
          ) : (
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <Field label="문서명" value={selected.file_name} />
              <Field label="분류" value={selected.category} />
              <Field label="파일 형식" value={selected.file_format.toUpperCase()} />
              <Field label="시행일" value={selected.effective_date ?? "—"} />
              <Field
                label="등록일"
                value={new Date(selected.created_at).toLocaleString("ko-KR")}
              />
              <Field label="파싱 상태" value={<>{parseStatusBadge(selected.parse_status)}</>} />
              <Field label="스캔본 여부" value={selected.is_image_based ? "예" : "아니오"} />
              <Field label="저장 경로" value={<code className="text-xs">{selected.storage_path}</code>} />
              <div className="md:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground mb-1">비고</dt>
                <dd className="text-slate-800 whitespace-pre-wrap">
                  {selected.note?.trim() ? selected.note : "—"}
                </dd>
              </div>
              {selected.parse_error && (
                <div className="md:col-span-2">
                  <dt className="text-xs font-medium text-rose-600 mb-1">파싱 오류</dt>
                  <dd className="text-rose-700 text-xs whitespace-pre-wrap">{selected.parse_error}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </section>

      {/* 메타데이터 입력 모달 */}
      <Dialog
        open={!!pendingFile}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            setPendingFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>규정 메타데이터 입력</DialogTitle>
            <DialogDescription>
              {pendingFile && (
                <span className="text-xs">
                  {pendingFile.name} ({(pendingFile.size / 1024 / 1024).toFixed(2)}MB)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="docName">문서명 *</Label>
              <Input
                id="docName"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">분류 *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger id="category" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="effectiveDate">시행일</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="note">비고</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="등록 관련 메모를 자유롭게 입력하세요."
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingFile(null)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !docName.trim()}
              className="bg-kpetro-navy hover:bg-kpetro-navy-hover"
            >
              {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && !deleting && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>규정을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.file_name}" 규정과 연결된 조항, 저장된 파일이 모두 삭제되며 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {deleting && <Loader2 className="size-4 mr-2 animate-spin" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground mb-1">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
