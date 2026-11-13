# QəbulFit — Entrance Exam Study Archive

An Azerbaijani-language study platform for organizing real entrance-exam questions by subject, year, and topic. The initial archive contains 50 Informatics questions from the 2010 and 2011 papers (25 each). Logic has all 20 requested main topics, including the `6.1 Sıralar` child topic, and remains empty until its own source PDFs are added.

## Run locally in the project environment

- `pnpm dev` starts the Express/tRPC server and Vite client (default port 3000; honors `PORT`).
- `pnpm check` runs TypeScript checks; `pnpm test` runs Vitest tests.
- `pnpm build` builds `dist/public/` and `dist/index.js`; `pnpm start` serves the production build.
- `pnpm db:migrate` applies the checked-in additive Drizzle migrations.

The first database migration is already applied to the managed MySQL database. Question records, source metadata, import jobs, review states, and anonymous study attempts persist in MySQL. Original PDFs are stored in Manus object storage; each question retains its source file and PDF page locator.

## Main features

- Dashboard, subject/topic browsing, year/subtopic/question-number filters, and source-linked question pages.
- Sequential topic practice. Unknown answer keys are not guessed; only source-verified keys are scored.
- PDF archive with multi-file upload, filename/year metadata, user-triggered AI extraction, duplicate checks, review queue, manual question entry, and JSON backup export.
- Original question text is kept separate from OCR correction suggestions. Uncertain text or classification stays in review instead of being silently changed.

Future PDF AI imports use the project’s built-in vision-capable model and consume project credits. A 50 MB per-file limit is enforced. The seed contains no answer key; all 50 questions therefore begin unscored. Four source/classification records are flagged for review: 2010 Q22 and 2011 Q1/Q7 have unapproved subtopic suggestions, and 2011 Q5 has an unclear printed word.

## Code map

- `client/src/pages/`: dashboard, subject, topic, question, practice, uploads, and review screens.
- `client/src/components/`: responsive application shell and source-aware question card.
- `shared/topicCatalog.ts`: fixed subject/topic definitions.
- `server/questionBank.ts`: upload/import, structured AI extraction, review, manual entry, and scoring.
- `server/questionBankDb.ts`: persistent MySQL queries and topic seeding.
- `drizzle/`: schema and additive migrations.
- `data/seed-2010-11.ts` and `scripts/seedInitial.ts`: reviewed seed data and idempotent loader.
- `client/public/manus-routes.json`: client page-route manifest.

This project is configured for Preview and is not published. There is no sign-in in this scope; the question bank and review edits are shared in the Preview, while study attempts use an anonymous browser key. Add access controls before any public release that requires private uploads or isolated users.
