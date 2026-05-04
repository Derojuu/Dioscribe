import https from "node:https";
import { IncomingMessage } from "node:http";

const geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
const geminiUploadUrl =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const maxFileSize = 80 * 1024 * 1024;
const transcriptionModel = "gemini-2.5-flash";
const reportModel = "gemini-2.5-flash";

type AudioReport = {
  title: string;
  topic: string;
  preparedDate: string;
  language: string;
  durationSeconds: number;
  preamble: string;
  termsOfReference: string[];
  chairpersonOpeningRemarks: string;
  submissions: string[];
  observations: string[];
  recommendations: string[];
  participants: Array<{ name: string; roleOrContext: string }>;
  notableQuotes: string[];
  confidenceNotes: string[];
};

type UploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
};

type GenerateContentResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

// ---------------------------------------------------------------------------
// Low-level HTTPS helper — bypasses Node's global fetch (and undici timeouts)
// ---------------------------------------------------------------------------

interface HttpsResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function httpsRequest(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: Buffer | Uint8Array | string;
  },
): Promise<HttpsResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers ?? {},
        // No timeout — let Gemini take as long as it needs
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", reject);
      },
    );

    req.on("error", reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function httpsJson<T>(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
): Promise<{ status: number; data: T; headers: Record<string, string | string[] | undefined> }> {
  const bodyBuf = options.body
    ? Buffer.from(JSON.stringify(options.body), "utf8")
    : undefined;

  const res = await httpsRequest(url, {
    method: options.method,
    headers: {
      ...(options.headers ?? {}),
      ...(bodyBuf ? { "Content-Type": "application/json", "Content-Length": String(bodyBuf.length) } : {}),
    },
    body: bodyBuf,
  });

  const text = res.body.toString("utf8").trim();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  return { status: res.status, data, headers: res.headers };
}

// ---------------------------------------------------------------------------

function createReportSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      topic: { type: "string" },
      preparedDate: { type: "string" },
      language: { type: "string" },
      durationSeconds: { type: "number" },
      preamble: { type: "string" },
      termsOfReference: { type: "array", items: { type: "string" } },
      chairpersonOpeningRemarks: { type: "string" },
      submissions: { type: "array", items: { type: "string" } },
      observations: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      participants: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            roleOrContext: { type: "string" },
          },
          required: ["name", "roleOrContext"],
        },
      },
      notableQuotes: { type: "array", items: { type: "string" } },
      confidenceNotes: { type: "array", items: { type: "string" } },
    },
    required: [
      "title", "topic", "preparedDate", "language", "durationSeconds",
      "preamble", "termsOfReference", "chairpersonOpeningRemarks",
      "submissions", "observations", "recommendations", "participants",
      "notableQuotes", "confidenceNotes",
    ],
  };
}

function geminiErrorMessage(data: unknown): string {
  const d = data as { error?: { message?: string } };
  return d?.error?.message ?? "Gemini request failed.";
}

function extractText(payload: GenerateContentResponse): string {
  const text = payload.candidates
    ?.flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();

  if (text) return text;

  const blockReason = payload.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`Gemini blocked this request: ${blockReason}.`);

  const finishReason = payload.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error(`Gemini stopped early: ${finishReason}.`);
  }

  throw new Error("Gemini returned an empty response.");
}

