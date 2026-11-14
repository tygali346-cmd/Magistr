import { createGeminiClient } from "../gemini";
import { ENV } from "./env";

const GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe";

export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

export async function transcribeAudio(
  options: TranscribeOptions,
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    if (!ENV.geminiApiKey.trim()) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "GEMINI_API_KEY is not set",
      };
    }

    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return {
          error: "Failed to download audio file",
          code: "INVALID_FORMAT",
          details: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type") || "audio/mpeg";

      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 16) {
        return {
          error: "Audio file exceeds maximum size limit",
          code: "FILE_TOO_LARGE",
          details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`,
        };
      }
    } catch (error) {
      return {
        error: "Failed to fetch audio file",
        code: "SERVICE_ERROR",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }

    const prompt = options.prompt || (
      options.language
        ? `Transcribe the audio verbatim in ${options.language}. Return only the transcription text.`
        : "Transcribe the audio verbatim. Return only the transcription text."
    );

    const ai = createGeminiClient();
    const result = await ai.models.generateContent({
      model: GEMINI_TRANSCRIBE_MODEL,
      contents: [
        {
          inlineData: {
            mimeType,
            data: audioBuffer.toString("base64"),
          },
        },
        prompt,
      ],
    });

    const text = (result.text ?? "").trim();
    if (!text) {
      return {
        error: "Invalid transcription response",
        code: "TRANSCRIPTION_FAILED",
        details: "Gemini returned empty transcription output",
      };
    }

    return {
      task: "transcribe",
      language: options.language || "auto",
      duration: 0,
      text,
      segments: [],
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "TRANSCRIPTION_FAILED",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
