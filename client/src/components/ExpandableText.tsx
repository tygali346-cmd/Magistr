import { useState } from "react";

export default function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="expandable-question-text">
      <p className={`question-text${expanded ? " expanded" : ""}`}>{text}</p>
      <button
        type="button"
        className="question-expand-btn"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
      >
        {expanded ? "Bağla" : "Əsas mətni aç"}
      </button>
    </div>
  );
}
