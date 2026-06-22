"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";

const GROUPS = {
  "WM 2026":         { flag: "🏆", color: "#0a1e6e", competition: "FIFA World Cup 2026" },
  "Premier League":  { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#3d195b", competition: "Premier League" },
  "La Liga":         { flag: "🇪🇸", color: "#ee8707", competition: "La Liga" },
  "Serie A":         { flag: "🇮🇹", color: "#1a56db", competition: "Serie A" },
  "Bundesliga":      { flag: "🇩🇪", color: "#d00",    competition: "Bundesliga" },
  "Ligue 1":         { flag: "🇫🇷", color: "#003189", competition: "Ligue 1" },
};

const CONF_STYLE = {
  High:   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  Medium: { bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  Low:    { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

export default function Home() {
  const [fixtures, setFixtures]       = useState({}); // { "Premier League": { round_label, matches: [...], note } }
  const [fixturesLoading, setFxLoad]  = useState({});
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading]         = useState({});
  const [filter, setFilter]           = useState("WM 2026");

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

  // Beim ersten Laden automatisch die aktuell gewählte Liga abrufen
  useEffect(() => {
    if (!fixtures[filter]) loadFixtures(filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const lg2 = GROUPS[filter];

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>⚽ Football Score Predictor</h1>
      <p className={styles.subtitle}>Live-Spielpläne &amp; KI-Prognosen mit aktuellen Form-/Verletzungsdaten</p>

      <div className={styles.filters}>
        {Object.keys(GROUPS).map(l => (
          <button key={l} className={`${styles.filterBtn} ${filter === l ? styles.active : ""}`}
            onClick={() => setFilter(l)}>
            {GROUPS[l].flag} {l}
          </button>
        ))}
      </div>

      <div className={styles.leagueHeader}>
        <span className={styles.leagueTitle}>
          {lg2.flag} {filter}{current?.round_label ? ` · ${current.round_label}` : ""}
        </span>
        <button className={styles.analyseAllBtn} disabled={isFxLoading}
          onClick={() => loadFixtures(filter)}>
          {isFxLoading ? "Lade Spielplan…" : "🔄 Spielplan aktualisieren"}
        </button>
      </div>

      {isFxLoading && !current && (
        <div className={styles.card}>Lade aktuellen Spielplan für {filter}…</div>
      )}

      {current?.note && current.matches.length === 0 && (
        <div className={styles.card}>{current.note}</div>
      )}

      {current && current.matches.length > 0 && (
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
                    <div className={styles.reasoning}>{pred.reasoning}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
