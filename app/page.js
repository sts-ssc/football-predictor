"use client";
import { useState } from "react";
import styles from "./page.module.css";

const LEAGUES = {
  "Premier League":  { flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", color: "#3d195b" },
  "La Liga":         { flag: "🇪🇸", color: "#ee8707" },
  "Serie A":         { flag: "🇮🇹", color: "#1a56db" },
  "Bundesliga":      { flag: "🇩🇪", color: "#d00" },
  "Ligue 1":         { flag: "🇫🇷", color: "#003189" },
  "Champions League":{ flag: "🏆", color: "#0a1e6e" },
  "Europa League":   { flag: "🟠", color: "#e3611c" },
};

const MATCHES = [
  { id: 1,  league: "Premier League", home: "Arsenal",          away: "Chelsea",           date: "2026-05-28" },
  { id: 2,  league: "Premier League", home: "Liverpool",        away: "Man City",           date: "2026-05-28" },
  { id: 3,  league: "Premier League", home: "Tottenham",        away: "Man United",         date: "2026-05-29" },
  { id: 4,  league: "Premier League", home: "Newcastle",        away: "Aston Villa",        date: "2026-05-29" },
  { id: 5,  league: "La Liga",        home: "Real Madrid",      away: "Barcelona",          date: "2026-05-28" },
  { id: 6,  league: "La Liga",        home: "Atletico Madrid",  away: "Sevilla",            date: "2026-05-29" },
  { id: 7,  league: "Serie A",        home: "Inter Milan",      away: "AC Milan",           date: "2026-05-28" },
  { id: 8,  league: "Serie A",        home: "Juventus",         away: "Napoli",             date: "2026-05-29" },
  { id: 9,  league: "Bundesliga",     home: "Bayern Munich",    away: "Borussia Dortmund",  date: "2026-05-28" },
  { id: 10, league: "Bundesliga",     home: "Bayer Leverkusen", away: "RB Leipzig",         date: "2026-05-29" },
  { id: 11, league: "Ligue 1",        home: "PSG",              away: "Marseille",          date: "2026-05-28" },
  { id: 12, league: "Ligue 1",        home: "Lyon",             away: "Monaco",             date: "2026-05-29" },
];

const CONF_STYLE = {
  High:   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  Medium: { bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  Low:    { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

export default function Home() {
  const [predictions, setPredictions] = useState({});
  const [loading, setLoading]         = useState({});
  const [filter, setFilter]           = useState("All");

  const filtered = filter === "All" ? MATCHES : MATCHES.filter(m => m.league === filter);

  async function predictAll() {
    const targets = filter === "All" ? MATCHES : MATCHES.filter(m => m.league === filter);
    for (const match of targets) {
      if (loading[match.id]) continue;
      await predict(match);
    }
  }

  async function predict(match) {
    setLoading(l => ({ ...l, [match.id]: true }));
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: match.home, away: match.away, league: match.league, date: match.date }),
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

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>⚽ Football Score Predictor</h1>
      <p className={styles.subtitle}>KI-Prognosen mit Live-Daten zu Form, Verletzungen &amp; Tabelle</p>

      <div className={styles.filters}>
        {["All", ...Object.keys(LEAGUES)].map(l => (
          <button key={l} className={`${styles.filterBtn} ${filter === l ? styles.active : ""}`}
            onClick={() => setFilter(l)}>
            {l === "All" ? "Alle Ligen" : `${LEAGUES[l].flag} ${l}`}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {Object.keys(LEAGUES).filter(lg => filter === "All" || filter === lg).map(lg => {
          const leagueMatches = filtered.filter(m => m.league === lg);
          if (!leagueMatches.length) return null;
          const anyLoading = leagueMatches.some(m => loading[m.id]);
          return (
            <div key={lg}>
              <div className={styles.leagueHeader}>
                <span className={styles.leagueTitle}>{LEAGUES[lg].flag} {lg}</span>
                <button className={styles.analyseAllBtn} disabled={anyLoading}
                  onClick={() => leagueMatches.forEach(m => predict(m))}>
                  {anyLoading ? "Analysiere…" : `Alle ${lg}-Spiele analysieren`}
                </button>
              </div>
              {leagueMatches.map(match => {
          const pred = predictions[match.id];
          const busy = loading[match.id];
          const lg   = LEAGUES[match.league];
          const cs   = pred ? (CONF_STYLE[pred.confidence] || CONF_STYLE.Low) : null;

          return (
            <div key={match.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.matchInfo}>
                  <span className={styles.leagueBadge}
                    style={{ background: lg.color + "18", color: lg.color, borderColor: lg.color + "44" }}>
                    {lg.flag} {match.league}
                  </span>
                  <div className={styles.teams}>
                    <span>{match.home}</span>
                    <span className={styles.vs}>vs</span>
                    <span>{match.away}</span>
                  </div>
                  <div className={styles.date}>
                    {new Date(match.date).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "short" })}
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
                  <button className={styles.predictBtn} onClick={() => predict(match)} disabled={busy}>
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
          );
        })}
      </div>
    </main>
  );
}
