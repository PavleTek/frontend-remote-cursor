import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ModelFavoritesPicker from "../components/ModelFavoritesPicker.jsx";
import {
  checkHealth,
  getAbout,
  getApiKey,
  getBackendUrl,
  setApiKey,
  setBackendUrl,
} from "../api/client.js";

export default function Settings() {
  const location = useLocation();
  const [backendUrl, setBackendUrlInput] = useState("");
  const [apiKey, setApiKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [justConnected, setJustConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setBackendUrlInput(getBackendUrl());
    setApiKeyInput(getApiKey());
  }, []);

  useEffect(() => {
    if (location.state?.connected) {
      setJustConnected(true);
      if (location.state.backendUrl) {
        setBackendUrlInput(location.state.backendUrl);
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSave = useCallback(() => {
    setBackendUrl(backendUrl.trim());
    setApiKey(apiKey.trim());
    setSaved(true);
    setError(null);
    setResult(null);
    setTimeout(() => setSaved(false), 2000);
  }, [backendUrl, apiKey]);

  const runTest = useCallback(async (fn, label) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await fn();
      setResult({ label, data });
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="page">
      <header className="header">
        <div className="header-badge">RC</div>
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Backend connection & diagnostics</p>
        </div>
      </header>

      <main className="main">
        {justConnected && (
          <section className="card banner-card">
            <p className="status success">
              Connected via QR — backend URL
              {location.state?.hasApiKey ? " and API key" : ""} saved
            </p>
          </section>
        )}

        <section className="card">
          <h2>Backend connection</h2>
          <p className="hint">
            Enter your ngrok URL (e.g. https://abc123.ngrok-free.app). No trailing slash.
          </p>

          <label className="field">
            <span>Backend URL</span>
            <input
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://your-tunnel.ngrok-free.app"
              value={backendUrl}
              onChange={(e) => setBackendUrlInput(e.target.value)}
            />
          </label>

          <label className="field">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Set automatically when scanning the QR code"
              value={apiKey}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
          </label>

          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {saved ? "Saved ✓" : "Save settings"}
          </button>
        </section>

        <ModelFavoritesPicker />

        <section className="card">
          <h2>Test connection</h2>
          <p className="hint">Ping your Mac backend to verify the tunnel is working.</p>

          <div className="btn-group">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading || !backendUrl.trim()}
              onClick={() => runTest(checkHealth, "Health check")}
            >
              Health check
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading || !backendUrl.trim()}
              onClick={() => runTest(getAbout, "Agent info")}
            >
              Agent info
            </button>
          </div>
        </section>

        {(loading || error || result) && (
          <section className="card result-card">
            <h2>Response</h2>
            {loading && <p className="status loading">Connecting…</p>}
            {error && <p className="status error">{error}</p>}
            {result && (
              <>
                <p className="status success">{result.label} succeeded</p>
                <pre className="response">{JSON.stringify(result.data, null, 2)}</pre>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
