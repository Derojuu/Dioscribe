"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";

type AudioReport = {
  title: string;
  topic: string;
  preparedDate: string;
  language: string;
  durationSeconds: number;
  preamble: string;
  termsOfReference: string[];
  chairpersonOpeningRemarks: string;
  participants: Array<{ name: string; roleOrContext: string }>;
  submissions: string[];
  observations: string[];
  recommendations: string[];
  notableQuotes: string[];
  confidenceNotes: string[];
};

type AnalysisResponse = {
  transcript: string;
  report: AudioReport;
};

const LAST_RESULT_STORAGE_KEY = "dioscribe:lastAnalysis:v1";

function loadLastResult(): AnalysisResponse | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AnalysisResponse>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.transcript !== "string") return null;
    const report = (parsed.report ?? {}) as Partial<AudioReport>;

    const normalized: AnalysisResponse = {
      transcript: parsed.transcript,
      report: {
        title: report.title ?? "Audio Report",
        topic: report.topic ?? "",
        preparedDate: report.preparedDate ?? new Date().toISOString().slice(0, 10),
        language: report.language ?? "Unknown",
        durationSeconds: report.durationSeconds ?? 0,
        preamble: report.preamble ?? (report as any).meetingContext ?? "",
        termsOfReference: report.termsOfReference ?? [],
        chairpersonOpeningRemarks: report.chairpersonOpeningRemarks ?? "",
        participants: report.participants ?? [],
        submissions: report.submissions ?? [],
        observations: report.observations ?? ((report as any).keyPoints ?? []),
        recommendations: report.recommendations ?? ((report as any).nextSteps ?? []),
        notableQuotes: report.notableQuotes ?? [],
        confidenceNotes: report.confidenceNotes ?? [],
      },
    };

    return normalized;
  } catch {
    return null;
  }
}

function saveLastResult(result: AnalysisResponse | null) {
  try {
    if (!result) {
      localStorage.removeItem(LAST_RESULT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(LAST_RESULT_STORAGE_KEY, JSON.stringify(result));
  } catch {
    // If storage is full/blocked, we silently skip persistence.
  }
}

const allowedTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "audio/mpeg3",
];

const maxFileSize = 80 * 1024 * 1024;
const waveformBars = [16, 28, 20, 34, 22, 40, 24, 36, 18, 30, 22, 26, 20, 32];

function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "Unknown";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600 shadow-sm">
      {children}
    </span>
  );
}

function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {eyebrow}
      </p>
      <h3 className="text-xl font-semibold text-slate-950">{title}</h3>
    </div>
  );
}

