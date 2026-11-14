import { createPartFromUri, GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { ENV } from "./_core/env";

export const GEMINI_STANDARD_MODEL = "gemini-4-hydrogen";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const FILE_NAME_PATTERN = /^files\/[A-Za-z0-9_-]+$/;

export function createGeminiClient(apiKeyInput?: string): GoogleGenAI {
  const apiKey = (apiKeyInput ?? ENV.geminiApiKey).trim();
  if (!apiKey) {
    throw new Error(
      "Gemini API açarı konfiqurasiya edilməyib. GEMINI_API_KEY dəyərini əlavə edin.",
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
      timeout: REQUEST_TIMEOUT_MS,
    },
  });
}

function responseText(response: Pick<GenerateContentResponse, "text"> | null | undefined): string {
  return typeof response?.text === "string" ? response.text.trim() : "";
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  return null;
}

function formatGeminiError(error: unknown, action: string): Error {
  const status = getErrorStatus(error);
  const detail = error instanceof Error ? error.message.trim() : "";
  const statusPart = status ? ` (${status})` : "";
  return new Error(
    `${action} alınmadı${statusPart}${detail ? `: ${detail.slice(0, 500)}` : "."}`,
  );
}

async function waitUntilFileActive(
  ai: GoogleGenAI,
  file: { name?: string; uri?: string; mimeType?: string; state?: string },
) {
  let current = file;
  for (let attempt = 0; attempt < 15 && current.state === "PROCESSING"; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!current.name) break;
    current = await ai.files.get({ name: current.name });
  }
  if (current.state === "FAILED") {
    throw new Error("Gemini yüklənmiş PDF faylını emal edə bilmədi.");
  }
  return current;
}

async function deleteTemporaryPdf(ai: GoogleGenAI, fileName: string): Promise<void> {
  if (!FILE_NAME_PATTERN.test(fileName)) {
    throw new Error("Gemini müvəqqəti PDF identifikatorı etibarsızdır; emal dayandırıldı.");
  }

  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await ai.files.delete({ name: fileName });
      return;
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 404) return;
      lastStatus = status;
    }

    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
  }

  const status = lastStatus === null ? "" : ` (HTTP ${lastStatus})`;
  throw new Error(
    `Gemini müvəqqəti PDF-ni silmə əməliyyatı təsdiqlənmədi${status}; emal dayandırıldı.`,
  );
}

export async function extractPdfWithGemini(
  pdfBytes: Buffer,
  filename: string,
  prompt: string,
  schema: Record<string, unknown>,
): Promise<string> {
  if (!pdfBytes.byteLength) {
    throw new Error("Gemini-yə ötürüləcək PDF boşdur.");
  }

  const ai = createGeminiClient();
  let uploadedFileName: string | null = null;

  try {
    let uploaded;
    try {
      uploaded = await ai.files.upload({
        file: new Blob([Uint8Array.from(pdfBytes)], { type: "application/pdf" }),
        config: {
          mimeType: "application/pdf",
          displayName: filename.replace(/[\r\n]/g, " ").slice(0, 180),
        },
      });
    } catch (error) {
      throw formatGeminiError(error, "Gemini-yə PDF ötürülməsi");
    }

    if (!uploaded?.name || !uploaded.uri || !FILE_NAME_PATTERN.test(uploaded.name)) {
      throw new Error("Gemini Files API fayl identifikatorını qaytarmadı.");
    }
    uploadedFileName = uploaded.name;

    const readyFile = await waitUntilFileActive(ai, uploaded);
    const fileUri = readyFile.uri || uploaded.uri;
    const fileMimeType = readyFile.mimeType || uploaded.mimeType || "application/pdf";

    let response: GenerateContentResponse;
    try {
      response = await ai.models.generateContent({
        model: GEMINI_STANDARD_MODEL,
        contents: [
          createPartFromUri(fileUri, fileMimeType),
          prompt,
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
        },
      });
    } catch (error) {
      throw formatGeminiError(error, "Gemini PDF təhlili");
    }

    const output = responseText(response);
    if (!output) {
      throw new Error("Gemini PDF təhlili üçün strukturlaşdırılmış cavab qaytarmadı.");
    }
    return output;
  } finally {
    if (uploadedFileName) {
      await deleteTemporaryPdf(ai, uploadedFileName);
    }
  }
}

export const geminiResponseTextForTest = responseText;
