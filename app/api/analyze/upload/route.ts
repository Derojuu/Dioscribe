const geminiUploadUrl =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

// POST { fileName, fileSize, mimeType }
// Returns { uploadUrl } — the client uses this to upload directly to Gemini
export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return json(
      { error: "Missing GEMINI_API_KEY or GOOGLE_API_KEY." },
      { status: 500 },
    );
  }

  let body: { fileName?: string; fileSize?: number; mimeType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid request body." }, { status: 400 });
  }

  const { fileName, fileSize, mimeType } = body;
  if (!fileName || !fileSize || !mimeType) {
    return json({ error: "fileName, fileSize, and mimeType are required." }, { status: 400 });
  }

  const startResponse = await fetch(`${geminiUploadUrl}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(fileSize),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: fileName } }),
  });

  if (!startResponse.ok) {
    let message = "Gemini did not return an upload URL.";
    try {
      const err = (await startResponse.json()) as { error?: { message?: string } };
      message = err.error?.message ?? message;
    } catch { /* ignore */ }
    return json({ error: message }, { status: 502 });
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    return json({ error: "Gemini did not return an upload URL." }, { status: 502 });
  }

  return json({ uploadUrl });
}
