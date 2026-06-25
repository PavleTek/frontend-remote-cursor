import ReactMarkdown from "react-markdown";

const STATUS_ICONS = {
  completed: "✓",
  in_progress: "◉",
  cancelled: "✕",
  pending: "○",
};

const STATUS_CLASS = {
  completed: "todo-done",
  in_progress: "todo-active",
  cancelled: "todo-cancelled",
  pending: "todo-pending",
};

function TodoItem({ todo }) {
  const icon = STATUS_ICONS[todo.status] ?? STATUS_ICONS.pending;
  const cls = STATUS_CLASS[todo.status] ?? STATUS_CLASS.pending;
  return (
    <li className={`plan-todo ${cls}`}>
      <span className="plan-todo-icon" aria-hidden="true">{icon}</span>
      <span className="plan-todo-content">{todo.content}</span>
    </li>
  );
}

/**
 * Renders a structured plan card with name, overview, markdown body, todo list,
 * and an Execute Plan button.
 *
 * Props:
 *   plan      – { name, overview, plan (markdown), todos[] }
 *   executing – bool: is execute currently running?
 *   executed  – bool: has execute already finished?
 *   onExecute – () => void
 */
export default function PlanView({ plan, executing, executed, onExecute }) {
  if (!plan) return null;

  const { name, overview, plan: markdown, todos = [] } = plan;

  const doneCount = todos.filter((t) => t.status === "completed").length;
  const hasProgress = todos.some((t) => t.status !== "pending");

  return (
    <div className="plan-card">
      <div className="plan-card-header">
        <span className="plan-badge">Plan</span>
        {name && <h3 className="plan-name">{name}</h3>}
      </div>

      {overview && (
        <p className="plan-overview">{overview}</p>
      )}

      {markdown && (
        <div className="plan-markdown">
          <ReactMarkdown>{markdown}</ReactMarkdown>
        </div>
      )}

      {todos.length > 0 && (
        <div className="plan-todos">
          <p className="plan-todos-label">
            {hasProgress
              ? `Steps — ${doneCount} / ${todos.length} done`
              : `${todos.length} step${todos.length !== 1 ? "s" : ""}`}
          </p>
          <ul className="plan-todo-list">
            {todos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </div>
      )}

      {!executed && (
        <button
          type="button"
          className={`btn btn-execute${executing ? " executing" : ""}`}
          onClick={onExecute}
          disabled={executing}
          style={{ cursor: executing ? "default" : "pointer" }}
        >
          {executing ? (
            <>
              <span className="dot-pulse" aria-hidden="true" />
              Executing…
            </>
          ) : (
            "Execute Plan"
          )}
        </button>
      )}

      {executed && doneCount === todos.length && todos.length > 0 && (
        <p className="plan-done-label">All steps completed.</p>
      )}
    </div>
  );
}
