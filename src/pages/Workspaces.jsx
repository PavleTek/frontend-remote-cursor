import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBackendUrl, getWorkspaces, saveWorkspaces } from "../api/client.js";

function relativeTime(isoString) {
  if (!isoString) return "no chats";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

export default function Workspaces() {
  const [query, setQuery] = useState("");
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noBackend, setNoBackend] = useState(false);
  const [savingSlug, setSavingSlug] = useState(null);
  const navigate = useNavigate();

  const loadWorkspaces = async () => {
    if (!getBackendUrl()) {
      setNoBackend(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getWorkspaces();
      const list = Array.isArray(result.data?.workspaces) ? result.data.workspaces : [];
      setWorkspaces(list);
    } catch (err) {
      setError(err.message || "Failed to load workspaces");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const filtered = workspaces.filter((ws) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      ws.label.toLowerCase().includes(q) ||
      ws.slug.toLowerCase().includes(q) ||
      (ws.path || "").toLowerCase().includes(q)
    );
  });

  const openWorkspace = (ws) => {
    navigate(`/?workspace=${encodeURIComponent(ws.slug)}`);
  };

  const togglePin = async (ws) => {
    setSavingSlug(ws.slug);
    try {
      const overrides = {};
      for (const w of workspaces) {
        const pinned = w.slug === ws.slug ? !w.pinned : w.pinned;
        overrides[w.slug] = { label: w.label, pinned };
      }
      await saveWorkspaces(overrides);
      setWorkspaces((prev) =>
        prev.map((w) => (w.slug === ws.slug ? { ...w, pinned: !w.pinned } : w)),
      );
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSavingSlug(null);
    }
  };

  return (
    <div className="list-page">
      <header className="list-header">
        <div>
          <h1>Projects</h1>
          <p className="list-subtitle">
            {loading ? "Loading…" : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""}`}
          </p>
        </div>
      </header>

      <div className="search-bar">
        <input
          className="search-input"
          type="search"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {noBackend && (
        <div className="list-banner error">
          Set your backend URL in Settings before browsing projects.
        </div>
      )}

      {error && <div className="list-banner error">{error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="list-empty">
          {query ? "No projects matched your search." : "No projects found."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <ul className="list" role="list">
          {filtered.map((ws) => (
            <li key={ws.slug}>
              <div className="list-row ws-row">
                <button
                  type="button"
                  className="ws-row-body"
                  onClick={() => openWorkspace(ws)}
                >
                  <span className="list-row-title">
                    {ws.pinned && <span className="pin-indicator" aria-hidden="true">★ </span>}
                    {ws.label}
                  </span>
                  {ws.path && (
                    <span className="list-row-preview ws-path">{ws.path}</span>
                  )}
                </button>
                <div className="ws-row-aside">
                  <span className={`badge badge-${ws.type}`}>{ws.type}</span>
                  <span className="list-row-time">
                    {ws.chatCount} chat{ws.chatCount !== 1 ? "s" : ""} · {relativeTime(ws.lastActivity)}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ws-new"
                  title={ws.path ? "New chat in this project" : "No resolved path — add one in data/workspaces.json"}
                  disabled={!ws.path}
                  onClick={() =>
                    navigate(`/chat?workspace=${encodeURIComponent(ws.slug)}`, {
                      state: { workspaceLabel: ws.label },
                    })
                  }
                  aria-label={`New chat in ${ws.label}`}
                  style={{ cursor: ws.path ? "pointer" : "not-allowed" }}
                >
                  +
                </button>
                <button
                  type="button"
                  className={`btn-pin${ws.pinned ? " active" : ""}`}
                  title={ws.pinned ? "Unpin" : "Pin"}
                  disabled={savingSlug === ws.slug}
                  onClick={() => togglePin(ws)}
                  aria-label={ws.pinned ? "Unpin project" : "Pin project"}
                >
                  {ws.pinned ? "★" : "☆"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
