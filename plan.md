# QəbulFit — Implementation Plan

## Product and technical approach

QəbulFit is an Azerbaijani-language, responsive entrance-exam study platform. It uses the initialized Manus Web stack: React and TypeScript in `client/`, Express and tRPC on the server, Drizzle with managed MySQL for durable records, and Manus object storage for original PDF files. The application stays in Preview; publication was not requested.

The supplied `2010-11.pdf` contributes exactly 50 Informatics questions: 25 from 2010 and 25 from 2011. The approved per-question review workflow supplied the initial transcription and primary-topic decisions; the resulting records are in `data/seed-2010-11.ts` and are loaded idempotently. Logic is fully provisioned with its topic catalog but has no questions from this PDF. Four seed records remain in the review queue: three unapproved subtopic suggestions and one unclear printed word. No answer key is asserted because this PDF provides no trusted key.

## Subjects and fixed topic catalog

Informatics has exactly the 18 supplied topics, with the original numbers and names preserved: 1. “İnformatika və Onun Əsas Anlayışları”; 2. “Say Sistemləri”; 3. “EHM (Hardware)”; 4. “Kompüterin Texniki Təminatı”; 5. “Alqoritm (Brainware)”; 6. “Proqram Təminatı (Software)”; 7. “Əməliyyat Sistemləri”; 8. “Windows 11”; 9. “MS Word 2019”; 10. “MS Excel 2019”; 11. “MS PowerPoint 2019”; 12. “Verilənlər Bazası (VBİS)”; 13. “MS Access 2019”; 14. “Kompüter Qrafikası”; 15. “Kompüter Şəbəkələri”; 16. “İnternet Qlobal Şəbəkələri”; 17. “Elektron Hökumət”; 18. “İnformasiya Təhlükəsizliyi”.

Logic has exactly these 20 main topics: 1. “Şifrələr”; 2. “Riyazi Əməllər”; 3. “Şəklin Analizi”; 4. “Əməllər (Qeyri-Aşkar Operatorlar)”; 5. “Şəkil Münasibətləri”; 6. “Ardıcıllıqlar”, with “6.1. Sıralar” as its child subtopic; 7. “Şəkil Ardıcıllıqları”; 8. “Mətnin Məntiqi Təhlili”; 9. “Rebus”; 10. “Şəkil Cədvəlləri”; 11. “Cədvəllər”; 12. “Analogiya-Anagram”; 13. “Hesab Əməlləri”; 14. “Tərəzilər”; 15. “Sahə-Perimetr”; 16. “Müstəvi Təsəvvür”; 17. “Cədvəl-Qrafik-Diaqram”; 18. “Fəza Fiqurları”; 19. “Tənqidi Mühakimə Məsələləri”; 20. “Riyazi Məsələlər”. Model-exam sections 21–24 are excluded. Unapproved subtopic suggestions are retained as review notes rather than added to the fixed taxonomy.

## Question records and PDF workflow

The database stores subjects and topics, exam-file metadata, question text, answer options, optional formula/table/media descriptions, year and question number, source-page locator, classification confidence and reason, review notes/status, trusted answer plus its provenance (only if later verified), and deduplication fingerprints. The original prompt is retained; OCR suggestions are stored separately. Each seeded question links to the original PDF, and source links can open the recorded PDF page. The original file remains in object storage so readers can compare extracted text and media with the printed page. In the supplied paper, the extracted media is a formula and structured tables; the page-level source is retained for exact visual inspection.

For future uploads, the upload screen accepts one or several PDFs, offers year entry (or filename-based year inference) and an optional expected question count, stores the original PDF, checks duplicate file hashes, then starts AI extraction only after an authenticated admin requests it. The server sends the stored PDF to Google Gemini 3.8 Flash through Google's temporary Files API, requests OCR and structured extraction using a strict JSON schema and the fixed topic catalog, and deletes the Gemini-side temporary file after processing. The external Gemini API key remains server-side and is not exposed to browsers. The separate PDF.js rendering pipeline is not used. Original wording and any correction suggestion are separate. A supplied year hint is checked against model-assigned years; mismatches are flagged and a single explicit file year takes precedence. Zero-question extraction fails rather than appearing successful. A returned completeness assessment, optional expected-count mismatch, suspected omissions, non-contiguous question numbering, ambiguous years/numbers, unsupported classifications, low confidence (below 0.75), duplicate content, missing options, and model uncertainty keep affected records in review rather than being silently dropped. Failed extraction can be retried from the archive without uploading the same PDF again. Question fingerprints and source fingerprints prevent re-import from duplicating or overwriting existing edits. The upload UI notes that AI imports use project credits and that PDF contents are sent to Google for analysis.

The classifier uses the stable `gemini-3.8-flash` model with PDF vision and structured JSON support. It selects one primary subject/topic according to the knowledge tested, not keywords alone, validates the response server-side, and never solves a question or invents a key. A source-backed review form permits corrections, fixed-catalog topic changes, and answer-key entry only when a reliable source is supplied. Correct-option and source fields are redacted from public question, dashboard, review-queue, and backup responses; a verified option is revealed only after a completed server-scored attempt.

## Learner workflow

The dashboard shows subject entry points, the uploaded-exam and question totals, topic distribution, recent questions, and the review queue. Informatics and Logic subject pages expose their exact main-topic lists; selecting a topic opens its questions. Topic browsing supports exam year, available subtopic, and question number filters, including all years. Each question card displays its year, number, topic, review and answer-verification status (without exposing the correct option), source name/page, answer choices, and available table/formula content. The question detail screen includes the source link and provenance/status details but does not reveal the answer key.

