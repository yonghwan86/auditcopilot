// DOCX report generation using `docx` package.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
} from "docx";

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

const FONT = "맑은 고딕";

function body(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, font: FONT });
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: AlignmentType; spacingAfter?: number } = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.spacingAfter ?? 80 },
    children: [body(text, { bold: opts.bold, size: opts.size })],
  });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function cell(text: string, width: number, opts: { header?: boolean } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: opts.header ? { fill: "E8EEF5", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.header, font: FONT, size: 18 })],
      }),
    ],
  });
}

export async function generateReportDOCX(report: ReportJson, fileName: string): Promise<Blob> {
  const s = report.summary;

  // Summary 2-column table
  const summaryWidth = 9000;
  const sumLabelW = 3000;
  const sumValW = 6000;
  const summaryTable = new Table({
    width: { size: summaryWidth, type: WidthType.DXA },
    columnWidths: [sumLabelW, sumValW],
    rows: [
      ["검토 문장 수", `${s.total_sentences}건`],
      ["적정 / 개선필요", `${s.ok_count}건 / ${s.issue_count}건`],
      ["심각도 분포", `상 ${s.severity_dist.상} / 중 ${s.severity_dist.중} / 하 ${s.severity_dist.하}`],
    ].map(
      ([k, v]) =>
        new TableRow({
          children: [cell(k, sumLabelW, { header: true }), cell(v, sumValW)],
        }),
    ),
  });

  // Findings 5-column table
  const findingsWidth = 9000;
  const colW = [700, 900, 1900, 2700, 2800]; // sums = 9000
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell("번호", colW[0], { header: true }),
      cell("심각도", colW[1], { header: true }),
      cell("관련근거", colW[2], { header: true }),
      cell("발췌내용", colW[3], { header: true }),
      cell("개선의견", colW[4], { header: true }),
    ],
  });
  const findingRows =
    report.findings.length === 0
      ? [
          new TableRow({
            children: [
              new TableCell({
                width: { size: findingsWidth, type: WidthType.DXA },
                borders,
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({ children: [body("지적사항이 없습니다.")] })],
                columnSpan: 5,
              }),
            ],
          }),
        ]
      : report.findings.map(
          (f) =>
            new TableRow({
              children: [
                cell(String(f.no), colW[0]),
                cell(f.severity, colW[1]),
                cell(f.related_ref || "-", colW[2]),
                cell(f.excerpt, colW[3]),
                cell(f.improvement || "-", colW[4]),
              ],
            }),
        );

  const findingsTable = new Table({
    width: { size: findingsWidth, type: WidthType.DXA },
    columnWidths: colW,
    rows: [headerRow, ...findingRows],
  });

  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 }, // 25mm
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [new TextRun({ text: "일상감사 결과 (초안)", bold: true, font: FONT, size: 32 })],
          }),

          p(`1. 감사대상 문서: ${fileName}`),
          p(`2. 감사일자: ${report.audit_date}`),
          p(`3. 감사자: ${report.auditor_name}`, { spacingAfter: 200 }),

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 120, after: 120 },
            children: [new TextRun({ text: "4. 감사 결과 요약", bold: true, font: FONT, size: 26 })],
          }),
          summaryTable,

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: "5. 세부 지적사항", bold: true, font: FONT, size: 26 })],
          }),
          findingsTable,

          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: "6. 종합 의견", bold: true, font: FONT, size: 26 })],
          }),
          p(report.overall_comment),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
