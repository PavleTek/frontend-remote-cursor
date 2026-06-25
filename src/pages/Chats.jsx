import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getBackendUrl, getChats } from "../api/client.js";

function relativeTime(isoString) {
  if (!isoString) return "";
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

export default function Chats() {
  const [searchParams] = useSearchParams();
  const workspaceFilter = searchParams.get("workspace") || "";

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noBackend, setNoBackend] = useState(false);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Debounce query input
  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300);
  };

  const clearQuery = () => {
    setQuery("");
    setDebouncedQuery("");
  };

  const loadChats = useCallback(
    async (q) => {
      if (!getBackendUrl()) {
        setNoBackend(true);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await getChats({
          workspace: workspaceFilter || undefined,
          q: q || undefined,
        });
        const list = Array.isArray(result.data?.chats) ? result.data.chats : [];
        setChats(list);
      } catch (err) {
        setError(err.message || "Failed to load chats");
      } finally {
        setLoading(false);
      }
    },
    [workspaceFilter],
  );

  useEffect(() => {
    loadChats(debouncedQuery);
  }, [loadChats, debouncedQuery]);

  const openChat = (chat) => {
    navigate(`/chat?id=${encodeURIComponent(chat.id)}&workspace=${encodeURIComponent(chat.workspaceSlug)}`);
  };

  const title = workspaceFilter
    ? chats[0]?.workspaceLabel || workspaceFilter
    : "Chats";

  return (
    <div className="list-page">
      <header className="list-header">
        <div>
          <h1>{title}</h1>
          {workspaceFilter && (
            <p className="list-subtitle">
              <button
                type="button"
                className="btn-text"
                onClick={() => navigate("/")}
              >
                ← All chats
              </button>
            </p>
          )}
        </div>
      </header>

      <div className="search-bar">
        <input
          className="search-input"
          type="search"
          placeholder="Search chats…"
          value={query}
          onChange={handleQueryChange}
          autoComplete="off"
        />
        {query && (
          <button type="button" className="search-clear" onClick={clearQuery} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {noBackend && (
        <div className="list-banner error">
          Set your backend URL in Settings before browsing chats.
        </div>
      )}

      {error && <div className="list-banner error">{error}</div>}

      {loading && !error && (
        <div className="list-empty">Loading…</div>
      )}

      {!loading && !error && chats.length === 0 && (
        <div className="list-empty">
          {debouncedQuery ? "No chats matched your search." : "No chats found."}
        </div>
      )}

      {!loading && chats.length > 0 && (
        <ul className="list" role="list">
          {chats.map((chat) => (
            <li key={`${chat.workspaceSlug}/${chat.id}`}>
              <button
                type="button"
                className="list-row"
                onClick={() => openChat(chat)}
              >
                <div className="list-row-main">
                  <span className="list-row-title">{chat.title}</span>
                  {chat.preview && (
                    <span className="list-row-preview">{chat.preview}</span>
                  )}
                </div>
                <div className="list-row-meta">
                  {!workspaceFilter && (
                    <span className="badge">{chat.workspaceLabel}</span>
                  )}
                  <span className="list-row-time">{relativeTime(chat.updatedAt)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