Practice presents questions in sequence, lets learners select choices and navigate backward/forward, supports a year filter, and saves the attempt to MySQL under an anonymous browser key. Answer keys are withheld from active practice and all ordinary question reads, then scored on the server. Only trusted verified keys affect correct/incorrect counts or the percentage; unanswered or unverified-key questions are unscored. Results permit review of scored wrong answers and the verified option after attempt completion. Because the provided paper contains no trusted answer key, its questions are displayed as unscored until a source-backed key is entered.

The PDF archive also supports user-initiated uploads/imports, manual question entry, retrying failed imports, and a JSON backup export that omits answer-key values from its public response. The architecture leaves room for later mixed exams, difficulty filters, richer topic and most-missed statistics, additional years, Logic scratchpad/pen tools, and import/export refinements; these are future capabilities, not represented as already implemented.

**Access assumption:** the user selected admin-only use for AI. Ordinary visitors retain public question browsing and practice, while PDF upload, AI import/retry, manual question additions, question-review edits, and admin-only backup access are restricted on the server to an authenticated Manus OAuth admin. The admin account is bound to the securely configured `QEBULFIT_ADMIN_EMAIL` (with the existing platform `OWNER_OPEN_ID` promotion retained as an alternative). Client-side hiding is only a usability measure; `adminProcedure` and the PDF HTTP route enforce authorization. If the admin identity or Gemini key is absent, protected actions fail closed. Do not expose the Gemini key in client bundles. The existing public site remains; publish this change only after the owner configures the protected values and the admin gate has been verified.

## Project structure and serving

- `client/src/pages/` contains the dashboard, subject, topic, question, practice, upload, and review screens; `client/src/components/` contains the responsive app shell and source-aware question card.
- `client/src/lib/` contains typed client records, error/display helpers, and the anonymous learner key.
- `shared/topicCatalog.ts` is the single fixed subject/topic definition shared by client and server.
- `server/questionBank.ts` owns structured extraction, PDF upload/import, duplicate checks, review, manual question entry, and attempt scoring; `server/questionBankDb.ts` owns durable Drizzle queries and catalog seeding. The HTTP upload and health endpoints are registered in `server/_core/index.ts`, and the app router is wired through `server/routers.ts`.
- `drizzle/schema.ts` and additive migrations define the persistent subjects, topics, PDF sources, questions/options, import jobs, and study attempts.
- `client/public/manus-routes.json` declares the complete client route set; `client/public/qebulfit-mark.svg` is the site icon and in-app mark. `app.config.ts` contains the required durable HTTPS platform logo URL.

The existing `pnpm`/TypeScript tooling, Express server, configured port 3000, managed MySQL, object storage, and container entrypoint are retained. API and page routes use relative URLs for Preview proxy compatibility. The app serves `/api/health` for readiness.

## Visual design

No visual reference was supplied. Three low-probability directions were considered; the selected direction is a source-led editorial exam archive:

| Direction | Probability | Summary |
|---|---:|---|
| Editorial exam archive | 4% | Calm, provenance-forward study interface; selected. |
| Technical learning lab | 3% | Dark, data-dense control-panel feel. |
| Colorful quiz arcade | 4% | Saturated colors, points, and badges as the focus. |

**Design movement:** contemporary Swiss-editorial archive, adapted to Azerbaijani exam study. **Core principles:** legibility, visible provenance, clear topic hierarchy, and honest uncertainty. **Color philosophy:** warm paper and ink-dark text support long reading; deep teal communicates focus and trust; lime marks active progress; red is reserved for errors; neutral colors indicate unverified answers. The signature brand color is deep teal `#0f7668`.

**Layout paradigm:** desktop uses compact side navigation and an expansive reading column with editorial rows and dividers rather than a generic centered-card grid. Mobile reflows into a compact header and bottom navigation, with filters and records kept touch-friendly. **Signature elements:** numbered topic rails; discreet source-page chips; a Q-shaped open-book mark. **Interaction philosophy:** direct and low-friction, with visible sources and clear “unknown” states instead of gamified pressure. **Animation:** restrained 140–180 ms transitions for state changes; disable nonessential motion under `prefers-reduced-motion`.

**Typography:** DM Sans for headings and compact numeric labels; Noto Sans for Azerbaijani question text and UI copy; system monospace only for code-like content. **Brand essence:** “A careful entrance-exam archive for practicing real questions across years.” Personality: calm, exacting, encouraging. **Brand voice:** clear, supportive, and honest about uncertainty. Example lines: “Mövzunu seç. İllərin suallarını bir yerdə təkrar et.” and “Cavab təsdiqlənməyib; bu sual nəticə hesabına daxil edilmədi.” **Wordmark/logo:** a Q whose tail becomes an open book, drawn as a compact teal SVG mark. **Signature brand color:** deep teal `#0f7668`.

## Initial delivery scope

The initial delivery contains the populated 2010–2011 Informatics question bank and original PDF source; the full but empty Logic topic catalog; persistent browsing and filters; source-aware question pages and manual review; user-triggered PDF upload and AI extraction for future files; practice mode with honest scoring; anonymous persistent attempt history; and JSON backup export. The design stays in Preview, and the app will not be published without a separate request.