function buildReportText(result: AnalysisResponse): string {
  const { report, transcript } = result;
  const lines: string[] = [];
  const preparedDate = report.preparedDate || new Date().toISOString().slice(0, 10);

  lines.push(report.title);
  lines.push(`Prepared: ${preparedDate}`);
  lines.push(
    `Duration: ${formatSeconds(report.durationSeconds)}   Language: ${report.language}`,
  );
  lines.push("");
  lines.push("");

  lines.push("EXECUTIVE SUMMARY");
  lines.push("");
  lines.push(`Topic: ${report.topic || "Not specified"}`);
  lines.push("");
  lines.push("PREAMBLE");
  lines.push("");
  lines.push(report.preamble);
  lines.push("");
  lines.push("");

  lines.push("TERMS OF REFERENCE");
  lines.push("");
  if (report.termsOfReference.length === 0) {
    lines.push("- Not specified.");
  } else {
    for (const item of report.termsOfReference) lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("");

  lines.push("CHAIRPERSON — OPENING REMARKS");
  lines.push("");
  lines.push(report.chairpersonOpeningRemarks || "Not specified.");
  lines.push("");
  lines.push("");

  lines.push("PARTICIPANTS");
  lines.push("");
  for (const p of report.participants) {
    lines.push(`${p.name} — ${p.roleOrContext}`);
  }
  lines.push("");
  lines.push("");

  lines.push("SUBMISSIONS");
  lines.push("");
  if (report.submissions.length === 0) {
    lines.push("- None recorded.");
  } else {
    for (const s of report.submissions) lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("");

  lines.push("OBSERVATIONS");
  lines.push("");
  if (report.observations.length === 0) lines.push("- None recorded.");
  else for (const o of report.observations) lines.push(`- ${o}`);
  lines.push("");
  lines.push("");

  lines.push("RECOMMENDATIONS");
  lines.push("");
  if (report.recommendations.length === 0) lines.push("- None recorded.");
  else for (const r of report.recommendations) lines.push(`- ${r}`);
  lines.push("");
  lines.push("");

  if (report.notableQuotes.length > 0) {
    lines.push("NOTABLE QUOTES");
    lines.push("");
    for (const q of report.notableQuotes) lines.push(`- "${q}"`);
    lines.push("");
    lines.push("");
  }

  lines.push("CONFIDENCE NOTES");
  lines.push("");
  for (const n of report.confidenceNotes) lines.push(`- ${n}`);
  lines.push("");
  lines.push("");

  lines.push("TRANSCRIPT");
  lines.push("");
  lines.push(transcript);

  return lines.join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reportPdfHtml(result: AnalysisResponse) {
  const r = result.report;

  const list = (items: string[]) =>
    items.length
      ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
      : `<p class="muted">None.</p>`;

  return `
<div class="page">
  <div class="top">
    <div class="title">${escapeHtml(r.title)}</div>
    <div class="chips">
      <span class="chip">${escapeHtml(r.language)}</span>
      <span class="chip">${escapeHtml(formatSeconds(r.durationSeconds))}</span>
      <span class="chip">${escapeHtml(r.preparedDate)}</span>
    </div>
    ${
      r.topic
        ? `<div class="lead"><strong>Topic:</strong> ${escapeHtml(r.topic)}</div>`
        : ""
    }
  </div>

  <div class="grid">
    <section class="panel">
      <div class="eyebrow">Overview</div>
      <div class="h">Preamble</div>
      <div class="p">${escapeHtml(r.preamble)}</div>
    </section>

    <section class="panel">
      <div class="eyebrow">Mandate</div>
      <div class="h">Terms of reference</div>
      ${list(r.termsOfReference)}
    </section>

    <section class="panel span2">
      <div class="eyebrow">Chairperson</div>
      <div class="h">Opening remarks</div>
      <div class="p">${escapeHtml(r.chairpersonOpeningRemarks || "Not specified.")}</div>
    </section>

    <section class="panel">
      <div class="eyebrow">People</div>
      <div class="h">Participants</div>
      ${list(r.participants.map((p) => `${p.name} — ${p.roleOrContext}`))}
    </section>

    <section class="panel">
      <div class="eyebrow">Submissions</div>
      <div class="h">Submissions</div>
      ${list(r.submissions)}
    </section>

    <section class="panel">
      <div class="eyebrow">Findings</div>
      <div class="h">Observations</div>
      ${list(r.observations)}
    </section>

    <section class="panel">
      <div class="eyebrow">Proposal</div>
      <div class="h">Recommendations</div>
      ${list(r.recommendations)}
    </section>

    ${
      r.notableQuotes.length
        ? `<section class="panel span2">
      <div class="eyebrow">Highlights</div>
      <div class="h">Notable quotes</div>
      ${list(r.notableQuotes.map((q) => `“${q}”`))}
    </section>`
        : ""
    }

    <section class="panel span2">
      <div class="eyebrow">Quality</div>
      <div class="h">Confidence notes</div>
      ${list(r.confidenceNotes)}
    </section>
  </div>
</div>`;
}

function transcriptPdfHtml(result: AnalysisResponse) {
  const r = result.report;
  return `
<div class="page">
  <div class="top">
    <div class="title">${escapeHtml(r.title)} — Transcript</div>
    <div class="chips">
      <span class="chip">${escapeHtml(r.language)}</span>
      <span class="chip">${escapeHtml(formatSeconds(r.durationSeconds))}</span>
      <span class="chip">${escapeHtml(r.preparedDate)}</span>
    </div>
  </div>
  <section class="panel">
    <div class="eyebrow">Full text</div>
    <div class="h">Transcript</div>
    <pre class="pre">${escapeHtml(result.transcript)}</pre>
  </section>
</div>`;
}

function openPdfExport(title: string, bodyHtml: string) {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #ffffff;
        --ink: #0f172a;
        --muted: #475569;
        --border: #e2e8f0;
        --chip: #f1f5f9;
        --sky: #0284c7;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f8fafc;
        color: var(--ink);
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif;
      }
      .page {
        max-width: 980px;
        margin: 28px auto;
        padding: 0 20px 28px;
      }
      .top { margin-bottom: 18px; }
      .title { font-size: 28px; font-weight: 750; letter-spacing: -0.02em; }
      .chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
      .chip {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: #fff;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #334155;
      }
      .lead {
        margin-top: 12px;
        font-size: 13.5px;
        line-height: 1.8;
        color: var(--muted);
        max-width: 860px;
      }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .panel {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 1px 1px rgba(15, 23, 42, 0.04);
      }
      .span2 { grid-column: span 2; }
      .eyebrow {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #64748b;
        font-weight: 600;
      }
      .h { margin-top: 6px; font-size: 18px; font-weight: 700; }
      .p { margin-top: 12px; font-size: 13.5px; line-height: 1.8; color: #334155; }
      ul { margin: 12px 0 0 18px; padding: 0; color: #334155; font-size: 13.5px; line-height: 1.8; }
      li { margin: 6px 0; }
      .muted { margin-top: 12px; color: #64748b; font-size: 13.5px; line-height: 1.8; }
      .cards { margin-top: 12px; display: grid; grid-template-columns: 1fr; gap: 10px; }
      .card { border: 1px solid var(--border); background: #f8fafc; border-radius: 14px; padding: 12px; }
      .cardTitle { font-weight: 700; color: #0f172a; margin-bottom: 4px; }
      .pre {
        margin-top: 12px;
        white-space: pre-wrap;
        word-wrap: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 12.5px;
        line-height: 1.7;
        color: #0f172a;
      }
      @media print {
        body { background: white; }
        .page { margin: 0; padding: 0; max-width: none; }
        .panel { box-shadow: none; }
      }
    </style>
  </head>
  <body>
    ${bodyHtml}
    <script>
      setTimeout(() => window.print(), 50);
    </script>
  </body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const w = window.open(url, "_blank");
  if (!w) {
    window.location.href = url;
    return;
  }

  const cleanup = () => URL.revokeObjectURL(url);
  w.addEventListener("beforeunload", cleanup, { once: true });
}

function CopyReportButton({ result }: { result: AnalysisResponse }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const text = buildReportText(result);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100"
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.25" />
            <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copy report
        </>
      )}
    </button>
  );
}

function buildDocxHtml(result: AnalysisResponse): string {
  const r = result.report;

  const h1 = (text: string) =>
    `<h1 style="font-family:Calibri,sans-serif;font-size:26pt;font-weight:bold;color:#000000;margin-bottom:4pt;margin-top:0;">${escapeHtml(text)}</h1>`;

  const h2 = (text: string) =>
    `<h2 style="font-family:Calibri,sans-serif;font-size:14pt;font-weight:bold;color:#000000;margin-top:18pt;margin-bottom:4pt;padding-bottom:3pt;">${escapeHtml(text)}</h2>`;

  const p = (text: string) =>
    `<p style="font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;color:#000000;margin:6pt 0;">${escapeHtml(text)}</p>`;

  const meta = (text: string) =>
    `<p style="font-family:Calibri,sans-serif;font-size:10pt;color:#000000;margin:2pt 0;">${escapeHtml(text)}</p>`;

  const li = (text: string) =>
    `<li style="font-family:Calibri,sans-serif;font-size:11pt;line-height:1.6;color:#000000;margin:4pt 0;">${escapeHtml(text)}</li>`;

  const ul = (items: string[]) =>
    items.length
      ? `<ul style="margin:6pt 0 6pt 18pt;padding:0;">${items.map(li).join("")}</ul>`
      : p("None.");

  const quote = (text: string) =>
    `<p style="font-family:Calibri,sans-serif;font-size:11pt;font-style:italic;color:#000000;margin:8pt 0;">&ldquo;${escapeHtml(text)}&rdquo;</p>`;

  const pre = (text: string) =>
    `<pre style="font-family:'Courier New',monospace;font-size:10pt;line-height:1.6;color:#000000;white-space:pre-wrap;word-wrap:break-word;margin:6pt 0;">${escapeHtml(text)}</pre>`;

  const sections: string[] = [];

  // Title block
  sections.push(h1(r.title));
  sections.push(meta(`Prepared: ${r.preparedDate || new Date().toISOString().slice(0, 10)}`));
  sections.push(meta(`Duration: ${formatSeconds(r.durationSeconds)}   |   Language: ${r.language}`));
  if (r.topic) sections.push(meta(`Topic: ${r.topic}`));

  // Preamble
  sections.push(h2("Preamble"));
  sections.push(p(r.preamble || "Not specified."));

  // Terms of reference
  sections.push(h2("Terms of Reference"));
  sections.push(ul(r.termsOfReference.length ? r.termsOfReference : ["Not specified."]));

  // Chairperson
  sections.push(h2("Chairperson — Opening Remarks"));
  sections.push(p(r.chairpersonOpeningRemarks || "Not specified."));

  // Participants
  sections.push(h2("Participants"));
  sections.push(ul(r.participants.map((p) => `${p.name} — ${p.roleOrContext}`)));

  // Submissions
  sections.push(h2("Submissions"));
  sections.push(ul(r.submissions.length ? r.submissions : ["None recorded."]));

  // Observations
  sections.push(h2("Observations"));
  sections.push(ul(r.observations.length ? r.observations : ["None recorded."]));

  // Recommendations
  sections.push(h2("Recommendations"));
  sections.push(ul(r.recommendations.length ? r.recommendations : ["None recorded."]));

  // Notable quotes
  if (r.notableQuotes.length) {
    sections.push(h2("Notable Quotes"));
    sections.push(r.notableQuotes.map(quote).join(""));
  }

  // Confidence notes
  if (r.confidenceNotes.length) {
    sections.push(h2("Confidence Notes"));
    sections.push(ul(r.confidenceNotes));
  }

  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8"/>
  <meta name=ProgId content=Word.Document>
  <meta name=Generator content="Microsoft Word 15">
  <meta name=Originator content="Microsoft Word 15">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { margin: 2.54cm; }
    body { font-family: Calibri, sans-serif; font-size: 11pt; color: #000000; }
  </style>
</head>
<body>
  <div style="max-width:700px;margin:0 auto;">
    ${sections.join("\n")}
  </div>
</body>
</html>`;
}

function downloadDocx(result: AnalysisResponse) {
  const title = result.report.title || "audio-report";
  const html = buildDocxHtml(result);
  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-report.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function ExportButtons({ result }: { result: AnalysisResponse }) {
  const handleExportReportPdf = useCallback(() => {
    const title = result.report.title || "audio-report";
    openPdfExport(`${title} — Report`, reportPdfHtml(result));
  }, [result]);

  const handleExportTranscriptPdf = useCallback(() => {
    const title = result.report.title || "audio-report";
    openPdfExport(`${title} — Transcript`, transcriptPdfHtml(result));
  }, [result]);

  const handleExportDocx = useCallback(() => {
    downloadDocx(result);
  }, [result]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyReportButton result={result} />
      <button
        type="button"
        onClick={handleExportReportPdf}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100"
      >
        Export Report PDF
      </button>
      <button
        type="button"
        onClick={handleExportTranscriptPdf}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100"
      >
        Export Transcript PDF
      </button>
      <button
        type="button"
        onClick={handleExportDocx}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-100 active:bg-blue-200"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
          <path d="M4 5h6M4 7.5h6M4 10h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
        </svg>
        Export Report DOCX
      </button>
    </div>
  );
}

function EmptyStatePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <SectionTitle
          eyebrow="What you get"
          title="Transcript → office-ready report."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            "Executive summary and context",
            "Key points, decisions, and action items",
            "Risks/concerns + recommended next steps",
            "Clean format you can copy or download",
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#0b1220_0%,#111b33_55%,#0b1220_100%)] px-6 py-6 text-white shadow-sm">
        <div className="space-y-5">
          <MiniLabel>Listening preview</MiniLabel>
          <div className="grid grid-cols-12 items-end gap-2">
            {waveformBars.map((height, index) => (
              <div
                key={`${height}-${index}`}
                className="rounded-sm bg-sky-400/90"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
          <p className="max-w-md text-sm leading-7 text-white/74">
            Upload a call, meeting, interview, or voice note. Get a structured report you can
            paste into email, docs, or share with your team.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-semibold">1</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Upload
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold">2</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Transcribe
            </p>
          </div>
          <div>
            <p className="text-3xl font-semibold">3</p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/56">
              Report
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"report" | "transcript">("report");
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);

  useEffect(() => {
    const stored = loadLastResult();
    if (stored) {
      setResult(stored);
      setRestoredFromStorage(true);
    }
  }, []);

  useEffect(() => {
    saveLastResult(result);
  }, [result]);

  const fileSummary = useMemo(() => {
    if (!file) {
      return "Upload one recording and get a transcript plus an office-style report.";
    }

    return `${file.name} - ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  }, [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setResult(null);
    setError("");
    setActiveTab("report");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (selectedFile.size > maxFileSize) {
      setFile(null);
      setError("This file is larger than 80 MB. Try a shorter clip or compress it first.");
      return;
    }

    if (selectedFile.type && !allowedTypes.includes(selectedFile.type)) {
      setFile(null);
      setError("Use MP3, MP4, M4A, WAV, MPEG, or WebM for the cleanest handoff.");
      return;
    }

    setFile(selectedFile);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setRestoredFromStorage(false);

    if (!file) {
      setError("Pick an audio file before running the report.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsSubmitting(true);
    setUploadStatus("Uploading and analysing...");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as AnalysisResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload
            ? (payload.error ?? "The analysis request failed.")
            : "The analysis request failed.",
        );
      }

      setResult(payload as AnalysisResponse);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Something went wrong while analyzing the audio.",
      );
    } finally {
      setIsSubmitting(false);
      setUploadStatus("");
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eff6ff_0%,#ffffff_44%,#f8fafc_100%)] text-slate-950">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-5 sm:px-10 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-600 text-white shadow-sm">
              <span className="text-sm font-semibold">DS</span>
            </div>
            <div>
              <p className="text-sm font-semibold leading-5">Dioscribe</p>
              <p className="text-xs text-slate-500">Audio → transcript → report</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MiniLabel>Office-ready</MiniLabel>
            <MiniLabel>Copy / Download</MiniLabel>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-8 sm:px-10 lg:grid-cols-[420px_1fr] lg:px-12 lg:py-10">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Upload audio
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Turn recordings into reports your team can read.
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">{fileSummary}</p>

            <form onSubmit={handleSubmit} className="mt-5">
              <label className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-sky-300 hover:bg-sky-50/40">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">Choose file</span>
                  <span className="text-xs text-slate-500">MP3, M4A, WAV, MP4</span>
                </div>
                <span className="text-xs leading-6 text-slate-500">
                  Max 80 MB. For longer recordings, trim or compress first.
                </span>
                <input
                  type="file"
                  accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*,video/mp4"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {error ? (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              ) : null}

              {restoredFromStorage ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <span>Restored your last report from this device.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setRestoredFromStorage(false);
                      saveLastResult(null);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear saved
                  </button>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!file || isSubmitting}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmitting ? (uploadStatus || "Generating report...") : "Transcribe & generate report"}
              </button>
            </form>

            <div className="mt-5 flex flex-wrap gap-2">
              <MiniLabel>Transcript</MiniLabel>
              <MiniLabel>Summary</MiniLabel>
              <MiniLabel>Decisions</MiniLabel>
              <MiniLabel>Action items</MiniLabel>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle eyebrow="Preview" title="What this will look like" />
            <div className="mt-4 grid grid-cols-12 items-end gap-2">
              {waveformBars.map((height, index) => (
                <div
                  key={`${height}-${index}`}
                  className="rounded-sm bg-sky-200"
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-600">
              You’ll get a formal report format (Topic, Preamble, Terms of Reference, Chairperson
              Opening Remarks, Submissions, Observations, Recommendations) plus the full transcript.
            </p>
          </div>
        </aside>

        <section className="space-y-4">
          {result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <MiniLabel>Report ready</MiniLabel>
                  <MiniLabel>{result.report.language}</MiniLabel>
                  <MiniLabel>{formatSeconds(result.report.durationSeconds)}</MiniLabel>
                  <MiniLabel>{result.report.preparedDate}</MiniLabel>
                </div>
                <ExportButtons result={result} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-3xl font-semibold tracking-tight">{result.report.title}</h2>
                {result.report.topic ? (
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Topic:{" "}
                    <span className="font-medium text-slate-700">{result.report.topic}</span>
                  </p>
                ) : null}

                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("report")}
                    className={
                      activeTab === "report"
                        ? "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                        : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    }
                  >
                    Report
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("transcript")}
                    className={
                      activeTab === "transcript"
                        ? "rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white"
                        : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    }
                  >
                    Transcript
                  </button>
                </div>
              </div>

              {activeTab === "report" ? (
                <div className="grid gap-6 xl:grid-cols-2">
                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="Preamble" title="Preamble of meeting" />
                    <p className="mt-5 text-sm leading-7 text-slate-700">
                      {result.report.preamble}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="Mandate" title="Terms of reference" />
                    <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                      {(result.report.termsOfReference.length
                        ? result.report.termsOfReference
                        : ["Not specified."]).map((t) => (
                        <li key={t}>- {t}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                    <SectionTitle
                      eyebrow="Chairperson"
                      title="Opening remarks"
                    />
                    <p className="mt-5 text-sm leading-7 text-slate-700">
                      {result.report.chairpersonOpeningRemarks || "Not specified."}
                    </p>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="People" title="Participants" />
                    <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
                      {result.report.participants.map((p) => (
                        <li key={`${p.name}-${p.roleOrContext}`}>
                          <span className="font-semibold text-slate-900">{p.name}</span>{" "}
                          <span className="text-slate-600">— {p.roleOrContext}</span>
                        </li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="Submissions" title="Submissions" />
                    <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                      {(result.report.submissions.length
                        ? result.report.submissions
                        : ["None recorded."]).map((s) => (
                        <li key={s}>- {s}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="Findings" title="Observations" />
                    <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                      {(result.report.observations.length
                        ? result.report.observations
                        : ["None recorded."]).map((o) => (
                        <li key={o}>- {o}</li>
                      ))}
                    </ul>
                  </article>

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <SectionTitle eyebrow="Proposal" title="Recommendations" />
                    <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                      {(result.report.recommendations.length
                        ? result.report.recommendations
                        : ["None recorded."]).map((r) => (
                        <li key={r}>- {r}</li>
                      ))}
                    </ul>
                  </article>

                  {result.report.notableQuotes.length ? (
                    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                      <SectionTitle eyebrow="Highlights" title="Notable quotes" />
                      <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                        {result.report.notableQuotes.map((q) => (
                          <li key={q}>&ldquo;{q}&rdquo;</li>
                        ))}
                      </ul>
                    </article>
                  ) : null}

                  <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                    <SectionTitle eyebrow="Quality" title="Confidence notes" />
                    <ul className="mt-5 space-y-2 text-sm leading-7 text-slate-700">
                      {result.report.confidenceNotes.map((n) => (
                        <li key={n}>- {n}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              ) : (
                <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <SectionTitle eyebrow="Full text" title="Transcript" />
                  <p className="mt-6 whitespace-pre-wrap text-sm leading-8 text-slate-700">
                    {result.transcript}
                  </p>
                </article>
              )}
            </>
          ) : (
            <EmptyStatePanel />
          )}
        </section>
      </section>
    </main>
  );
}
