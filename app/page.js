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
  const [teamData, setTeamData]       = useState({}); // { "Arsenal": { table_position, recent_form, injuries, notes, sources, fetched_at } }
  const [teamDataLoading, setTdLoading] = useState({});
  const [snapshotInfo, setSnapshotInfo] = useState(null); // { filename, loaded_at, snapshot_created_at }
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total } | null
  const [resolving, setResolving]     = useState(false);
  const fileInputRef = useRef(null);
  const rawDataInputRef = useRef(null);

  function downloadRawData() {
    const now = new Date().toISOString();
    const payload = {
      type: "football-predictor-raw-data",
      snapshot_created_at: now,
      teamData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = now.slice(0, 19).replace(/[:T]/g, "-");
    a.download = `football-predictor-rohdaten-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function uploadRawData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const td = parsed.teamData && typeof parsed.teamData === "object" ? parsed.teamData : null;
        if (!td) throw new Error("Datei enthält keine gültigen Rohdaten (teamData fehlt).");
        setTeamData(td);
        setSnapshotInfo({
          filename: file.name,
          loaded_at: new Date().toISOString(),
          snapshot_created_at: parsed.snapshot_created_at || null,
        });
      } catch (err) {
        alert("Ungültige Rohdaten-Datei: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function fetchTeamData(team, competition) {
    setTdLoading(l => ({ ...l, [team]: true }));
    try {
      const res = await fetch("/api/teamdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setTeamData(td => ({ ...td, [team]: data.data }));
      setSnapshotInfo(null); // Cache wurde live verändert, ist kein reiner Datei-Snapshot mehr
    } catch (e) {
      setTeamData(td => ({ ...td, [team]: { team, table_position: "Fehler", recent_form: "-", injuries: e.message, notes: "", fetched_at: null } }));
    }
    setTdLoading(l => ({ ...l, [team]: false }));
  }

  async function fetchAllTeamData(matches, competition) {
    const teams = [...new Set(matches.flatMap(m => [m.home, m.away]))];
    setBulkProgress({ done: 0, total: teams.length });
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      if (!teamDataLoading[team]) {
        await fetchTeamData(team, competition);
      }
      setBulkProgress({ done: i + 1, total: teams.length });
    }
    setTimeout(() => setBulkProgress(null), 800); // kurz "fertig" anzeigen, dann ausblenden
  }

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
      const homeData = teamData[match.home] || null;
      const awayData = teamData[match.away] || null;
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: match.home, away: match.away, league: competition, date: match.date, homeData, awayData }),
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
          sources: [...(homeData?.sources || []), ...(awayData?.sources || [])],
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
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#7c3aed" }}>{Object.keys(teamData).length}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Teams im Daten-Cache</div>
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
            <div className={styles.rawDataBar}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className={styles.analyseAllBtn}
                  style={{ background: "#7c3aed" }}
                  disabled={!!bulkProgress}
                  onClick={() => fetchAllTeamData(current.matches, lg2.competition)}
                >
                  {bulkProgress ? `⏳ Lade Daten… (${bulkProgress.done}/${bulkProgress.total})` : "📥 Daten für alle Teams holen"}
                </button>
                <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={downloadRawData} disabled={Object.keys(teamData).length === 0}>
                  ⬇️ Rohdaten speichern
                </button>
                <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={() => rawDataInputRef.current?.click()}>
                  ⬆️ Rohdaten laden
                </button>
                <input ref={rawDataInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadRawData} />
              </div>
              {snapshotInfo && (
                <div className={styles.snapshotBadge}>
                  📄 {snapshotInfo.filename}
                  {snapshotInfo.snapshot_created_at && ` · erstellt ${new Date(snapshotInfo.snapshot_created_at).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
                </div>
              )}
            </div>

            {bulkProgress && (
              <div className={styles.progressBarOuter}>
                <div className={styles.progressBarInner} style={{ width: `${Math.round(100 * bulkProgress.done / bulkProgress.total)}%` }} />
              </div>
            )}

            <button
              className={styles.analyseAllBtn}
              style={{ alignSelf: "flex-start" }}
              disabled={current.matches.some(m => loading[m.id])}
              onClick={() => current.matches.forEach(m => predict(m, filter))}
            >
              ⚡ Alle Spiele dieser Runde analysieren
            </button>

            {current.matches.map(match => {
              const pred = predictions[match.id];
              const busy = loading[match.id];
              const cs   = pred ? (CONF_STYLE[pred.confidence] || CONF_STYLE.Low) : null;
              const homeTd = teamData[match.home];
              const awayTd = teamData[match.away];
              const homeTdLoading = teamDataLoading[match.home];
              const awayTdLoading = teamDataLoading[match.away];

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

                      <div className={styles.teamDataRow}>
                        <span className={`${styles.teamDataChip} ${homeTd ? styles.teamDataChipOk : ""}`}
                          onClick={() => fetchTeamData(match.home, lg2.competition)}
                          title={homeTd ? `Tabelle: ${homeTd.table_position} · Form: ${homeTd.recent_form} · Ausfälle: ${homeTd.injuries} · Stand: ${homeTd.fetched_at || "-"}` : "Klicken, um Daten zu holen"}>
                          {homeTdLoading ? "⏳" : homeTd ? "✅" : "📥"} {match.home}{homeTd?.fetched_at ? ` (${homeTd.fetched_at})` : ""}
                        </span>
                        <span className={`${styles.teamDataChip} ${awayTd ? styles.teamDataChipOk : ""}`}
                          onClick={() => fetchTeamData(match.away, lg2.competition)}
                          title={awayTd ? `Tabelle: ${awayTd.table_position} · Form: ${awayTd.recent_form} · Ausfälle: ${awayTd.injuries} · Stand: ${awayTd.fetched_at || "-"}` : "Klicken, um Daten zu holen"}>
                          {awayTdLoading ? "⏳" : awayTd ? "✅" : "📥"} {match.away}{awayTd?.fetched_at ? ` (${awayTd.fetched_at})` : ""}
                        </span>
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
