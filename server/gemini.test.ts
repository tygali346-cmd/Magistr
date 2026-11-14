import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdkMocks = vi.hoisted(() => ({
  upload: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  generateContent: vi.fn(),
  ctorCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@google/genai", () => {
  class MockGoogleGenAI {
    files = {
      upload: sdkMocks.upload,
      get: sdkMocks.get,
      delete: sdkMocks.delete,
    };
    models = {
      generateContent: sdkMocks.generateContent,
    };

    constructor(options: Record<string, unknown>) {
      sdkMocks.ctorCalls.push(options);
    }
  }

  return {
    GoogleGenAI: MockGoogleGenAI,
    createPartFromUri: (uri: string, mimeType: string) => ({
      fileData: { fileUri: uri, mimeType },
    }),
  };
});

import { extractPdfWithGemini, geminiResponseTextForTest, GEMINI_STANDARD_MODEL } from "./gemini";

beforeEach(() => {
  sdkMocks.upload.mockReset();
  sdkMocks.get.mockReset();
  sdkMocks.delete.mockReset();
  sdkMocks.generateContent.mockReset();
  sdkMocks.ctorCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gemini SDK response parsing", () => {
  it("reads and trims response.text", () => {
    expect(geminiResponseTextForTest({ text: '  {"ok":true}  ' })).toBe('{"ok":true}');
  });

  it("returns empty string when response.text is missing", () => {
    expect(geminiResponseTextForTest({ text: undefined })).toBe("");
    expect(geminiResponseTextForTest(null)).toBe("");
  });
});

describe("Gemini temporary PDF lifecycle via @google/genai", () => {
  it("configures User-Agent aistudio-build, uses gemini-4-hydrogen, and deletes temporary PDF after extraction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    sdkMocks.upload.mockResolvedValueOnce({
      name: "files/test-file",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file",
      mimeType: "application/pdf",
      state: "ACTIVE",
    });
    sdkMocks.generateContent.mockResolvedValueOnce({
      text: '{"questions":[]}',
    });
    sdkMocks.delete.mockResolvedValueOnce({});

    const result = await extractPdfWithGemini(Buffer.from("%PDF-test"), "test.pdf", "prompt", { type: "object" });

    expect(result).toBe('{"questions":[]}');
    expect(sdkMocks.ctorCalls[0]).toMatchObject({
      apiKey: "test-only-key",
      httpOptions: {
        headers: { "User-Agent": "aistudio-build" },
      },
    });
    expect(sdkMocks.generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: GEMINI_STANDARD_MODEL,
        config: expect.objectContaining({
          responseMimeType: "application/json",
          responseJsonSchema: { type: "object" },
        }),
      }),
    );
    expect(sdkMocks.delete).toHaveBeenCalledTimes(1);
    expect(sdkMocks.delete).toHaveBeenCalledWith({ name: "files/test-file" });
  });

  it("retries cleanup and fails the import if provider deletion is not confirmed", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    sdkMocks.upload.mockResolvedValueOnce({
      name: "files/test-file",
      uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file",
      mimeType: "application/pdf",
      state: "ACTIVE",
    });
    sdkMocks.generateContent.mockResolvedValueOnce({
      text: '{"questions":[]}',
    });
    const serverError = Object.assign(new Error("Internal error"), { status: 500 });
    sdkMocks.delete.mockRejectedValueOnce(serverError).mockRejectedValueOnce(serverError);

    await expect(extractPdfWithGemini(Buffer.from("%PDF-test"), "test.pdf", "prompt", {}))
      .rejects.toThrow("Gemini müvəqqəti PDF-ni silmə əməliyyatı təsdiqlənmədi (HTTP 500); emal dayandırıldı.");
    expect(sdkMocks.delete).toHaveBeenCalledTimes(2);
  });
});
