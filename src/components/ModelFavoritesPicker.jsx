import { useCallback, useEffect, useMemo, useState } from "react";
import { getFavoriteModels, getModels, saveFavoriteModels } from "../api/client.js";

export default function ModelFavoritesPicker() {
  const [catalog, setCatalog] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [modelsRes, favoritesRes] = await Promise.all([
          getModels(),
          getFavoriteModels(),
        ]);

        if (cancelled) return;

        const all = Array.isArray(modelsRes.data) ? modelsRes.data : [];
        const ids =
          favoritesRes.data?.favoriteIds ??
          favoritesRes.data?.favorites?.map((m) => m.id) ??
          [];

        setCatalog(all);
        setFavoriteIds(ids);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const catalogById = useMemo(
    () => new Map(catalog.map((m) => [m.id, m])),
    [catalog],
  );

  const favoriteModels = useMemo(
    () =>
      favoriteIds.map((id) => ({
        id,
        label: catalogById.get(id)?.label ?? id,
      })),
    [favoriteIds, catalogById],
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const favoriteSet = new Set(favoriteIds);
    return catalog.filter((m) => {
      if (favoriteSet.has(m.id)) return false;
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q)
      );
    });
  }, [catalog, favoriteIds, search]);

  const addFavorite = useCallback((id) => {
    setFavoriteIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setSaved(false);
  }, []);

  const removeFavorite = useCallback((id) => {
    setFavoriteIds((prev) => prev.filter((f) => f !== id));
    setSaved(false);
  }, []);

  const moveFavorite = useCallback((id, direction) => {
    setFavoriteIds((prev) => {
      const index = prev.indexOf(id);
      if (index === -1) return prev;
      const next = direction === "up" ? index - 1 : index + 1;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
    setSaved(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (favoriteIds.length === 0) {
      setError("Pick at least one favorite model");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await saveFavoriteModels(favoriteIds);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || "Could not save favorites");
    } finally {
      setSaving(false);
    }
  }, [favoriteIds]);

  return (
    <section className="card">
      <h2>Favorite models</h2>
      <p className="hint">
        Only favorites appear on the Chat screen. First in the list is the default.
      </p>

      {error && <p className="status error model-fav-error">{error}</p>}

      {loading ? (
        <p className="status loading">Loading models…</p>
      ) : (
        <>
          <div className="favorite-list">
            <span className="field-label">Your favorites</span>
            {favoriteModels.length === 0 ? (
              <p className="hint no-favorites">No favorites yet — search and add below.</p>
            ) : (
              favoriteModels.map((m, index) => (
                <div key={m.id} className="favorite-row">
                  <span className="favorite-rank">{index === 0 ? "★" : index + 1}</span>
                  <div className="favorite-info">
                    <span className="favorite-label">{m.label}</span>
                    <span className="favorite-id">{m.id}</span>
                  </div>
                  <div className="favorite-actions">
                    <button
                      type="button"
                      className="btn-icon"
                      disabled={index === 0 || saving}
                      onClick={() => moveFavorite(m.id, "up")}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-icon"
                      disabled={index === favoriteModels.length - 1 || saving}
                      onClick={() => moveFavorite(m.id, "down")}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-danger"
                      disabled={saving}
                      onClick={() => removeFavorite(m.id)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="field">
            <span>Search models</span>
            <input
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Type to filter by name or id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <div className="model-search-results">
            {filteredCatalog.length === 0 ? (
              <p className="hint">No matching models{search ? " for that search" : ""}.</p>
            ) : (
              filteredCatalog.slice(0, 40).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="model-search-item"
                  disabled={saving}
                  onClick={() => addFavorite(m.id)}
                >
                  <span className="favorite-label">{m.label}</span>
                  <span className="favorite-id">{m.id}</span>
                </button>
              ))
            )}
            {filteredCatalog.length > 40 && (
              <p className="hint">Showing first 40 matches — refine your search.</p>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || favoriteIds.length === 0}
            onClick={handleSave}
          >
            {saved ? "Favorites saved ✓" : saving ? "Saving…" : "Save favorites"}
          </button>
        </>
      )}
    </section>
  );
}
