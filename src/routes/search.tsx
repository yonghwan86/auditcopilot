import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Fuse, { type FuseResultMatch, type IFuseOptions } from "fuse.js";
import { Search as SearchIcon, Info, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "통합 검색 — K-Petro 일상감사 AI" },
      { name: "description", content: "규정 조항 통합 검색" },
    ],
  }),
  component: SearchPage,
});

const CATEGORIES = ["전체", "법률", "시행령", "시행규칙", "내부규정", "지침"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

type ClauseRow = {
  id: string;
  regulation_id: string;
  clause_id: string;
  title: string | null;
  content: string;
  order_index: number;
  regulation_name: string;
  regulation_category: string;
};

const PAGE_SIZE = 30;

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlight(text: string, matches: readonly FuseResultMatch[] | undefined, key: string) {
  if (!matches) return escapeHtml(text);
  const m = matches.find((x) => x.key === key);
  if (!m || !m.indices?.length) return escapeHtml(text);
  // 정렬된 indices 기준으로 마크업
  const sorted = [...m.indices].sort((a, b) => a[0] - b[0]);
  let out = "";
  let cursor = 0;
  for (const [s, e] of sorted) {
    if (s < cursor) continue;
    out += escapeHtml(text.slice(cursor, s));
    out += `<mark class="bg-yellow-200 text-foreground rounded px-0.5">${escapeHtml(text.slice(s, e + 1))}</mark>`;
    cursor = e + 1;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}

function excerpt(text: string, matches: readonly FuseResultMatch[] | undefined, around = 80) {
  const m = matches?.find((x) => x.key === "content");
  if (!m?.indices?.length) {
    return escapeHtml(text.slice(0, 200)) + (text.length > 200 ? "…" : "");
  }
  const [s, e] = m.indices[0];
  const start = Math.max(0, s - around);
  const end = Math.min(text.length, e + 1 + around);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  // 자른 텍스트에 대해 다시 하이라이트 (indices 보정)
  const sliced = text.slice(start, end);
  const adjusted: FuseResultMatch = {
    ...m,
    indices: m.indices
      .filter(([a, b]) => b >= start && a <= end)
      .map(([a, b]) => [Math.max(0, a - start), Math.min(sliced.length - 1, b - start)] as [number, number]),
  };
  return prefix + highlight(sliced, [adjusted], "content") + suffix;
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("전체");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [openClause, setOpenClause] = useState<ClauseRow | null>(null);

  const { data: clauses = [], isLoading } = useQuery({
    queryKey: ["search-clauses-all"],
    queryFn: async (): Promise<ClauseRow[]> => {
      // completed 규정만 대상
      const { data: regs, error: rErr } = await supabase
        .from("regulations")
        .select("id, file_name, category, parse_status")
        .eq("parse_status", "completed");
      if (rErr) throw rErr;
      const regMap = new Map<string, { name: string; category: string }>();
      for (const r of regs ?? []) {
        regMap.set(r.id as string, {
          name: r.file_name as string,
          category: r.category as string,
        });
      }
      if (regMap.size === 0) return [];

      const { data: rows, error: cErr } = await supabase
        .from("regulation_clauses")
        .select("id, regulation_id, clause_id, title, content, order_index")
        .in("regulation_id", Array.from(regMap.keys()))
        .order("order_index", { ascending: true });
      if (cErr) throw cErr;

      return (rows ?? []).map((c) => {
        const meta = regMap.get(c.regulation_id as string);
        return {
          id: c.id as string,
          regulation_id: c.regulation_id as string,
          clause_id: c.clause_id as string,
          title: (c.title as string | null) ?? null,
          content: c.content as string,
          order_index: c.order_index as number,
          regulation_name: meta?.name ?? "(알 수 없음)",
          regulation_category: meta?.category ?? "",
        };
      });
    },
  });

  useEffect(() => {
    if (clauses.length > 10000) {
      toast.warning("규정 양이 많아 검색 인덱스 구성이 다소 지연될 수 있습니다", {
        description: `총 ${clauses.length.toLocaleString()}건의 조항을 인덱싱합니다.`,
      });
    }
  }, [clauses.length]);

  const filtered = useMemo(() => {
    if (category === "전체") return clauses;
    return clauses.filter((c) => c.regulation_category === category);
  }, [clauses, category]);

  const fuse = useMemo(() => {
    const opts: IFuseOptions<ClauseRow> = {
      keys: [
        { name: "content", weight: 0.7 },
        { name: "title", weight: 0.3 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 2,
      includeMatches: true,
      includeScore: true,
    };
    return new Fuse(filtered, opts);
  }, [filtered]);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    return fuse.search(q);
  }, [fuse, query]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, category]);

  const visible = results.slice(0, limit);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">통합 검색</h1>
        <p className="text-sm text-muted-foreground mt-1">
          파싱 완료된 규정의 조항 본문을 빠르게 검색합니다.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-2 text-sm text-blue-900">
        <Info className="size-4 mt-0.5 shrink-0" />
        <p>
          현재 검색은 키워드 매칭 방식입니다. 의미 기반 검색은 추후 임베딩 모델 연동 시 제공됩니다.
        </p>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색어를 2자 이상 입력하세요 (예: 수의계약, 예정가격)"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as CategoryFilter)}>
          <SelectTrigger className="w-40">
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

      <div className="text-sm text-muted-foreground flex items-center gap-4">
        <span>
          전체 조항: <strong className="text-foreground tabular-nums">{clauses.length.toLocaleString()}</strong>건
        </span>
        <span>
          필터 적용: <strong className="text-foreground tabular-nums">{filtered.length.toLocaleString()}</strong>건
        </span>
        {query.trim().length >= 2 && (
          <span>
            검색 결과: <strong className="text-foreground tabular-nums">{results.length.toLocaleString()}</strong>건
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-16">조항을 불러오는 중...</div>
      ) : clauses.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          파싱이 완료된 규정이 없습니다. 먼저 규정 라이브러리에서 문서를 등록·파싱하세요.
        </div>
      ) : query.trim().length < 2 ? (
        <div className="text-center text-muted-foreground py-16">
          검색어를 2자 이상 입력하면 결과가 표시됩니다.
        </div>
      ) : results.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          일치하는 조항이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const c = r.item;
            const score = r.score ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setOpenClause(c)}
                className="w-full text-left rounded-lg border bg-card p-4 hover:border-primary/40 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <BookOpen className="size-4 text-kpetro-blue shrink-0" />
                    <span className="font-medium truncate">{c.regulation_name}</span>
                    {c.regulation_category && (
                      <Badge variant="outline" className="text-xs">
                        {c.regulation_category}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {c.clause_id}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    매칭도 {(100 - score * 100).toFixed(0)}점
                  </span>
                </div>
                {c.title && (
                  <div
                    className="text-sm font-medium mb-1"
                    dangerouslySetInnerHTML={{
                      __html: highlight(c.title, r.matches, "title"),
                    }}
                  />
                )}
                <div
                  className="text-sm text-muted-foreground leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: excerpt(c.content, r.matches),
                  }}
                />
              </button>
            );
          })}

          {limit < results.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                더 보기 ({results.length - limit}건 남음)
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!openClause} onOpenChange={(o) => !o && setOpenClause(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{openClause?.clause_id}</Badge>
              <span>{openClause?.title ?? "(제목 없음)"}</span>
            </DialogTitle>
            <DialogDescription>
              {openClause?.regulation_name}
              {openClause?.regulation_category && ` · ${openClause.regulation_category}`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {openClause?.content}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
