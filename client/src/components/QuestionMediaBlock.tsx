import type { QuestionRecord } from "@/lib/study";

type QuestionMedia = NonNullable<QuestionRecord["media"]>[number];

export default function QuestionMediaBlock({ media }: { media: QuestionMedia }) {
  const label = media.label || (media.kind === "table" ? "Cədvəl" : media.kind === "formula" ? "Düstur" : "Mənbə elementi");
  const isTable = media.kind === "table";

  return (
    <div className={`question-media${isTable ? " question-media-table" : ""}`}>
      <strong>{label}</strong>
      {isTable ? (
        <div className="question-table-scroll" role="region" aria-label={`${label} — üfüqi sürüşdürün`} tabIndex={0}>
          <pre>{media.value}</pre>
        </div>
      ) : <pre>{media.value}</pre>}
    </div>
  );
}
