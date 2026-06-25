const STORAGE_KEY = "remote-cursor-backend-url";

export function getBackendUrl() {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setBackendUrl(url) {
  localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ""));
}

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
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
