import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  createChat,
  getBackendUrl,
  getChat,
  getFavoriteModels,
  getWorkspaces,
  sendPrompt,
} from "../api/client.js";
import {
  getMode,
  getModel,
  MODES,
  setMode as persistMode,
  setModel as persistModel,
} from "../hooks/useAgentPrefs.js";

const CHAT_ID_KEY = "remote-cursor-chat-id";
const CHAT_WS_KEY = "remote-cursor-chat-workspace";
const CHAT_WS_LABEL_KEY = "remote-cursor-chat-workspace-label";

function loadChatId() {
  return sessionStorage.getItem(CHAT_ID_KEY) ?? null;
}

function saveChatId(id) {
  if (id) sessionStorage.setItem(CHAT_ID_KEY, id);
  else sessionStorage.removeItem(CHAT_ID_KEY);
}

function loadChatWs() {
  return sessionStorage.getItem(CHAT_WS_KEY) ?? null;
}

function saveChatWs(ws) {
  if (ws) sessionStorage.setItem(CHAT_WS_KEY, ws);
  else sessionStorage.removeItem(CHAT_WS_KEY);
}

function loadChatWsLabel() {
  return sessionStorage.getItem(CHAT_WS_LABEL_KEY) ?? null;
}

function saveChatWsLabel(label) {
  if (label) sessionStorage.setItem(CHAT_WS_LABEL_KEY, label);
  else sessionStorage.removeItem(CHAT_WS_LABEL_KEY);
}

