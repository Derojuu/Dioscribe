const geminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
const geminiUploadUrl = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const maxFileSize = 20 * 1024 * 1024;
const transcriptionModel = "gemini-2.5-flash";
const reportModel = "gemini-2.5-flash";

type AudioReport = {
  title: string;
  summary: string;
  language: string;
  durationSeconds: number;
  speakers: Array<{ label: string; detail: string }>;
  soundscape: Array<{ label: string; detail: string }>;
  events: Array<{
    start: number;
    end: number;
    heading: string;
    detail: string;
  }>;
  themes: string[];
  notableQuotes: string[];
  safetyFlags: string[];
  confidenceNotes: string[];
};

type UploadedFile = {
  name: string;
  uri: string;
  mimeType: string;
  state?: {
    name?: string;
  };
};

type GenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
  };
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function createReportSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      language: { type: "string" },
      durationSeconds: { type: "number" },
      speakers: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            detail: { type: "string" },
          },
          required: ["label", "detail"],
        },
      },
      soundscape: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            detail: { type: "string" },
          },
          required: ["label", "detail"],
        },
      },
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            start: { type: "number" },
            end: { type: "number" },
            heading: { type: "string" },
            detail: { type: "string" },
          },
          required: ["start", "end", "heading", "detail"],
        },
      },
      themes: {
        type: "array",
        items: { type: "string" },
      },
      notableQuotes: {
        type: "array",
        items: { type: "string" },
      },
      safetyFlags: {
        type: "array",
        items: { type: "string" },
      },
      confidenceNotes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "title",
      "summary",
      "language",
      "durationSeconds",
      "speakers",
      "soundscape",
      "events",
      "themes",
      "notableQuotes",
      "safetyFlags",
      "confidenceNotes",
    ],
  };
}

async function readGeminiError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };

    return payload.error?.message ?? "Gemini request failed.";
  } catch {
    return "Gemini request failed.";
  }
}

function extractText(payload: GenerateContentResponse) {
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (text) {
    return text;
  }

  const blockReason = payload.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked this request: ${blockReason}.`);
  }

  const finishReason = payload.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error(`Gemini stopped early with reason: ${finishReason}.`);
  }

  throw new Error("Gemini returned an empty response.");
}

async function uploadFile(file: File, apiKey: string) {
  const startResponse = await fetch(`${geminiUploadUrl}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": file.type || "application/octet-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: file.name,
      },
    }),
  });

  if (!startResponse.ok) {
    throw new Error(await readGeminiError(startResponse));
  }

  const uploadSessionUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadSessionUrl) {
    throw new Error("Gemini did not return an upload URL.");
  }

  const uploadResponse = await fetch(uploadSessionUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(await file.arrayBuffer()),
  });

  if (!uploadResponse.ok) {
    throw new Error(await readGeminiError(uploadResponse));
  }

  const payload = (await uploadResponse.json()) as { file?: UploadedFile };
  if (!payload.file?.uri || !payload.file?.name) {
    throw new Error("Gemini file upload completed without a usable file reference.");
  }

  return payload.file;
}

async function deleteUploadedFile(fileName: string, apiKey: string) {
  await fetch(`${geminiBaseUrl}/${fileName}?key=${apiKey}`, {
    method: "DELETE",
  });
}

async function generateTranscript(uploadedFile: UploadedFile, apiKey: string) {
  const response = await fetch(
    `${geminiBaseUrl}/models/${transcriptionModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  mime_type: uploadedFile.mimeType,
                  file_uri: uploadedFile.uri,
                },
              },
              {
                text: [
                  "Generate a transcript of the speech in this audio.",
                  "Preserve speaker changes when they are clear.",
                  "Add timestamps only when the timing is obvious from the audio.",
                  "If speech is unclear, mark the uncertainty plainly instead of guessing.",
                ].join(" "),
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readGeminiError(response));
  }

  return extractText((await response.json()) as GenerateContentResponse);
}

async function generateReport(
  uploadedFile: UploadedFile,
  transcript: string,
  fileName: string,
  apiKey: string,
) {
  const response = await fetch(
    `${geminiBaseUrl}/models/${reportModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  mime_type: uploadedFile.mimeType,
                  file_uri: uploadedFile.uri,
                },
              },
              {
                text: [
                  "Analyze this audio and return a structured listening brief.",
                  "Use the transcript below as a reference, but rely on the audio itself for soundscape, speaker separation, pacing, and atmosphere.",
                  "Do not invent facts that are unsupported by the audio or transcript.",
                  "If there is only one speaker, still include one speakers entry.",
                  "If there are no immediate concerns, set safetyFlags to ['No immediate concerns detected.'].",
                  `File name: ${fileName}`,
                  `Transcript:\n${transcript}`,
                ].join("\n\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: createReportSchema(),
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readGeminiError(response));
  }

  const text = extractText((await response.json()) as GenerateContentResponse);
  return JSON.parse(text) as AudioReport;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return json(
      {
        error:
          "Missing GEMINI_API_KEY or GOOGLE_API_KEY. Add one to .env.local before using the app.",
      },
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
      {
        error:
          "This file is larger than 20 MB. Gemini audio requests need the upload kept under that limit here.",
      },
      { status: 400 },
    );
  }

  let uploadedFile: UploadedFile | null = null;

  try {
    uploadedFile = await uploadFile(file, apiKey);
    const transcript = await generateTranscript(uploadedFile, apiKey);
    const report = await generateReport(uploadedFile, transcript, file.name, apiKey);

    return json({
      transcript,
      report,
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The server could not analyze this audio.",
      },
      { status: 500 },
    );
  } finally {
    if (uploadedFile?.name) {
      void deleteUploadedFile(uploadedFile.name, apiKey);
    }
  }
}
