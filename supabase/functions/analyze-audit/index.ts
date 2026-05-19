// analyze-audit
// 입력: { session_id: uuid }
// 처리:
//   1) 대상 문서 텍스트 추출 (kordoc/unpdf/mammoth/TextDecoder)
//   2) 문장 분할
//   3) 룰 매칭 + 규정 조항 키워드 중첩 + 중복 제거
//   4) 개선안 생성 (템플릿, 심각도'상'은 선택적으로 LLM 보강)
//   5) audit_sessions 상태/진행률 Realtime 업데이트
//
// NOTE: 신규 서버 로직은 보통 TanStack createServerFn으로 작성하지만,
//       Deno 환경의 kordoc 파서를 재사용해야 하므로 Edge Function으로 구현.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 50 * 1024 * 1024;

// ──────────────────────────────────────────────────────────────────────────────
// 파서 로더 (extract-regulation과 동일 전략)
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
        console.log(`[analyze-audit] kordoc loaded from: ${url}`);
        return mod.parse ? mod : mod.default;
      }
    } catch (e) {
      console.warn(`[analyze-audit] kordoc import failed: ${url} → ${(e as Error).message}`);
    }
  }
  return null;
}

type ParseResult = {
  success: boolean;
  markdown: string;
  isImageBased: boolean;
  error?: string;
};

async function parsePdfWithUnpdf(buf: ArrayBuffer): Promise<ParseResult> {
  try {
    const { extractText, getDocumentProxy } = await import(
      "https://esm.sh/unpdf@0.12.1"
    );
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = (Array.isArray(text) ? text.join("\n") : text).trim();
    const isImageBased = merged.length < 50 && totalPages > 0;
    return { success: true, markdown: merged, isImageBased };
  } catch (e) {
    return { success: false, markdown: "", isImageBased: false, error: `PDF 파싱 실패: ${(e as Error).message}` };
  }
}

async function parseDocx(buf: ArrayBuffer): Promise<ParseResult> {
  try {
    const candidates = ["npm:mammoth", "https://esm.sh/mammoth@1.8.0?bundle"];
    let mammoth: any = null;
    for (const url of candidates) {
      try {
        const m = await import(url);
        mammoth = m.default ?? m;
        if (mammoth?.extractRawText) break;
      } catch (_) {/* continue */}
    }
    if (!mammoth?.extractRawText) throw new Error("mammoth 패키지 로딩 실패");
    const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
    return { success: true, markdown: (value as string).trim(), isImageBased: false };
  } catch (e) {
    return { success: false, markdown: "", isImageBased: false, error: `DOCX 파싱 실패: ${(e as Error).message}` };
  }
}