function extractResponseText(result) {
  if (typeof result.data === "string" && result.data.trim()) {
    return result.data.trim();
  }
  if (result.data && typeof result.data === "object") {
    return JSON.stringify(result.data, null, 2);
  }
  if (result.stdout?.trim()) return result.stdout.trim();
  if (result.stderr?.trim()) return result.stderr.trim();
  return "No response from agent.";
}

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const paramId = searchParams.get("id");
  const paramWs = searchParams.get("workspace");
  // Label may arrive via navigation state (e.g. from Projects or Chats pages)
  const stateLabel = location.state?.workspaceLabel ?? null;

  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [chatId, setChatId] = useState(() => paramId || loadChatId());
  const [chatWorkspace, setChatWorkspace] = useState(() => paramWs || loadChatWs());
  const [chatWorkspaceLabel, setChatWorkspaceLabel] = useState(
    () => stateLabel || loadChatWsLabel(),
  );
  const [mode, setMode] = useState(getMode);
  const [model, setModel] = useState(getModel);
  const [models, setModels] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [noBackend, setNoBackend] = useState(false);
  const [noFavorites, setNoFavorites] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  // Load favorite models + workspace list on mount
  useEffect(() => {
    if (!getBackendUrl()) {
      setNoBackend(true);
      setLoadingModels(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [favResult, wsResult] = await Promise.all([
          getFavoriteModels(),
          getWorkspaces().catch(() => ({ data: { workspaces: [] } })),
        ]);

        const list = Array.isArray(favResult.data?.favorites) ? favResult.data.favorites : [];
        const wsList = Array.isArray(wsResult.data?.workspaces) ? wsResult.data.workspaces : [];

        if (!cancelled) {
          setWorkspaces(wsList);
          if (list.length === 0) {
            setNoFavorites(true);
            setModels([]);
          } else {
            setNoFavorites(false);
            setModels(list);
            const stored = getModel();
            if (list.some((m) => m.id === stored)) {
              setModel(stored);
            } else {
              const primary = list[0].id;
              setModel(primary);
              persistModel(primary);
            }
          }
        }
      } catch {
        if (!cancelled) setError("Could not load favorite models");
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // When navigated to with ?id= and ?workspace=, load the existing transcript
  useEffect(() => {
    if (!getBackendUrl()) return;
    if (!paramId || !paramWs) return;

    // If this is the same chat already loaded, don't reload
    if (paramId === chatId && paramWs === chatWorkspace && messages.length > 0) return;

    let cancelled = false;
    setLoadingTranscript(true);
    setInitializing(false);
    setMessages([]);

    (async () => {
      try {
        const result = await getChat(paramId, paramWs);
        if (!cancelled) {
          const transcript = result.data;
          const loaded = (transcript.messages || []).map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.text,
          }));
          setMessages(loaded);
          setChatId(transcript.id);
          setChatWorkspace(paramWs);
          saveChatId(transcript.id);
          saveChatWs(paramWs);
          if (stateLabel) {
            setChatWorkspaceLabel(stateLabel);
            saveChatWsLabel(stateLabel);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load transcript");
      } finally {
        if (!cancelled) setLoadingTranscript(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, paramWs]);

  // Create a new chat (possibly targeted at a workspace) when there's no chatId
  useEffect(() => {
    if (!getBackendUrl()) {
      setInitializing(false);
      return;
    }
    if (paramId && paramWs) return; // handled by transcript loader
    if (chatId) {
      setInitializing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await createChat();
        const id = result.data?.chatId;
        if (!id) throw new Error("Could not create chat session");
        if (!cancelled) {
          saveChatId(id);
          setChatId(id);
          // If a workspace was specified via param but no id, keep it
          if (paramWs) {
            setChatWorkspace(paramWs);
            saveChatWs(paramWs);
            if (stateLabel) {
              setChatWorkspaceLabel(stateLabel);
              saveChatWsLabel(stateLabel);
            }
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to start chat");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, paramId, paramWs]);

  const handleModeChange = (nextMode) => {
    setMode(nextMode);
    persistMode(nextMode);
  };

  const handleModelChange = (e) => {
    const nextModel = e.target.value;
    setModel(nextModel);
    persistModel(nextModel);
  };

  // Change workspace from the picker — starts a fresh chat in that workspace
  const handleWorkspaceChange = useCallback(
    async (slug) => {
      const ws = workspaces.find((w) => w.slug === slug) ?? null;
      const newSlug = slug || null;
      const newLabel = ws?.label ?? null;

      setError(null);
      setMessages([]);
      setPrompt("");
      setInitializing(true);
      setChatId(null);
      setChatWorkspace(newSlug);
      setChatWorkspaceLabel(newLabel);
      saveChatId(null);
      saveChatWs(newSlug);
      saveChatWsLabel(newLabel);

      const newParams = {};
      if (newSlug) newParams.workspace = newSlug;
      setSearchParams(newParams, { replace: true });

      try {
        const result = await createChat();
        const id = result.data?.chatId;
        if (!id) throw new Error("Could not create chat session");
        saveChatId(id);
        setChatId(id);
      } catch (err) {
        setError(err.message || "Failed to start new chat");
      } finally {
        setInitializing(false);
      }
    },
    [workspaces, setSearchParams],
  );

  const handleNewChat = useCallback(async () => {
    setError(null);
    setMessages([]);
    setPrompt("");
    setInitializing(true);
    setChatId(null);
    saveChatId(null);
    // Preserve workspace if one is set
    const wsToKeep = chatWorkspace;
    const labelToKeep = chatWorkspaceLabel;

    const newParams = {};
    if (wsToKeep) newParams.workspace = wsToKeep;
    setSearchParams(newParams, { replace: true });

    try {
      const result = await createChat();
      const id = result.data?.chatId;
      if (!id) throw new Error("Could not create chat session");
      saveChatId(id);
      setChatId(id);
      setChatWorkspace(wsToKeep);
      setChatWorkspaceLabel(labelToKeep);
      saveChatWs(wsToKeep);
      saveChatWsLabel(labelToKeep);
    } catch (err) {
      setError(err.message || "Failed to start new chat");
    } finally {
      setInitializing(false);
    }
  }, [chatWorkspace, chatWorkspaceLabel, setSearchParams]);

  const handleSend = useCallback(async () => {
    const text = prompt.trim();
    if (!text || sending || initializing || loadingTranscript || !chatId) return;

    setPrompt("");
    setError(null);
    setSending(true);

    const userMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const result = await sendPrompt({
        prompt: text,
        chatId,
        mode,
        model,
        // Send workspaceSlug so the backend can resolve slug → real path
        workspaceSlug: chatWorkspace || undefined,
      });
      if (!result.ok) {
        throw new Error(result.stderr || result.error || "Agent request failed");
      }

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: extractResponseText(result),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err.message || "Failed to send prompt");
      setPrompt(text);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }, [prompt, sending, initializing, loadingTranscript, chatId, mode, model, chatWorkspace]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modeLabel = MODES.find((m) => m.id === mode)?.label ?? "Agent";
  const isResuming = Boolean(paramId && paramWs);
  const busy = sending || initializing || loadingTranscript;
  const displayLabel = chatWorkspaceLabel || chatWorkspace;

  let subtitle;
  if (loadingTranscript) subtitle = "Loading transcript…";
  else if (initializing) subtitle = "Starting session…";
  else if (sending) subtitle = `${modeLabel} · working…`;
  else if (chatId) subtitle = isResuming ? `${modeLabel} · resumed` : `${modeLabel} · ready`;
  else subtitle = "Offline";

  return (
    <div className="chat-page">
      <header className="chat-header">
        <div className="chat-header-text">
          <h1>Agent</h1>
          <p className="chat-subtitle">{subtitle}</p>
          {displayLabel && (
            <span className="workspace-chip" title={chatWorkspace ?? ""}>
              {displayLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleNewChat}
          disabled={busy || noBackend}
          style={{ cursor: "pointer" }}
        >
          New chat
        </button>
      </header>

      {isResuming && (
        <div className="chat-resume-bar">
          <button
            type="button"
            className="btn-text"
            onClick={() => navigate(-1)}
            style={{ cursor: "pointer" }}
          >
            ← Back to chats
          </button>
        </div>
      )}

      <div className="chat-controls">
        <div className="mode-picker" role="group" aria-label="Agent mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`mode-btn${mode === m.id ? " active" : ""}`}
              onClick={() => handleModeChange(m.id)}
              disabled={sending}
              style={{ cursor: "pointer" }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="chat-selectors">
          <label className="model-picker">
            <span className="visually-hidden">Model</span>
            <select
              value={model}
              onChange={handleModelChange}
              disabled={sending || loadingModels || noBackend || noFavorites}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="workspace-picker">
            <span className="visually-hidden">Workspace</span>
            <select
              value={chatWorkspace ?? ""}
              onChange={(e) => handleWorkspaceChange(e.target.value || null)}
              disabled={sending || noBackend}
            >
              <option value="">No workspace</option>
              {workspaces.map((ws) => (
                <option key={ws.slug} value={ws.slug} disabled={!ws.path}>
                  {ws.label}{!ws.path ? " (no path)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {noBackend && (
        <div className="chat-banner error">
          Set your backend URL in Settings before sending prompts.
        </div>
      )}

      {noFavorites && !noBackend && (
        <div className="chat-banner error">
          No favorite models configured.{" "}
          <Link to="/settings" className="inline-link">
            Add favorites in Settings
          </Link>
        </div>
      )}

      {error && <div className="chat-banner error">{error}</div>}

      <div className="messages" role="log" aria-live="polite">
        {messages.length === 0 && !busy && (
          <div className="empty-state">
            <p>Send a prompt to your Mac&apos;s Cursor agent.</p>
            {chatWorkspace ? (
              <p className="hint">Working in: {displayLabel}</p>
            ) : (
              <p className="hint">
                Ask = Q&amp;A only · Plan = read-only planning · Agent = full access
              </p>
            )}
          </div>
        )}

        {loadingTranscript && (
          <div className="empty-state">
            <p>Loading conversation…</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            <span className="message-label">{msg.role === "user" ? "You" : "Agent"}</span>
            <div className="message-body">{msg.content}</div>
          </div>
        ))}

        {sending && (
          <div className="message message-assistant">
            <span className="message-label">Agent</span>
            <div className="message-body thinking">
              <span className="dot-pulse" aria-hidden="true" />
              {modeLabel} mode — this can take a few minutes…
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="composer">
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          placeholder={`Message (${modeLabel.toLowerCase()} mode)…`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy || noBackend || !chatId || noFavorites}
        />
        <button
          type="button"
          className="btn btn-send"
          onClick={handleSend}
          disabled={
            !prompt.trim() ||
            busy ||
            noBackend ||
            !chatId ||
            noFavorites
          }
          aria-label="Send prompt"
          style={{ cursor: "pointer" }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
