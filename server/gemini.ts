import { ENV } from "./_core/env";

const GEMINI_MODEL = "gemini-3.8-flash";
const GOOGLE_API = "https://generativelanguage.googleapis.com";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

type GeminiFile = { name: string; uri: string };
type GeminiResponse = {
  error?: { message?: string };
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const body = payload as GeminiResponse;
  if (typeof body.output_text === "string") return body.output_text.trim();
  const steps = Array.isArray(body.steps) ? body.steps : [];
  const modelOutput = [...steps].reverse().find(step => step.type === "model_output") ?? steps.at(-1);
  return (modelOutput?.content ?? []).filter(part => typeof part.text === "string").map(part => part.text!.trim()).filter(Boolean).join("\n");
}

async function getProviderError(response: Response, action: string): Promise<Error> {
  let detail = "";
  try {
    const body = await response.json() as { error?: { message?: string } };
    detail = body.error?.message?.trim() ?? "";
  } catch {
    // Do not include raw provider bodies in errors or logs.
  }
  return new Error(`${action} alınmadı (${response.status})${detail ? `: ${detail.slice(0, 500)}` : "."}`);
}

async function uploadTemporaryPdf(bytes: Buffer, filename: string, apiKey: string): Promise<GeminiFile> {
  const start = await fetch(`${GOOGLE_API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: filename.replace(/[\r\n]/g, " ").slice(0, 180) } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!start.ok) throw await getProviderError(start, "Gemini-yə PDF ötürülməsi");

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini Files API yükləmə ünvanı qaytarmadı.");
  let parsedUploadUrl: URL;
  try {
    parsedUploadUrl = new URL(uploadUrl);
  } catch {
    throw new Error("Gemini Files API etibarlı yükləmə ünvanı qaytarmadı.");
  }
  if (parsedUploadUrl.protocol !== "https:" || parsedUploadUrl.hostname !== "generativelanguage.googleapis.com") {
    throw new Error("Gemini Files API yükləmə ünvanı gözlənilən host-a aid deyil.");
  }

  const uploaded = await fetch(parsedUploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!uploaded.ok) throw await getProviderError(uploaded, "Gemini Files API-yə fayl yüklənməsi");

  const result = await uploaded.json() as { file?: { name?: string; uri?: string } };
  const file = result.file;
  if (!file?.name || !file.uri || !/^files\/[A-Za-z0-9_-]+$/.test(file.name)) {
    throw new Error("Gemini Files API fayl identifikatorını qaytarmadı.");
  }
  return { name: file.name, uri: file.uri };
}

async function deleteTemporaryPdf(fileName: string, apiKey: string): Promise<void> {
  if (!/^files\/[A-Za-z0-9_-]+$/.test(fileName)) {
    throw new Error("Gemini müvəqqəti PDF identifikatorı etibarsızdır; emal dayandırıldı.");
  }

  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`${GOOGLE_API}/v1beta/${fileName}`, {
        method: "DELETE",
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok || response.status === 404) return;
      lastStatus = response.status;
    } catch {
      lastStatus = null;
    }

    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
  }

  const status = lastStatus === null ? "" : ` (HTTP ${lastStatus})`;
  throw new Error(`Gemini müvəqqəti PDF-ni silmə əməliyyatı təsdiqlənmədi${status}; emal dayandırıldı.`);
}

export async function extractPdfWithGemini(
  pdfBytes: Buffer,
  filename: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<string> {
  const apiKey = ENV.geminiApiKey.trim();
  if (!apiKey) throw new Error("Gemini API açarı konfiqurasiya edilməyib. Qorunan GEMINI_API_KEY dəyərini əlavə edin.");
  if (!pdfBytes.byteLength) throw new Error("Gemini-yə ötürüləcək PDF boşdur.");

  let uploadedFile: GeminiFile | null = null;
  try {
    uploadedFile = await uploadTemporaryPdf(pdfBytes, filename, apiKey);
    const interaction = await fetch(`${GOOGLE_API}/v1beta/interactions`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        input: [
          { type: "document", uri: uploadedFile.uri, mime_type: "application/pdf" },
          { type: "text", text: prompt },
        ],
        response_format: { type: "text", mime_type: "application/json", schema },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!interaction.ok) throw await getProviderError(interaction, "Gemini PDF təhlili");
    const output = responseText(await interaction.json());
    if (!output) throw new Error("Gemini PDF təhlili üçün strukturlaşdırılmış cavab qaytarmadı.");
    return output;
  } finally {
    if (uploadedFile) await deleteTemporaryPdf(uploadedFile.name, apiKey);
  }
}

export const geminiResponseTextForTest = responseText;
