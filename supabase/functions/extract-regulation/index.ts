// extract-regulation
// 입력: { regulation_id: uuid }
// 처리: Storage에서 파일을 받아 kordoc(또는 폴백 파서)로 Markdown 추출 →
//       조항 단위 분할 → regulation_clauses 적재 → parse_status 업데이트
//
// NOTE: 본 프로젝트의 신규 서버 로직은 보통 TanStack createServerFn으로 작성하지만,
//       사용자가 Deno 환경의 kordoc 패키지 동작 검증을 요청했기 때문에
//       명시적으로 Edge Function으로 구현합니다.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 50 * 1024 * 1024;

type ParseResult = {
  success: boolean;
  markdown: string;
  fileType: string;
  isImageBased: boolean;
  pageCount: number;
  error?: string;
};

// ──────────────────────────────────────────────────────────────────────────────
// kordoc 동적 import (3단계 폴백)
// ──────────────────────────────────────────────────────────────────────────────
async function loadKordoc(): Promise<any | null> {
  const candidates = [
    "npm:kordoc",
    "https://esm.sh/kordoc?bundle",
    "https://esm.sh/kordoc@latest?bundle",
  ];
  for (const url of candidates) {
    try {
      const mod = await import(url);
      if (mod && (mod.parse || mod.default?.parse)) {
        console.log(`[extract-regulation] kordoc loaded from: ${url}`);
        return mod.parse ? mod : mod.default;
      }
    } catch (e) {
      console.warn(`[extract-regulation] kordoc import failed: ${url} → ${(e as Error).message}`);
    }
  }
  console.error("[extract-regulation] All kordoc import candidates failed");
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF 폴백 (unpdf)
// ──────────────────────────────────────────────────────────────────────────────
async function parsePdfWithUnpdf(buf: ArrayBuffer): Promise<ParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import(
      "https://esm.sh/unpdf@0.12.1"
    );
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join("\n") : text).trim();
    const isImageBased = merged.length < 50 && totalPages > 0;
    return {
      success: true,
      markdown: merged,
      fileType: "pdf",
      isImageBased,
      pageCount: totalPages,
    };
  } catch (e) {
    return {
      success: false,
      markdown: "",
      fileType: "pdf",
      isImageBased: false,
      pageCount: 0,
      error: `PDF 파싱 실패: ${(e as Error).message}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DOCX 파싱 (mammoth)
// ──────────────────────────────────────────────────────────────────────────────
async function parseDocx(buf: ArrayBuffer): Promise<ParseResult> {
  try {
    const candidates = ["npm:mammoth", "https://esm.sh/mammoth@1.8.0?bundle"];
    let mammoth: any = null;
    for (const url of candidates) {
      try {
        const m = await import(url);
        mammoth = m.default ?? m;
        if (mammoth?.extractRawText) break;
      } catch (_) {
        // continue
      }
    }
    if (!mammoth?.extractRawText) {
      throw new Error("mammoth 패키지 로딩 실패");
    }
    const { value } = await mammoth.extractRawText({
      arrayBuffer: buf,
    });
    return {
      success: true,
      markdown: (value as string).trim(),
      fileType: "docx",
      isImageBased: false,
      pageCount: 0,
    };
  } catch (e) {
    return {
      success: false,
      markdown: "",
      fileType: "docx",
      isImageBased: false,
      pageCount: 0,
      error: `DOCX 파싱 실패: ${(e as Error).message}`,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 통합 파싱
// ──────────────────────────────────────────────────────────────────────────────
async function parseBuffer(
  buf: ArrayBuffer,
  format: string,
): Promise<ParseResult> {
  if (buf.byteLength > MAX_BYTES) {
    return {
      success: false,
      markdown: "",
      fileType: format,
      isImageBased: false,
      pageCount: 0,
      error: "파일 크기가 50MB를 초과합니다.",
    };
  }

  // TXT: 직접 디코딩
  if (format === "txt") {
    const text = new TextDecoder("utf-8").decode(buf).trim();
    return {
      success: true,
      markdown: text,
      fileType: "txt",
      isImageBased: false,
      pageCount: 0,
    };
  }

  // DOCX: mammoth
  if (format === "docx") {
    return await parseDocx(buf);
  }

  // PDF / HWP / HWPX: kordoc 우선
  const kordoc = await loadKordoc();
  if (kordoc) {
    try {
      const result = await kordoc.parse(buf);
      // kordoc 응답 정규화
      const markdown: string =
        typeof result === "string" ? result : (result.markdown ?? "");
      const isImageBased: boolean = result?.isImageBased ?? false;
      const pageCount: number = result?.pageCount ?? 0;
      const ok = !!markdown && markdown.trim().length > 0;
      return {
        success: ok,
        markdown: markdown.trim(),
        fileType: format,
        isImageBased,
        pageCount,
        error: ok ? undefined : (result?.error ?? "kordoc이 빈 결과를 반환했습니다."),
      };
    } catch (e) {
      console.error("[extract-regulation] kordoc parse error:", e);
      // PDF는 unpdf로 폴백
      if (format === "pdf") return await parsePdfWithUnpdf(buf);
      return {
        success: false,
        markdown: "",
        fileType: format,
        isImageBased: false,
        pageCount: 0,
        error: `kordoc 파싱 실패: ${(e as Error).message}`,
      };
    }
  }

  // kordoc 로딩 자체가 실패한 경우
  // TODO: kordoc 통합 실패 시 별도 Node 서버 또는 Lambda 분리 검토
  if (format === "pdf") {
    return await parsePdfWithUnpdf(buf);
  }
  return {
    success: false,
    markdown: "",
    fileType: format,
    isImageBased: false,
    pageCount: 0,
    error:
      "HWP/HWPX 파서(kordoc)를 초기화하지 못했습니다. PDF/TXT/DOCX 형식으로 재업로드하거나 운영팀에 문의해 주세요.",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 조항 분할 (한국 규정 패턴)
// ──────────────────────────────────────────────────────────────────────────────
type Clause = {
  clause_id: string;
  title: string | null;
  content: string;
  order_index: number;
};

const ARTICLE_RE =
  /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*\(([^)]+)\))?/;

function splitClauses(markdown: string): Clause[] {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown.split(/\r?\n/);
  const clauses: Clause[] = [];
  let current: Clause | null = null;
  let order = 0;

  // 1차: Markdown 헤더 기반
  let headerMatched = false;

  for (const line of lines) {
    const headerMatch = line.match(/^#{2,4}\s+(.*)$/);
    if (headerMatch) {
      const head = headerMatch[1].trim();
      const am = head.match(ARTICLE_RE);
      if (am) {
        headerMatched = true;
        if (current) clauses.push(current);
        const id = am[2] ? `제${am[1]}조의${am[2]}` : `제${am[1]}조`;
        current = {
          clause_id: id,
          title: am[3] ?? null,
          content: "",
          order_index: order++,
        };
        continue;
      }
    }
    if (current) current.content += line + "\n";
  }
  if (current) clauses.push(current);

  if (headerMatched && clauses.length > 0) {
    return clauses.map((c) => ({ ...c, content: c.content.trim() }));
  }

  // 2차: 정규식 fallback — 본문에서 "제 X 조" 패턴으로 직접 자르기.
  // 줄 시작(^)에서만 매치되도록 'm' 플래그 사용 → 본문 중간의 cross-reference
  // ("국가계약법 제4조의 규정에 의한…")는 새 조항으로 잘못 자르지 않음.
  const fallback: Clause[] = [];
  const re = /^[ \t]*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*\(([^)]+)\))?/gm;
  const matches: { idx: number; id: string; title: string | null }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const id = m[2] ? `제${m[1]}조의${m[2]}` : `제${m[1]}조`;
    matches.push({ idx: m.index, id, title: m[3] ?? null });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : markdown.length;
    const body = markdown.slice(start, end).trim();
    fallback.push({
      clause_id: matches[i].id,
      title: matches[i].title,
      content: body,
      order_index: i,
    });
  }
  return fallback;
}

// ──────────────────────────────────────────────────────────────────────────────
// 메인 핸들러
// ──────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let regulationId = "";
  try {
    const body = await req.json();
    regulationId = body?.regulation_id;
    if (!regulationId) {
      return new Response(
        JSON.stringify({ error: "regulation_id 가 필요합니다." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
  } catch (_) {
    return new Response(JSON.stringify({ error: "잘못된 JSON 본문" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // 1) 메타 조회
  const { data: reg, error: regErr } = await supabase
    .from("regulations")
    .select("id, storage_path, file_format")
    .eq("id", regulationId)
    .single();

  if (regErr || !reg) {
    return new Response(
      JSON.stringify({ error: `규정을 찾을 수 없습니다: ${regErr?.message ?? ""}` }),
      { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // 2) parsing 상태로 전이
  await supabase
    .from("regulations")
    .update({ parse_status: "parsing", parse_error: null })
    .eq("id", regulationId);

  try {
    // 3) 파일 다운로드
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("regulations")
      .download(reg.storage_path);

    if (dlErr || !fileBlob) {
      throw new Error(`파일을 가져올 수 없습니다: ${dlErr?.message ?? "unknown"}`);
    }
    const buf = await fileBlob.arrayBuffer();

    // 4) 파싱
    const result = await parseBuffer(buf, String(reg.file_format).toLowerCase());

    if (!result.success) {
      await supabase
        .from("regulations")
        .update({
          parse_status: "failed",
          parse_error: result.error ?? "알 수 없는 파싱 오류",
          is_image_based: result.isImageBased,
        })
        .eq("id", regulationId);
      return new Response(
        JSON.stringify({ ok: false, error: result.error }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    if (result.isImageBased) {
      await supabase
        .from("regulations")
        .update({
          parse_status: "failed",
          is_image_based: true,
          parse_error:
            "스캔본 PDF로 추정됩니다. OCR이 필요하거나 텍스트 PDF로 재변환 후 재업로드해주세요",
        })
        .eq("id", regulationId);
      return new Response(
        JSON.stringify({ ok: false, error: "image_based" }),
        { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 5) full_markdown 저장
    await supabase
      .from("regulations")
      .update({ full_markdown: result.markdown })
      .eq("id", regulationId);

    // 6) 조항 분할 + 적재
    const clauses = splitClauses(result.markdown);

    // 기존 조항 삭제 후 재삽입
    await supabase
      .from("regulation_clauses")
      .delete()
      .eq("regulation_id", regulationId);

    if (clauses.length > 0) {
      const rows = clauses.map((c) => ({
        regulation_id: regulationId,
        clause_id: c.clause_id,
        title: c.title,
        content: c.content,
        order_index: c.order_index,
      }));
      const { error: insErr } = await supabase
        .from("regulation_clauses")
        .insert(rows);
      if (insErr) throw new Error(`조항 저장 실패: ${insErr.message}`);
    }

    // 7) 상태 마감
    const noteFlag =
      clauses.length === 0
        ? "[자동] 조항 자동 분할 실패. 조항 ID 수동 정의 필요"
        : null;

    if (noteFlag) {
      // 기존 note 보존하고 append
      const { data: cur } = await supabase
        .from("regulations")
        .select("note")
        .eq("id", regulationId)
        .single();
      const merged =
        cur?.note && !cur.note.includes(noteFlag)
          ? `${cur.note}\n${noteFlag}`
          : (cur?.note ?? noteFlag);
      await supabase
        .from("regulations")
        .update({ parse_status: "completed", note: merged })
        .eq("id", regulationId);
    } else {
      await supabase
        .from("regulations")
        .update({ parse_status: "completed" })
        .eq("id", regulationId);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        clauseCount: clauses.length,
        pageCount: result.pageCount,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[extract-regulation] fatal:", msg);
    await supabase
      .from("regulations")
      .update({ parse_status: "failed", parse_error: msg })
      .eq("id", regulationId);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
