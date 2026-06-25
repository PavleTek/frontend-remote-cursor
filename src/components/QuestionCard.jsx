import { useState } from "react";

/**
 * Renders a cursor/ask_question prompt as an interactive card.
 *
 * Props:
 *   question  – { title?, questions: [{ id, prompt, options: [{ id, label }], allowMultiple? }], answered }
 *   onSubmit  – (answers: [{ questionId, selectedOptionIds[] }]) => void
 */
export default function QuestionCard({ question, onSubmit }) {
  const { title, questions = [], answered } = question;

  // Map<questionId, Set<optionId>>
  const [selected, setSelected] = useState(() => new Map());
  const [submitted, setSubmitted] = useState(answered ?? false);

  const canSubmit =
    !submitted &&
    questions.every((q) => {
      const sel = selected.get(q.id);
      return sel && sel.size > 0;
    });

  function toggleOption(questionId, optionId, allowMultiple) {
    if (submitted) return;
    setSelected((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(questionId) ?? []);

      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (!allowMultiple) current.clear();
        current.add(optionId);
      }

      next.set(questionId, current);
      return next;
    });
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitted(true);

    const answers = questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: [...(selected.get(q.id) ?? [])],
    }));

    onSubmit(answers);
  }

  return (
    <div className={`question-card${submitted ? " question-card--answered" : ""}`}>
      <div className="question-card-header">
        <span className="question-badge">Question</span>
        {title && <span className="question-title">{title}</span>}
      </div>

      <div className="question-body">
        {questions.map((q) => {
          const sel = selected.get(q.id) ?? new Set();
          return (
            <div key={q.id} className="question-item">
              <p className="question-prompt">{q.prompt}</p>
              <div className="question-options">
                {q.options.map((opt) => {
                  const isSelected = sel.has(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`question-option${isSelected ? " selected" : ""}${submitted ? " locked" : ""}`}
                      onClick={() => toggleOption(q.id, opt.id, q.allowMultiple ?? false)}
                      disabled={submitted}
                      style={{ cursor: submitted ? "default" : "pointer" }}
                    >
                      <span className="question-option-check" aria-hidden="true">
                        {isSelected ? (q.allowMultiple ? "☑" : "●") : (q.allowMultiple ? "☐" : "○")}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {submitted ? (
        <p className="question-answered-label">Answer submitted — waiting for agent…</p>
      ) : (
        <button
          type="button"
          className="btn btn-question-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{ cursor: canSubmit ? "pointer" : "default" }}
        >
          Submit
        </button>
      )}
    </div>
  );
}
