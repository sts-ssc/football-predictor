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
  const [loadedResultSets, setLoadedResultSets] = useState([]); // [{ filename, competition, results, loaded_at }]
  const fileInputRef = useRef(null);
  const rawDataInputRef = useRef(null);
  const resultsInputRef = useRef(null);

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

  function exportPdf(filterCompetition = null) {
    const filtered = filterCompetition ? history.filter(h => h.competition === filterCompetition) : history;
    const rows = [...filtered].reverse().map(r => `
      <tr>
        <td>${new Date(r.created_at).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
        <td>${r.competition}</td>
        <td>${r.home_team} vs ${r.away_team}</td>
        <td>${r.match_date ? new Date(r.match_date).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "-"}</td>
        <td style="text-align:center;font-weight:600;">${r.predicted_home_score}:${r.predicted_away_score}</td>
        <td style="text-align:center;">${r.resolved ? `${r.actual_home_score}:${r.actual_away_score}` : "–"}</td>
        <td>${r.confidence}</td>
        <td style="font-size:11px;color:#555;">${(r.reasoning || "").replace(/</g, "&lt;")}</td>
      </tr>
    `).join("");

    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

    const html = `
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Football Score Predictor – Prognosen</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 24px; color: #111827; }
          h1 { font-size: 20px; margin-bottom: 2px; }
          .meta { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 600; }
          tr:nth-child(even) { background: #fafafa; }
          @media print {
            @page { size: A4 landscape; margin: 14mm; }
          }
        </style>
      </head>
      <body>
        <h1>⚽ Football Score Predictor – Prognosen-Übersicht</h1>
        <div class="meta">Erstellt am ${generatedAt} · ${filtered.length} Prognose${filtered.length === 1 ? "" : "n"}${filterCompetition ? ` · ${filterCompetition}` : " · alle Wettbewerbe"}</div>
        <table>
          <thead>
            <tr>
              <th>Prognose erstellt am</th>
              <th>Wettbewerb</th>
              <th>Spiel</th>
              <th>Spieldatum</th>
              <th>Prognose</th>
              <th>Resultat</th>
              <th>Confidence</th>
              <th>Begründung</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function exportStatsPdf() {
    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const open = history.length - stats.total;

    const html = `
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Football Score Predictor – KI-Trefferquote</title>
        <style>
          body { font-family: system-ui, sans-serif; padding: 32px; color: #111827; }
          h1 { font-size: 20px; margin-bottom: 2px; }
          .meta { font-size: 12px; color: #6b7280; margin-bottom: 28px; }
          .grid { display: flex; gap: 24px; margin-bottom: 24px; }
          .stat { border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; flex: 1; }
          .stat .num { font-size: 32px; font-weight: 700; }
          .stat .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
          @media print { @page { size: A4 portrait; margin: 16mm; } }
        </style>
      </head>
      <body>
        <h1>📊 Football Score Predictor – KI-Trefferquote</h1>
        <div class="meta">Erstellt am ${generatedAt} · basierend auf ${history.length} erfassten Prognosen</div>
        <div class="grid">
          <div class="stat"><div class="num">${stats.total}</div><div class="label">Ausgewertete Prognosen</div></div>
          <div class="stat"><div class="num" style="color:#059669">${stats.tendencyPct}%</div><div class="label">Tendenz korrekt</div></div>
          <div class="stat"><div class="num" style="color:#1d4ed8">${stats.exactScorePct}%</div><div class="label">Exaktes Ergebnis korrekt</div></div>
          <div class="stat"><div class="num" style="color:#9ca3af">${open}</div><div class="label">Noch offen</div></div>
        </div>
      </body>
      </html>
    `;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
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

  function downloadResults(groupKey) {
    const data = results[groupKey];
    if (!data) return;
    const payload = { type: "football-predictor-results", competition: GROUPS[groupKey].competition, stage_label: data.stage_label, downloaded_at: new Date().toISOString(), results: data.results };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `football-predictor-resultate-${groupKey.replace(/\s+/g, "_")}-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function uploadResults(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.results)) throw new Error("Datei enthält kein 'results'-Array.");
        setLoadedResultSets(rs => [...rs, { filename: file.name, competition: parsed.competition || "Unbekannt", results: parsed.results, loaded_at: new Date().toISOString() }]);
        alert(`✅ Resultate-Datei geladen: ${parsed.competition || "Unbekannt"} mit ${parsed.results.length} Spielen.`);
      } catch (err) {
        alert("❌ Fehler beim Laden der Resultate-Datei: " + err.message);
      }
    };
    reader.onerror = () => alert("❌ Datei konnte nicht gelesen werden.");
    reader.readAsText(file);
    e.target.value = "";
  }

  // Gleicht offene Prognosen gegen alle hochgeladenen Resultat-Sets ab — ohne KI-Aufruf.
  function runLocalResolve() {
    let matchedCount = 0;
    setHistory(h => h.map(item => {
      if (item.resolved) return item;
      for (const set of loadedResultSets) {
        const hit = set.results.find(r =>
          r.home?.toLowerCase().trim() === item.home_team?.toLowerCase().trim() &&
          r.away?.toLowerCase().trim() === item.away_team?.toLowerCase().trim()
        );
        if (hit && typeof hit.home_score === "number" && typeof hit.away_score === "number") {
          matchedCount++;
          return { ...item, actual_home_score: hit.home_score, actual_away_score: hit.away_score, resolved: true };
        }
      }
      return item;
    }));
    if (matchedCount === 0) alert("Keine passenden Resultate in den geladenen Dateien gefunden.");
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
              <button className={styles.analyseAllBtn} onClick={() => resultsInputRef.current?.click()}>
                ⬆️ Resultate-Datei laden
              </button>
              <button className={styles.analyseAllBtn} disabled={loadedResultSets.length === 0} onClick={runLocalResolve}>
                ✅ Lokal abgleichen
              </button>
              <input ref={resultsInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadResults} />
              <button className={styles.analyseAllBtn} onClick={downloadHistory}>
                ⬇️ Historie herunterladen
              </button>
              <button className={styles.analyseAllBtn} style={{ background: "#b91c1c" }} onClick={() => exportPdf()} disabled={history.length === 0}>
                🖨️ Prognosen als PDF
              </button>
              <button className={styles.analyseAllBtn} style={{ background: "#b91c1c" }} onClick={exportStatsPdf} disabled={history.length === 0}>
                🖨️ Trefferquote als PDF
              </button>
              <button className={styles.analyseAllBtn} onClick={() => fileInputRef.current?.click()}>
                ⬆️ Historie hochladen
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadHistory} />
            </div>
          </div>

          {loadedResultSets.length > 0 ? (
            <div className={styles.card}>
              <strong style={{ fontSize: 13 }}>Geladene Resultate-Dateien ({loadedResultSets.length}):</strong>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {loadedResultSets.map((s, i) => (
                  <span key={i} className={styles.snapshotBadge}>📄 {s.competition} ({s.results.length} Spiele)</span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.card} style={{ color: "#9ca3af", fontSize: 13 }}>
              Noch keine Resultate-Dateien geladen. Lade zuerst über «⬆️ Resultate-Datei laden» eine Datei hoch (zuvor im «Ergebnisse»-Tab einer Liga mit «⬇️ Resultate speichern» erzeugt).
            </div>
          )}

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
          {view === "results" && currentResults && currentResults.results.length > 0 && (
            <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={() => downloadResults(filter)}>
              ⬇️ Resultate speichern
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className={styles.analyseAllBtn}
                disabled={current.matches.some(m => loading[m.id])}
                onClick={() => current.matches.forEach(m => predict(m, filter))}
              >
                ⚡ Alle Spiele dieser Runde analysieren
              </button>
              <button
                className={styles.analyseAllBtn}
                style={{ background: "#b91c1c" }}
                disabled={!history.some(h => h.competition === lg2.competition)}
                onClick={() => exportPdf(lg2.competition)}
              >
                🖨️ Prognosen dieser Liga als PDF
              </button>
            </div>

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
                        <span className={`${styles.teamDataChip} ${homeTd && !homeTd._incomplete ? styles.teamDataChipOk : homeTd?._incomplete ? styles.teamDataChipWarn : ""}`}
                          onClick={() => fetchTeamData(match.home, lg2.competition)}
                          title={homeTd ? `Tabelle: ${homeTd.table_position}\nSpiele: ${(homeTd.matches_played || []).map(m => `${m.opponent} ${m.score}`).join(", ") || "keine"}\nAusfälle: ${homeTd.injuries}\nStand: ${homeTd.fetched_at || "-"}` : "Klicken, um Daten zu holen"}>
                          {homeTdLoading ? "⏳" : homeTd?._incomplete ? "⚠️" : homeTd ? "✅" : "📥"} {match.home}{homeTd?.fetched_at ? ` (${homeTd.fetched_at})` : ""}
                        </span>
                        <span className={`${styles.teamDataChip} ${awayTd && !awayTd._incomplete ? styles.teamDataChipOk : awayTd?._incomplete ? styles.teamDataChipWarn : ""}`}
                          onClick={() => fetchTeamData(match.away, lg2.competition)}
                          title={awayTd ? `Tabelle: ${awayTd.table_position}\nSpiele: ${(awayTd.matches_played || []).map(m => `${m.opponent} ${m.score}`).join(", ") || "keine"}\nAusfälle: ${awayTd.injuries}\nStand: ${awayTd.fetched_at || "-"}` : "Klicken, um Daten zu holen"}>
                          {awayTdLoading ? "⏳" : awayTd?._incomplete ? "⚠️" : awayTd ? "✅" : "📥"} {match.away}{awayTd?.fetched_at ? ` (${awayTd.fetched_at})` : ""}
                        </span>
                      </div>

                      {(homeTd?.matches_played?.length > 0 || awayTd?.matches_played?.length > 0) && (
                        <div className={styles.matchHistory}>
                          {homeTd?.matches_played?.length > 0 && (
                            <div><strong>{match.home}:</strong> {homeTd.matches_played.map(m => `${m.opponent} ${m.score}`).join(" · ")}</div>
                          )}
                          {awayTd?.matches_played?.length > 0 && (
                            <div><strong>{match.away}:</strong> {awayTd.matches_played.map(m => `${m.opponent} ${m.score}`).join(" · ")}</div>
                          )}
                        </div>
                      )}
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
