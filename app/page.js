"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";

const GROUPS = {
  "WM 2026":         { flag: "🏆", color: "#0a1e6e", competition: "FIFA World Cup 2026" },
  "Premier League":  { flag: "EN", color: "#3d195b", competition: "Premier League" },
  "La Liga":         { flag: "🇪🇸", color: "#ee8707", competition: "La Liga" },
  "Serie A":         { flag: "🇮🇹", color: "#1a56db", competition: "Serie A" },
  "Bundesliga":      { flag: "🇩🇪", color: "#d00",    competition: "Bundesliga" },
  "Ligue 1":         { flag: "🇫🇷", color: "#003189", competition: "Ligue 1" },
  "Champions League":{ flag: "⭐", color: "#0a1e6e", competition: "UEFA Champions League" },
};

const CONF_STYLE = {
  High:   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  Medium: { bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  Low:    { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

export default function Home() {
  const [fixtures, setFixtures]       = useState({});
  const [fixturesLoading, setFxLoad]  = useState({});
  const [results, setResults]         = useState({});
  const [resultsLoading, setResLoad]  = useState({});
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading]         = useState({});
  const [filter, setFilter]           = useState("WM 2026");
  const [view, setView]               = useState("upcoming"); // "upcoming" | "results" | "stats"
  const [history, setHistory]         = useState([]);
  const [resolving, setResolving]     = useState(false);
  const fileInputRef = useRef(null);

  function downloadHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `football-predictor-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function uploadHistory(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed)) setHistory(parsed);
      } catch (err) {
        alert("Ungültige JSON-Datei: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function runResolve() {
    const pending = history
      .filter(h => !h.resolved && h.match_date && new Date(h.match_date) < new Date())
      .map(h => ({ id: h.id, competition: h.competition, home_team: h.home_team, away_team: h.away_team, match_date: h.match_date }));

    if (pending.length === 0) return;

    setResolving(true);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending }),
      });
      const data = await res.json();
      if (data.ok && data.updates.length > 0) {
        setHistory(h => h.map(item => {
          const upd = data.updates.find(u => u.id === item.id);
          if (!upd) return item;
          return { ...item, actual_home_score: upd.actual_home_score, actual_away_score: upd.actual_away_score, resolved: true };
        }));
      }
    } catch (e) {
      console.error(e);
    }
    setResolving(false);
  }

  const resolvedHistory = history.filter(h => h.resolved);
  const stats = {
    total: resolvedHistory.length,
    exactScorePct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => h.predicted_home_score === h.actual_home_score && h.predicted_away_score === h.actual_away_score).length / resolvedHistory.length) : 0,
    tendencyPct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => Math.sign(h.predicted_home_score - h.predicted_away_score) === Math.sign(h.actual_home_score - h.actual_away_score)).length / resolvedHistory.length) : 0,
  };

  const loadResults = useCallback(async (groupKey) => {
    setResLoad(l => ({ ...l, [groupKey]: true }));
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: GROUPS[groupKey].competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setResults(r => ({ ...r, [groupKey]: { stage_label: data.stage_label || "", results: data.results || [] } }));
    } catch (e) {
      setResults(r => ({ ...r, [groupKey]: { stage_label: "", results: [], error: e.message } }));
    }
    setResLoad(l => ({ ...l, [groupKey]: false }));
  }, []);

  const loadFixtures = useCallback(async (groupKey) => {
    setFxLoad(l => ({ ...l, [groupKey]: true }));
    try {
      const res = await fetch("/api/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: GROUPS[groupKey].competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFixtures(f => ({
        ...f,
        [groupKey]: {
          round_label: data.round_label || "",
          note: data.note || "",
          matches: (data.matches || []).map((m, i) => ({ ...m, id: `${groupKey}-${i}` })),
        },
      }));
    } catch (e) {
      setFixtures(f => ({ ...f, [groupKey]: { round_label: "", note: "Fehler beim Laden: " + e.message, matches: [] } }));
    }
    setFxLoad(l => ({ ...l, [groupKey]: false }));
  }, []);

  useEffect(() => {
    if (view === "upcoming" && !fixtures[filter]) loadFixtures(filter);
    if (view === "results" && !results[filter]) loadResults(filter);
  }, [filter, view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function predict(match, groupKey) {
    setLoading(l => ({ ...l, [match.id]: true }));
    try {
      const competition = GROUPS[groupKey].competition;
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: match.home, away: match.away, league: competition, date: match.date }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPredictions(p => ({ ...p, [match.id]: data.prediction }));

      setHistory(h => [
        ...h,
        {
          id: `${groupKey}-${match.home}-${match.away}-${match.date}-${Date.now()}`,
          competition,
          home_team: match.home,
          away_team: match.away,
          match_date: match.date,
          predicted_home_score: data.prediction.home_score,
          predicted_away_score: data.prediction.away_score,
          confidence: data.prediction.confidence,
          reasoning: data.prediction.reasoning,
          sources: data.prediction.sources || [],
          actual_home_score: null,
          actual_away_score: null,
          resolved: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setPredictions(p => ({
        ...p,
        [match.id]: { home_score: "?", away_score: "?", confidence: "Error", reasoning: "Fehler: " + e.message },
      }));
    }
    setLoading(l => ({ ...l, [match.id]: false }));
  }

  const current = fixtures[filter];
  const isFxLoading = fixturesLoading[filter];
  const currentResults = results[filter];
  const isResLoading = resultsLoading[filter];
  const lg2 = GROUPS[filter];

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>⚽ Football Score Predictor</h1>
      <p className={styles.subtitle}>Live-Spielpläne &amp; KI-Prognosen mit aktuellen Form-/Verletzungsdaten</p>

      <div className={styles.filters}>
        {Object.keys(GROUPS).map(l => (
          <button key={l} className={`${styles.filterBtn} ${filter === l && view !== "stats" ? styles.active : ""}`}
            onClick={() => { setFilter(l); setView("upcoming"); }}>
            {GROUPS[l].flag} {l}
          </button>
        ))}
        <button className={`${styles.filterBtn} ${view === "stats" ? styles.active : ""}`}
          onClick={() => setView("stats")}>
          📊 KI-Trefferquote
        </button>
      </div>

      {view === "stats" ? (
        <div className={styles.list}>
          <div className={styles.leagueHeader}>
            <span className={styles.leagueTitle}>📊 KI-Trefferquote (alle Ligen)</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={styles.analyseAllBtn} disabled={resolving} onClick={runResolve}>
                {resolving ? "Gleiche ab…" : "🔄 Offene Spiele abgleichen"}
              </button>
              <button className={styles.analyseAllBtn} onClick={downloadHistory}>
                ⬇️ Historie herunterladen
              </button>
              <button className={styles.analyseAllBtn} onClick={() => fileInputRef.current?.click()}>
                ⬆️ Historie hochladen
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadHistory} />
            </div>
          </div>

          {history.length === 0 && (
            <div className={styles.card}>
              Noch keine Prognosen erstellt. Erstelle ein paar Vorhersagen oder lade eine vorhandene Historie-Datei hoch.
            </div>
          )}

          {history.length > 0 && (
            <>
              <div className={styles.card}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Ausgewertete Prognosen</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#059669" }}>{stats.tendencyPct}%</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Tendenz korrekt (Sieg/Remis/Niederlage)</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#1d4ed8" }}>{stats.exactScorePct}%</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Exaktes Ergebnis korrekt</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#9ca3af" }}>{history.length - stats.total}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Noch offen</div>
                  </div>
                </div>
              </div>

              {[...history].reverse().map(r => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.matchInfo}>
                      <span className={styles.leagueBadge} style={{ background: "#f3f4f6", color: "#374151", borderColor: "#e5e7eb" }}>
                        {r.competition} {r.resolved ? "" : "· offen"}
                      </span>
                      <div className={styles.teams}>
                        <span>{r.home_team}</span>
                        <span className={styles.vs}>vs</span>
                        <span>{r.away_team}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>Prognose</div>
                        <div style={{ fontWeight: 600 }}>{r.predicted_home_score}:{r.predicted_away_score}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>Resultat</div>
                        <div style={{ fontWeight: 600 }}>{r.resolved ? `${r.actual_home_score}:${r.actual_away_score}` : "–"}</div>
                      </div>
                    </div>
                  </div>
                  {r.sources && r.sources.length > 0 && (
                    <div className={styles.sources} style={{ marginTop: 8 }}>
                      Quellen: {r.sources.join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
      <>
      <div className={styles.leagueHeader}>
        <span className={styles.leagueTitle}>
          {lg2.flag} {filter}
          {view === "upcoming" && current?.round_label ? ` · ${current.round_label}` : ""}
          {view === "results" && currentResults?.stage_label ? ` · ${currentResults.stage_label}` : ""}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.filterBtn} style={view === "upcoming" ? { background: "#111827", color: "#fff" } : {}}
            onClick={() => setView("upcoming")}>Anstehend</button>
          <button className={styles.filterBtn} style={view === "results" ? { background: "#111827", color: "#fff" } : {}}
            onClick={() => setView("results")}>Ergebnisse</button>
          {view === "upcoming" && (
            <button className={styles.analyseAllBtn} disabled={isFxLoading} onClick={() => loadFixtures(filter)}>
              {isFxLoading ? "Lade…" : "🔄 Aktualisieren"}
            </button>
          )}
          {view === "results" && (
            <button className={styles.analyseAllBtn} disabled={isResLoading} onClick={() => loadResults(filter)}>
              {isResLoading ? "Lade…" : "🔄 Aktualisieren"}
            </button>
          )}
        </div>
      </div>

      {view === "upcoming" && isFxLoading && !current && (
        <div className={styles.card}>Lade aktuellen Spielplan für {filter}…</div>
      )}

      {view === "upcoming" && current?.note && current.matches.length === 0 && (
        <div className={styles.card}>{current.note}</div>
      )}

      {view === "upcoming" && current && current.matches.length > 0 && (
        <>
          <div className={styles.list}>
            <button
              className={styles.analyseAllBtn}
              style={{ marginBottom: 8, alignSelf: "flex-start" }}
              disabled={current.matches.some(m => loading[m.id])}
              onClick={() => current.matches.forEach(m => predict(m, filter))}
            >
              ⚡ Alle Spiele dieser Runde analysieren
            </button>

            {current.matches.map(match => {
              const pred = predictions[match.id];
              const busy = loading[match.id];
              const cs   = pred ? (CONF_STYLE[pred.confidence] || CONF_STYLE.Low) : null;

              return (
                <div key={match.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.matchInfo}>
                      <div className={styles.teams}>
                        <span>{match.home}</span>
                        <span className={styles.vs}>vs</span>
                        <span>{match.away}</span>
                      </div>
                      <div className={styles.date}>
                        {match.date ? new Date(match.date).toLocaleString("de-CH", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>

                    <div className={styles.right}>
                      {pred && (
                        <div className={styles.scoreBox}>
                          <span className={styles.scoreNum}>{pred.home_score}</span>
                          <span className={styles.scoreSep}>:</span>
                          <span className={styles.scoreNum}>{pred.away_score}</span>
                          <span className={styles.confBadge}
                            style={{ background: cs.bg, color: cs.color, borderColor: cs.border }}>
                            {pred.confidence}
                          </span>
                        </div>
                      )}
                      <button className={styles.predictBtn} onClick={() => predict(match, filter)} disabled={busy}>
                        {busy ? "Analysiere…" : pred ? "Neu analysieren" : "Prognose"}
                      </button>
                    </div>
                  </div>

                  {pred?.reasoning && (
                    <div className={styles.reasoning}>
                      {pred.reasoning}
                      {pred.sources && pred.sources.length > 0 && (
                        <div className={styles.sources}>
                          Quellen: {pred.sources.join(" · ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === "results" && isResLoading && !currentResults && (
        <div className={styles.card}>Lade letzte Ergebnisse für {filter}…</div>
      )}

      {view === "results" && currentResults?.error && (
        <div className={styles.card}>Fehler beim Laden: {currentResults.error}</div>
      )}

      {view === "results" && currentResults && currentResults.results.length === 0 && !currentResults.error && (
        <div className={styles.card}>Keine abgeschlossenen Spiele gefunden.</div>
      )}

      {view === "results" && currentResults && currentResults.results.length > 0 && (
        <div className={styles.list}>
          {currentResults.results.map((r, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.matchInfo}>
                  <div className={styles.teams}>
                    <span>{r.home}</span>
                    <span className={styles.vs}>vs</span>
                    <span>{r.away}</span>
                  </div>
                  <div className={styles.date}>
                    {r.date ? new Date(r.date).toLocaleString("de-CH", { weekday: "short", day: "2-digit", month: "short" }) : ""}
                  </div>
                </div>
                <div className={styles.scoreBox}>
                  <span className={styles.scoreNum}>{r.home_score}</span>
                  <span className={styles.scoreSep}>:</span>
                  <span className={styles.scoreNum}>{r.away_score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </main>
  );
}
