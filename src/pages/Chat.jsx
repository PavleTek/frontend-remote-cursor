import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  createChat,
  getBackendUrl,
  getChat,
  getFavoriteModels,
  getWorkspaces,
  streamPrompt,
} from "../api/client.js";
import PlanView from "../components/PlanView.jsx";
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

/**
 * Message shapes:
 *   { id, role:"user",      type:"text",    content:string }
 *   { id, role:"assistant", type:"text",    content:string, streaming?:true }
 *   { id, role:"assistant", type:"plan",    plan:{name,overview,plan,todos[]},
 *                                           executing:bool, executed:bool }
 */

function MessageBubble({ msg, onExecutePlan }) {
  if (msg.type === "plan") {
    return (
      <div className="message message-assistant">
        <span className="message-label">Agent</span>
        <PlanView
          plan={msg.plan}
          executing={msg.executing}
          executed={msg.executed}
          onExecute={() => onExecutePlan(msg.id)}
        />
      </div>
    );
  }

  return (
    <div className={`message message-${msg.role}`}>
      <span className="message-label">{msg.role === "user" ? "You" : "Agent"}</span>
      <div className={`message-body${msg.streaming ? " streaming" : ""}`}>
        {msg.content}
        {msg.streaming && <span className="stream-caret" aria-hidden="true" />}
      </div>
    </div>
  );
}

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const paramId = searchParams.get("id");
  const paramWs = searchParams.get("workspace");
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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [noBackend, setNoBackend] = useState(false);
  const [noFavorites, setNoFavorites] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  // Keep a ref to the current chat id so streaming callbacks always see latest value
  const chatIdRef = useRef(chatId);
  useEffect(() => { chatIdRef.current = chatId; }, [chatId]);
  // Abort controller for the active stream
  const streamControllerRef = useRef(null);

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

    return () => { cancelled = true; };
  }, []);

  // When navigated to with ?id= and ?workspace=, load the existing transcript
  useEffect(() => {
    if (!getBackendUrl()) return;
    if (!paramId || !paramWs) return;
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
            type: "text",
            content: m.text,
          }));

          // If the transcript contains a plan, append it as a plan message
          if (transcript.plan) {
            loaded.push({
              id: crypto.randomUUID(),
              role: "assistant",
              type: "plan",
              plan: transcript.plan,
              executing: false,
              executed: transcript.plan.todos?.some((t) => t.status === "completed") ?? false,
            });
          }

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

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, paramWs]);

  // Create a new chat when there's no chatId
  useEffect(() => {
    if (!getBackendUrl()) {
      setInitializing(false);
      return;
    }
    if (paramId && paramWs) return;
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

    return () => { cancelled = true; };
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
    streamControllerRef.current?.abort();
    setError(null);
    setMessages([]);
    setPrompt("");
    setInitializing(true);
    setChatId(null);
    saveChatId(null);
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

  /** Re-fetch the transcript from disk and reconcile with current in-memory messages. */
  const handleRefresh = useCallback(async () => {
    const currentId = chatIdRef.current;
    const currentWs = chatWorkspace;
    if (!currentId || !currentWs || refreshing || sending) return;

    setRefreshing(true);
    setError(null);

    try {
      const result = await getChat(currentId, currentWs);
      const transcript = result.data;

      // Build a set of content strings already in memory so we don't duplicate
      setMessages((prev) => {
        const existingContents = new Set(
          prev.filter((m) => m.type === "text").map((m) => m.content.trim()),
        );

        const freshMessages = (transcript.messages || [])
          .map((m) => ({ role: m.role, text: m.text.trim() }))
          .filter((m) => m.text && !existingContents.has(m.text))
          .map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            type: "text",
            content: m.text,
          }));

        // Update todos on any existing plan card if the transcript has a plan
        const refreshedPlan = transcript.plan ?? null;
        const updated = prev.map((m) => {
          if (m.type !== "plan" || !refreshedPlan) return m;
          return {
            ...m,
            plan: refreshedPlan,
            executed: refreshedPlan.todos?.some((t) => t.status === "completed") ?? m.executed,
          };
        });

        // If there's a plan in the transcript but no plan card yet, append one
        const hasPlanCard = prev.some((m) => m.type === "plan");
        if (refreshedPlan && !hasPlanCard) {
          updated.push({
            id: crypto.randomUUID(),
            role: "assistant",
            type: "plan",
            plan: refreshedPlan,
            executing: false,
            executed: refreshedPlan.todos?.some((t) => t.status === "completed") ?? false,
          });
        }

        return [...updated, ...freshMessages];
      });
    } catch (err) {
      setError(err.message || "Failed to refresh transcript");
    } finally {
      setRefreshing(false);
    }
  }, [chatWorkspace, refreshing, sending]);

  /**
   * Core streaming send. Adds a user message, opens an SSE stream, accumulates
   * text deltas into a live assistant bubble, then on a plan event inserts a
   * plan card. On todo events, merges updated statuses into the plan card.
   */
  const runStream = useCallback(
    (text, streamMode, streamChatId, streamWorkspace, planMsgId = null) => {
      // Add live text bubble for streaming agent output
      const textMsgId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: textMsgId, role: "assistant", type: "text", content: "", streaming: true },
      ]);

      setSending(true);
      setError(null);

      const controller = streamPrompt(
        {
          prompt: text,
          chatId: streamChatId,
          mode: streamMode,
          model,
          workspaceSlug: streamWorkspace || undefined,
        },
        {
          onSession({ chatId: returnedId }) {
            // The init event contains the canonical chat id (useful when chatId was null)
            if (returnedId && returnedId !== chatIdRef.current) {
              saveChatId(returnedId);
              setChatId(returnedId);
            }
          },

          onText({ delta }) {
            if (!delta) return;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== textMsgId) return m;
                // Accept true deltas or cumulative snapshots from the backend
                const content = delta.startsWith(m.content)
                  ? delta
                  : m.content + delta;
                return { ...m, content };
              }),
            );
          },

          onPlan(planData) {
            // Replace the streaming text bubble with the plan card
            setMessages((prev) => {
              const withoutText = prev.filter((m) => m.id !== textMsgId);
              const newPlanMsg = {
                id: planMsgId ?? crypto.randomUUID(),
                role: "assistant",
                type: "plan",
                plan: {
                  name: planData.name ?? "",
                  overview: planData.overview ?? "",
                  plan: planData.plan ?? "",
                  todos: (planData.todos ?? []).map((t) => ({
                    id: t.id ?? crypto.randomUUID(),
                    content: t.content ?? "",
                    status: t.status ?? "pending",
                  })),
                },
                executing: false,
                executed: false,
              };
              return [...withoutText, newPlanMsg];
            });
          },

          onTodos({ todos: updatedTodos }) {
            // Merge todo statuses into the most recent plan card
            setMessages((prev) => {
              const statusMap = new Map(updatedTodos.map((t) => [t.id, t.status]));
              return prev.map((m) => {
                if (m.type !== "plan") return m;
                return {
                  ...m,
                  plan: {
                    ...m.plan,
                    todos: m.plan.todos.map((t) => ({
                      ...t,
                      status: statusMap.has(t.id) ? statusMap.get(t.id) : t.status,
                    })),
                  },
                };
              });
            });
          },

          onDone() {
            // Remove streaming state from live text bubble (if still present)
            setMessages((prev) =>
              prev.map((m) =>
                m.id === textMsgId ? { ...m, streaming: false } : m,
              ),
            );
            // Mark plan as executed-done if this was an agent execute run
            if (planMsgId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === planMsgId && m.type === "plan"
                    ? { ...m, executing: false, executed: true }
                    : m,
                ),
              );
            }
            setSending(false);
            textareaRef.current?.focus();
          },

          onError(err) {
            // Remove empty streaming bubble if nothing was written
            setMessages((prev) => {
              const msg = prev.find((m) => m.id === textMsgId);
              if (msg && !msg.content) {
                return prev.filter((m) => m.id !== textMsgId);
              }
              return prev.map((m) =>
                m.id === textMsgId ? { ...m, streaming: false } : m,
              );
            });
            if (planMsgId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === planMsgId && m.type === "plan"
                    ? { ...m, executing: false }
                    : m,
                ),
              );
            }
            setError(err.message || "Stream error");
            setSending(false);
            textareaRef.current?.focus();
          },
        },
      );

      streamControllerRef.current = controller;
    },
    [model],
  );

  const handleSend = useCallback(() => {
    const text = prompt.trim();
    if (!text || sending || initializing || loadingTranscript || !chatId) return;

    setPrompt("");
    const userMessage = { id: crypto.randomUUID(), role: "user", type: "text", content: text };
    setMessages((prev) => [...prev, userMessage]);

    runStream(text, mode, chatId, chatWorkspace);
  }, [prompt, sending, initializing, loadingTranscript, chatId, mode, chatWorkspace, runStream]);

  /** Called when the user taps "Execute Plan" inside a PlanView */
  const handleExecutePlan = useCallback(
    (planMsgId) => {
      if (sending) return;

      // Mark the plan card as executing
      setMessages((prev) =>
        prev.map((m) =>
          m.id === planMsgId && m.type === "plan" ? { ...m, executing: true } : m,
        ),
      );

      const executePrompt =
        "Execute the approved plan. Implement every todo step in order and report progress as you go.";

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        type: "text",
        content: executePrompt,
      };
      setMessages((prev) => [...prev, userMessage]);

      runStream(executePrompt, "agent", chatIdRef.current, chatWorkspace, planMsgId);
    },
    [sending, chatWorkspace, runStream],
  );

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
  const canRefresh = Boolean(chatIdRef.current && chatWorkspace && !busy && !refreshing && !noBackend);

  let subtitle;
  if (loadingTranscript) subtitle = "Loading transcript…";
  else if (initializing) subtitle = "Starting session…";
  else if (refreshing) subtitle = "Refreshing…";
  else if (sending) subtitle = `${modeLabel} · streaming…`;
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
        <div className="chat-header-actions">
          <button
            type="button"
            className={`btn btn-ghost btn-refresh${refreshing ? " refreshing" : ""}`}
            onClick={handleRefresh}
            disabled={!canRefresh}
            aria-label="Refresh transcript"
            title="Refresh transcript"
            style={{ cursor: canRefresh ? "pointer" : "default" }}
          >
            ↻
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleNewChat}
            disabled={busy || noBackend}
            style={{ cursor: "pointer" }}
          >
            New chat
          </button>
        </div>
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
          <MessageBubble key={msg.id} msg={msg} onExecutePlan={handleExecutePlan} />
        ))}

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