async function uploadFile(file: File, apiKey: string): Promise<UploadedFile> {
  // Step 1: Start resumable upload session
  const startRes = await httpsJson<unknown>(
    `${geminiUploadUrl}?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(file.size),
        "X-Goog-Upload-Header-Content-Type": file.type || "application/octet-stream",
      },
      body: { file: { display_name: file.name } },
    },
  );

  if (startRes.status >= 300) {
    throw new Error(geminiErrorMessage(startRes.data));
  }

  const uploadUrl = startRes.headers["x-goog-upload-url"] as string | undefined;
  if (!uploadUrl) throw new Error("Gemini did not return an upload URL.");

  // Step 2: Upload the file bytes
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const uploadRes = await httpsRequest(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(fileBuffer.length),
      "Content-Type": file.type || "application/octet-stream",
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: fileBuffer,
  });

  if (uploadRes.status >= 300) {
    const errData = JSON.parse(uploadRes.body.toString("utf8")) as unknown;
    throw new Error(geminiErrorMessage(errData));
  }

  const payload = JSON.parse(uploadRes.body.toString("utf8")) as { file?: UploadedFile };
  if (!payload.file?.uri || !payload.file?.name) {
    throw new Error("Gemini file upload completed without a usable file reference.");
  }

  return payload.file;
}

async function deleteUploadedFile(fileName: string, apiKey: string) {
  try {
    await httpsRequest(`${geminiBaseUrl}/${fileName}?key=${apiKey}`, { method: "DELETE" });
  } catch {
    // best effort
  }
}

async function waitForFileActive(fileName: string, apiKey: string): Promise<void> {
  const maxAttempts = 20;
  const delayMs = 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await httpsJson<{ state?: string }>(
      `${geminiBaseUrl}/${fileName}?key=${apiKey}`,
      { method: "GET" },
    );
    if (res.status >= 300) return; // best effort

    if (res.data.state === "ACTIVE") return;
    if (res.data.state === "FAILED") {
      throw new Error("Gemini rejected the uploaded file during processing.");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function generateTranscript(file: UploadedFile, apiKey: string): Promise<string> {
  const res = await httpsJson<GenerateContentResponse>(
    `${geminiBaseUrl}/models/${transcriptionModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      body: {
        contents: [{
          parts: [
            { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
            {
              text: [
                "Generate a transcript of the speech in this audio.",
                "Preserve speaker changes when they are clear.",
                "Add timestamps only when the timing is obvious from the audio.",
                "If speech is unclear, mark the uncertainty plainly instead of guessing.",
              ].join(" "),
            },
          ],
        }],
      },
    },
  );

  if (res.status >= 300) throw new Error(geminiErrorMessage(res.data));
  return extractText(res.data);
}

async function generateReport(
  file: UploadedFile,
  transcript: string,
  fileName: string,
  apiKey: string,
): Promise<AudioReport> {
  const res = await httpsJson<GenerateContentResponse>(
    `${geminiBaseUrl}/models/${reportModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      body: {
        contents: [{
          parts: [
            { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
            {
              text: [
                "You are a professional secretary/rapporteur writing a formal meeting-style report from an audio recording.",
                "The format must be consistent and general-purpose.",
                "Write in clear, professional English that can be shared with colleagues.",
                "",
                "Rules:",
                "- title: A clear, descriptive report title.",
                "- topic: Short topic line (what the meeting/audio is broadly about).",
                "- preparedDate: Use ISO date format YYYY-MM-DD.",
                "- language: The spoken language (best effort).",
                "- durationSeconds: Duration in seconds as a number (best effort).",
                "- preamble: 3–8 sentences describing the meeting/audio background, purpose, and scope.",
                "- termsOfReference: Bullet list of what this report covers / mandate / scope.",
                "- chairpersonOpeningRemarks: 2–6 sentences capturing opening remarks.",
                "- participants: Identify participants when possible. If names are not clear, use labels like 'Speaker 1'.",
                "- submissions: Bullet list of key submissions/inputs made by parties. If none, return [].",
                "- observations: Bullet list of factual observations from the discussion. If none, return [].",
                "- recommendations: Bullet list of recommendations grounded in what was discussed.",
                "- notableQuotes: Exact or near-exact quotes that matter. If none, return [].",
                "- confidenceNotes: Caveats about audio quality or unclear speech. If none, include ['No major transcription concerns noted.'].",
                "",
                "Do not invent facts not supported by the audio or transcript.",
                `File name: ${fileName}`,
                `Transcript:\n${transcript}`,
              ].join("\n"),
            },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: createReportSchema(),
        },
      },
    },
  );

  if (res.status >= 300) throw new Error(geminiErrorMessage(res.data));
  const text = extractText(res.data);
  return JSON.parse(text) as AudioReport;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return json(
      { error: "Missing GEMINI_API_KEY or GOOGLE_API_KEY. Add one to .env.local." },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return json({ error: "No audio file was provided." }, { status: 400 });
  }

  if (file.size > maxFileSize) {
    return json(
      { error: "This file is larger than 80 MB. Try a shorter clip or compress it first." },
      { status: 400 },
    );
  }

  let uploadedFile: UploadedFile | null = null;

  try {
    uploadedFile = await uploadFile(file, apiKey);
    await waitForFileActive(uploadedFile.name, apiKey);
    const transcript = await generateTranscript(uploadedFile, apiKey);
    const report = await generateReport(uploadedFile, transcript, file.name, apiKey);
    return json({ transcript, report });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The server could not analyze this audio.";
    console.error("[analyze] error:", error);
    return json({ error: message }, { status: 500 });
  } finally {
    if (uploadedFile?.name) {
      void deleteUploadedFile(uploadedFile.name, apiKey);
    }
  }
}
