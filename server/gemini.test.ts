import { afterEach, describe, expect, it, vi } from "vitest";
import { extractPdfWithGemini, geminiResponseTextForTest } from "./gemini";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Gemini interaction response parsing", () => {
  it("reads the latest model-output text step", () => {
    expect(geminiResponseTextForTest({ steps: [
      { type: "user_input", content: [{ type: "text", text: "prompt" }] },
      { type: "model_output", content: [{ type: "text", text: "{\"ok\":true}" }] },
    ] })).toBe('{"ok":true}');
  });

  it("prefers the documented output_text field when present", () => {
    expect(geminiResponseTextForTest({ output_text: "  {\"ok\":true}  " })).toBe('{"ok":true}');
  });

  it("returns empty text when the provider has no text content", () => {
    expect(geminiResponseTextForTest({ steps: [{ type: "model_output", content: [{ type: "image" }] }] })).toBe("");
  });
});

describe("Gemini temporary PDF lifecycle", () => {
  const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

  it("deletes the uploaded provider file after successful extraction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/test-session" },
      }))
      .mockResolvedValueOnce(jsonResponse({ file: { name: "files/test-file", uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file" } }))
      .mockResolvedValueOnce(jsonResponse({ output_text: "{\"questions\":[]}" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await extractPdfWithGemini(Buffer.from("%PDF-test"), "test.pdf", "prompt", {});

    expect(result).toBe('{"questions":[]}');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe("DELETE");
  });

  it("retries cleanup and fails the import if provider deletion is not confirmed", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/upload/test-session" },
      }))
      .mockResolvedValueOnce(jsonResponse({ file: { name: "files/test-file", uri: "https://generativelanguage.googleapis.com/v1beta/files/test-file" } }))
      .mockResolvedValueOnce(jsonResponse({ output_text: "{\"questions\":[]}" }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(extractPdfWithGemini(Buffer.from("%PDF-test"), "test.pdf", "prompt", {}))
      .rejects.toThrow("Gemini müvəqqəti PDF-ni silmə əməliyyatı təsdiqlənmədi (HTTP 500); emal dayandırıldı.");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.slice(3).every(([, init]) => init?.method === "DELETE")).toBe(true);
  });
});
