const MODE_KEY = "remote-cursor-mode";
const MODEL_KEY = "remote-cursor-model";

export const MODES = [
  { id: "ask", label: "Ask" },
  { id: "plan", label: "Plan" },
  { id: "agent", label: "Agent" },
];

export function getMode() {
  const stored = localStorage.getItem(MODE_KEY);
  return MODES.some((m) => m.id === stored) ? stored : "agent";
}

export function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
}

export function getModel() {
  return localStorage.getItem(MODEL_KEY) ?? "composer-2.5-fast";
}

export function setModel(model) {
  localStorage.setItem(MODEL_KEY, model);
}
