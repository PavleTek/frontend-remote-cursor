function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Sticky banner shown while the agent stream is active.
 *
 * Props:
 *   label          – status copy (e.g. "Thinking…", "Agent is working…")
 *   elapsedSeconds – seconds since the stream started
 *   showTimer      – whether to display the elapsed timer
 */
export default function AgentWorkingBar({ label, elapsedSeconds, showTimer }) {
  return (
    <div className="agent-working-bar" role="status" aria-live="polite">
      <div className="agent-working-bar__inner">
        <span className="dot-pulse" aria-hidden="true" />
        <span className="agent-working-bar__label">{label}</span>
        {showTimer && (
          <span className="agent-working-bar__timer">{formatElapsed(elapsedSeconds)}</span>
        )}
      </div>
      <div className="agent-working-bar__shimmer" aria-hidden="true" />
    </div>
  );
}
