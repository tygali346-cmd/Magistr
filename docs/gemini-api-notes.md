# Gemini API integration notes

Research checked 2026-11-13 against Google's official documentation. The application will call Gemini only from its server, using the `GEMINI_API_KEY` environment variable; the key must never enter browser code, logs, source control, or client responses. The selected model is `gemini-3.8-flash`, which supports PDF/document input and structured JSON responses. PDF upload should use Google's Files API so the model receives a `document` reference rather than a public URL; delete the Gemini-side temporary file in a `finally` block after processing. Keep the original exam PDF in Manus storage.

For the Interactions API, a structured response uses `response_format: {type: "text", mime_type: "application/json", schema: ...}`. Gemini structured output supports JSON Schema `type` values including `string`, `number`, `integer`, `boolean`, `object`, `array`, and `null`; nullable properties may use a `type` array such as `["integer", "null"]`. The API supports a JSON Schema subset, so validate the model response again with the existing Zod schema and handle provider errors without exposing the API key.

Official references:
- Models: https://ai.google.dev/gemini-api/docs/models
- Gemini 3.8 Flash model: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- PDF/document processing: https://ai.google.dev/gemini-api/docs/document-processing
- File API: https://ai.google.dev/gemini-api/docs/files
- File input methods: https://ai.google.dev/gemini-api/docs/file-input-methods
- Structured outputs and JSON Schema subset: https://ai.google.dev/gemini-api/docs/structured-output/
- API key guidance: https://ai.google.dev/gemini-api/docs/api-key
- JavaScript quickstart: https://ai.google.dev/gemini-api/docs/quickstart
