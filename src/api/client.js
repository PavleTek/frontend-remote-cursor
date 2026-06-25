const STORAGE_KEY = "remote-cursor-backend-url";
const API_KEY_STORAGE_KEY = "remote-cursor-api-key";

export function getBackendUrl() {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setBackendUrl(url) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ""));
}

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

export function setApiKey(key) {
  const trimmed = key.trim();
  if (trimmed) {
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }
}

function buildHeaders() {
  const headers = {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

export async function apiRequest(path, options = {}) {
  const baseUrl = getBackendUrl();
  if (!baseUrl) {
    throw new Error("Backend URL is not configured");
  }

  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...buildHeaders(),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      "Could not reach backend. Check the ngrok URL is current and the backend is running.",
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.error ||
      body?.stderr ||
      body?.stdout ||
      `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (body && body.ok === false) {
    throw new Error(body.stderr || body.error || "Request failed");
  }

  return body;
}

export async function checkHealth() {
  return apiRequest("/api/health");
}

export async function getAbout() {
  return apiRequest("/api/about");
}

export async function getStatus() {
  return apiRequest("/api/status");
}

export async function getModels() {
  return apiRequest("/api/models");
}

export async function getFavoriteModels() {
  return apiRequest("/api/favorites/models");
}

export async function saveFavoriteModels(favorites) {
  return apiRequest("/api/favorites/models", {
    method: "PUT",
    body: JSON.stringify({ favorites }),
  });
}

export async function createChat() {
  return apiRequest("/api/chats", { method: "POST" });
}

export async function sendPrompt(payload) {
  return apiRequest("/api/prompt", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Stream a prompt via SSE (POST /api/prompt/stream).
 * handlers: { onTurn, onSession, onText, onPlan, onTodos, onQuestion, onDone, onError }
 * Returns an AbortController — call .abort() to cancel.
 */
export function streamPrompt(payload, handlers = {}) {
  const baseUrl = getBackendUrl();
  if (!baseUrl) {
    handlers.onError?.(new Error("Backend URL is not configured"));
    return { abort: () => {} };
  }

  const controller = new AbortController();
  const url = `${baseUrl}/api/prompt/stream`;

  (async () => {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        handlers.onError?.(new Error("Could not reach backend. Check the ngrok URL is current and the backend is running."));
      }
      return;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      handlers.onError?.(new Error(body?.error || `Request failed (${response.status})`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by double newlines
        const frames = buffer.split("\n\n");
        buffer = frames.pop(); // keep any incomplete frame

        for (const frame of frames) {
          if (!frame.trim()) continue;
          let eventName = "message";
          let dataStr = "";

          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.slice(5).trim();
            }
          }

          let parsed;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          switch (eventName) {
            case "turn":     handlers.onTurn?.(parsed); break;
            case "session":  handlers.onSession?.(parsed); break;
            case "text":     handlers.onText?.(parsed); break;
            case "plan":     handlers.onPlan?.(parsed); break;
            case "todos":    handlers.onTodos?.(parsed); break;
            case "question": handlers.onQuestion?.(parsed); break;
            case "done":     handlers.onDone?.(parsed); break;
            case "error":    handlers.onError?.(new Error(parsed.error ?? "Stream error")); break;
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        handlers.onError?.(err);
      }
    }
  })();

  return controller;
}

export async function getWorkspaces() {
  return apiRequest("/api/workspaces");
}

export async function saveWorkspaces(overrides) {
  return apiRequest("/api/workspaces", {
    method: "PUT",
    body: JSON.stringify({ overrides }),
  });
}

export async function getChats({ workspace, q } = {}) {
  const params = new URLSearchParams();
  if (workspace) params.set("workspace", workspace);
  if (q) params.set("q", q);
  const qs = params.toString();
  return apiRequest(`/api/chats${qs ? `?${qs}` : ""}`);
}

export async function getChat(id, workspace) {
  const params = new URLSearchParams({ workspace });
  return apiRequest(`/api/chats/${encodeURIComponent(id)}?${params.toString()}`);
}

// ── ACP reply helpers ─────────────────────────────────────────────────────────

/**
 * Submit answers to a pending cursor/ask_question blocking request.
 * answers: [{ questionId, selectedOptionIds[] }]
 */
export async function respondToQuestion({ turnId, requestId, answers }) {
  return apiRequest("/api/acp/respond", {
    method: "POST",
    body: JSON.stringify({ turnId, requestId, answers }),
  });
}

/**
 * Accept or reject a pending cursor/create_plan blocking request.
 * decision: "accepted" | "rejected"
 */
export async function respondToPlan({ turnId, requestId, decision, reason }) {
  return apiRequest("/api/acp/plan-decision", {
    method: "POST",
    body: JSON.stringify({ turnId, requestId, decision, reason }),
  });
}

/**
 * Cancel an active turn and terminate its agent subprocess.
 */
export async function cancelTurn(turnId) {
  return apiRequest("/api/acp/cancel", {
    method: "POST",
    body: JSON.stringify({ turnId }),
  });
}
