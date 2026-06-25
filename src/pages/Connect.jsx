import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setApiKey, setBackendUrl } from "../api/client.js";

export default function Connect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const backend = searchParams.get("backend");
    const key = searchParams.get("key");

    if (!backend) {
      setError("Missing backend URL. Scan the QR code from your Mac again.");
      return;
    }

    try {
      const decoded = decodeURIComponent(backend).replace(/\/+$/, "");
      new URL(decoded);
      setBackendUrl(decoded);
      if (key) {
        setApiKey(decodeURIComponent(key));
      }

      navigate("/", {
        replace: true,
        state: { connected: true, backendUrl: decoded, hasApiKey: Boolean(key) },
      });
    } catch {
      setError("Invalid backend URL in link.");
    }
  }, [searchParams, navigate]);

  return (
    <div className="app connect-page">
      <main className="main">
        <section className="card">
          <h2>{error ? "Connection failed" : "Connecting…"}</h2>
          <p className="hint">
            {error || "Saving your Mac backend URL and opening the app."}
          </p>
          {error && (
            <button type="button" className="btn btn-primary" onClick={() => navigate("/", { replace: true })}>
              Go to settings
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