async function parseBuffer(buf: ArrayBuffer, format: string): Promise<ParseResult> {
  if (buf.byteLength > MAX_BYTES) {
    return { success: false, markdown: "", isImageBased: false, error: "파일 크기가 50MB를 초과합니다." };
  }
  if (format === "txt") {
    return { success: true, markdown: new TextDecoder("utf-8").decode(buf).trim(), isImageBased: false };
  }
  if (format === "docx") return await parseDocx(buf);

  const kordoc = await loadKordoc();
  if (kordoc) {
    try {
      const result = await kordoc.parse(buf);
      const markdown: string = typeof result === "string" ? result : (result.markdown ?? "");
      const isImageBased: boolean = result?.isImageBased ?? false;
      const ok = !!markdown && markdown.trim().length > 0;
      return {
        success: ok,
        markdown: markdown.trim(),
        isImageBased,
        error: ok ? undefined : (result?.error ?? "kordoc이 빈 결과를 반환했습니다."),
      };
    } catch (e) {
      console.error("[analyze-audit] kordoc parse error:", e);
      if (format === "pdf") return await parsePdfWithUnpdf(buf);
      return { success: false, markdown: "", isImageBased: false, error: `kordoc 파싱 실패: ${(e as Error).message}` };
    }
  }
  // TODO: kordoc 통합 실패 시 별도 Node 서버 또는 Lambda 분리 검토
  if (format === "pdf") return await parsePdfWithUnpdf(buf);
  return {
    success: false,
    markdown: "",
    isImageBased: false,
    error: "HWP/HWPX 파서(kordoc) 초기화 실패. PDF/TXT/DOCX 형식으로 재업로드해 주세요.",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 문장 분할
// ──────────────────────────────────────────────────────────────────────────────
type Sentence = { text: string; position: number };

function splitSentences(markdown: string): Sentence[] {
  // 헤더/표 라인 제거
  const cleaned = markdown
    .split(/\r?\n/)
    .filter((l) => !/^\s*#{1,6}\s+/.test(l) && !/^\s*\|/.test(l))
    .join("\n");

  const re = /[^.!?。다음임함요종]+[.!?。다음임함요종]+["」』\)]?/g;
  const out: Sentence[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const text = m[0].trim();
    if (text.length >= 10) {
      out.push({ text, position: m.index });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────────
// LLM 보강 (선택적)
// ──────────────────────────────────────────────────────────────────────────────
async function generateAiImprovement(
  excerpt: string,
  ruleName: string,
  reason: string,
): Promise<string | null> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "당신은 한국 공공기관 일상감사 전문가입니다. 감사 발견사항에 대한 구체적이고 실행가능한 개선안을 2-3문장으로 한국어로 작성하세요.",
          },
          {
            role: "user",
            content: `[규정/룰] ${ruleName}\n[지적사유] ${reason}\n[원문 발췌] ${excerpt}\n\n개선안을 작성해주세요.`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[analyze-audit] AI gateway ${res.status}`);
      return null;
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    return content ? `[AI 생성] ${String(content).trim()}` : null;
  } catch (e) {
    console.warn("[analyze-audit] AI fallback:", (e as Error).message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 메인 핸들러
// ──────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let sessionId = "";
  try {
    const body = await req.json();
    sessionId = body.session_id;
    if (!sessionId) throw new Error("session_id 누락");

    const updateStatus = async (patch: Record<string, any>) => {
      await supabase.from("audit_sessions").update(patch).eq("id", sessionId);
    };

    // 1) 세션 로드
    const { data: session, error: sErr } = await supabase
      .from("audit_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) throw new Error(`세션 조회 실패: ${sErr?.message ?? "not found"}`);

    await updateStatus({ status: "extracting", status_message: "문서 텍스트 추출 중", progress_percent: 10 });

    // 2) Storage 다운로드
    const { data: file, error: dErr } = await supabase.storage
      .from("audit-targets")
      .download(session.target_storage_path);
    if (dErr || !file) throw new Error(`파일 다운로드 실패: ${dErr?.message}`);
    const buf = await file.arrayBuffer();

    // 3) 파싱
    const parsed = await parseBuffer(buf, session.target_file_format);
    if (parsed.isImageBased) {
      await updateStatus({
        status: "failed",
        status_message: "스캔본 PDF는 분석할 수 없습니다",
        error_message: "이미지 기반 문서입니다. 텍스트가 포함된 문서로 다시 업로드해주세요.",
      });
      return new Response(JSON.stringify({ success: false, error: "image_based" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (!parsed.success) {
      await updateStatus({
        status: "failed",
        status_message: "텍스트 추출 실패",
        error_message: parsed.error,
      });
      return new Response(JSON.stringify({ success: false, error: parsed.error }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const markdown = parsed.markdown;
    await updateStatus({
      target_full_markdown: markdown,
      progress_percent: 30,
      status_message: "문장 분할 중",
    });

    // 4) 문장 분할
    const sentences = splitSentences(markdown);
    await updateStatus({
      total_sentences: sentences.length,
      status: "matching",
      status_message: "룰 매칭 중",
      progress_percent: 50,
    });

    // 5) 데이터 로드
    const { data: rules } = await supabase
      .from("audit_rules")
      .select("*")
      .eq("is_active", true);
    const { data: clauses } = await supabase
      .from("regulation_clauses")
      .select("id, clause_id, title, content, regulation_id");

    type Finding = {
      finding_type: string;
      excerpt: string;
      excerpt_position: number;
      matched_rule_id: string | null;
      matched_clause_id: string | null;
      severity: string;
      reason: string;
      improvement: string;
    };
    const findings: Finding[] = [];
    const seen = new Set<string>();
    const pushFinding = (f: Finding) => {
      const key = `${f.excerpt_position}|${f.severity}|${f.reason}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(f);
    };

    // (A) 룰 매칭
    for (const rule of rules ?? []) {
      const trigger = (rule.trigger_value ?? "").trim();
      if (!trigger) continue;

      if (rule.trigger_type === "required") {
        if (!markdown.includes(trigger)) {
          pushFinding({
            finding_type: "missing_required",
            excerpt: "[문서 전반]",
            excerpt_position: 0,
            matched_rule_id: rule.id,
            matched_clause_id: null,
            severity: rule.severity,
            reason: `필수 항목 누락: "${trigger}"`,
            improvement: "",
          });
        }
        continue;
      }

      // keyword / forbidden — 문장 단위 검사
      for (const s of sentences) {
        if (s.text.includes(trigger)) {
          pushFinding({
            finding_type: "rule_match",
            excerpt: s.text,
            excerpt_position: s.position,
            matched_rule_id: rule.id,
            matched_clause_id: null,
            severity: rule.severity,
            reason: rule.condition_desc ?? `룰 "${rule.rule_name}" 매칭`,
            improvement: "",
          });
        }
      }
    }

    // (B) 규정 조항 키워드 중첩 — 문서당 토큰 1회
    const usedTokens = new Set<string>();
    const tokenRe = /[\uAC00-\uD7AF]{5,}/g;
    for (const s of sentences) {
      const tokens = s.text.match(tokenRe) ?? [];
      for (const tok of tokens) {
        if (usedTokens.has(tok)) continue;
        const hit = (clauses ?? []).find((c) =>
          (c.content ?? "").includes(tok)
        );
        if (hit) {
          usedTokens.add(tok);
          pushFinding({
            finding_type: "keyword_overlap",
            excerpt: s.text,
            excerpt_position: s.position,
            matched_rule_id: null,
            matched_clause_id: hit.id,
            severity: "하",
            reason: `규정 조항 "${hit.clause_id}"와 키워드 "${tok}" 중첩 (참고)`,
            improvement: "",
          });
          break; // 문장당 1건
        }
      }
    }

    // (C) 개선안 생성
    await updateStatus({
      status: "analyzing",
      status_message: "개선안 생성 중",
      progress_percent: 80,
    });

    const rulesById = new Map((rules ?? []).map((r) => [r.id, r]));
    const clausesById = new Map((clauses ?? []).map((c) => [c.id, c]));

    for (const f of findings) {
      // 템플릿 기반
      if (f.matched_rule_id) {
        const r = rulesById.get(f.matched_rule_id);
        if (r?.improvement_template) {
          f.improvement = r.improvement_template;
        } else {
          f.improvement = `[관련 근거: ${r?.rule_name ?? "룰"}]에 따라 검토 및 보완 필요`;
        }
      } else if (f.matched_clause_id) {
        const c = clausesById.get(f.matched_clause_id);
        f.improvement = `[관련 근거: ${c?.clause_id ?? "조항"}]에 따라 검토 및 보완 필요`;
      } else {
        f.improvement = "[관련 근거]에 따라 검토 및 보완 필요";
      }

      // 심각도 '상' → AI 보강 (실패 시 템플릿 유지)
      if (f.severity === "상" && f.finding_type === "rule_match") {
        const r = f.matched_rule_id ? rulesById.get(f.matched_rule_id) : null;
        const ai = await generateAiImprovement(
          f.excerpt,
          r?.rule_name ?? "감사 룰",
          f.reason,
        );
        if (ai) f.improvement = ai;
      }
    }

    // 6) DB 적재 (기존 finding 정리 후 삽입)
    await supabase.from("audit_findings").delete().eq("session_id", sessionId);
    if (findings.length > 0) {
      const rows = findings.map((f) => ({ ...f, session_id: sessionId }));
      const { error: insErr } = await supabase.from("audit_findings").insert(rows);
      if (insErr) console.error("[analyze-audit] insert findings error:", insErr);
    }

    await updateStatus({
      status: "completed",
      status_message: "분석 완료",
      progress_percent: 100,
      total_findings: findings.length,
      completed_at: new Date().toISOString(),
      error_message: null,
    });

    return new Response(
      JSON.stringify({ success: true, total_findings: findings.length }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[analyze-audit] fatal:", msg);
    if (sessionId) {
      await supabase
        .from("audit_sessions")
        .update({
          status: "failed",
          status_message: "분석 실패",
          error_message: msg,
        })
        .eq("id", sessionId);
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
