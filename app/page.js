"use client";
import { useState, useRef } from "react";
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

function slug(s) {
  return s.toLowerCase().replace(/\s+/g, "");
}

export default function Home() {
  const [filter, setFilter] = useState("WM 2026");
  const [view, setView] = useState("league"); // "league" | "stats"

  // Pro Liga: { results: [...], leagueInfo: { teams: {...}, fetched_at }, fixtures: { round_label, matches } }
  const [leagueState, setLeagueState] = useState({});
  const [busy, setBusy] = useState({}); // { [key]: true } für diverse Ladevorgänge
  const [predictions, setPredictions] = useState({});
  const [predLoading, setPredLoading] = useState({});
  const [history, setHistory] = useState([]);
  const [loadedResultSets, setLoadedResultSets] = useState([]);

  const resultsFileRef = useRef(null);
  const leagueInfoFileRef = useRef(null);
  const historyFileRef = useRef(null);
  const resolveFileRef = useRef(null);

  const lg = GROUPS[filter];
  const st = leagueState[filter] || {};

  function setSt(groupKey, patch) {
    setLeagueState(s => ({ ...s, [groupKey]: { ...(s[groupKey] || {}), ...patch } }));
  }
  function setBusyKey(key, val) {
    setBusy(b => ({ ...b, [key]: val }));
  }

  // ---------- SCHRITT 1: ERGEBNISSE ----------

  async function fetchResultsOnline(groupKey) {
    setBusyKey(`results-${groupKey}`, true);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: GROUPS[groupKey].competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      mergeResults(groupKey, data.results || [], data.stage_label || "");
    } catch (e) {
      alert("Fehler beim Laden der Ergebnisse: " + e.message);
    }
    setBusyKey(`results-${groupKey}`, false);
  }

  function mergeResults(groupKey, newResults, stageLabel) {
    setLeagueState(s => {
      const existing = s[groupKey]?.results || [];
      const merged = [...existing];
      for (const r of newResults) {
        const exists = merged.some(e => e.home === r.home && e.away === r.away && e.date?.slice(0, 10) === r.date?.slice(0, 10));
        if (!exists) merged.push(r);
      }
      return { ...s, [groupKey]: { ...(s[groupKey] || {}), results: merged, stage_label: stageLabel || s[groupKey]?.stage_label || "" } };
    });
  }

  function uploadResultsFile(e, groupKey) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.results)) throw new Error("Datei enthält kein gültiges 'results'-Array.");
        mergeResults(groupKey, parsed.results, parsed.stage_label);
      } catch (err) {
        alert("Ungültige Ergebnis-Datei: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function downloadResultsDb(groupKey) {
    const data = leagueState[groupKey];
    if (!data?.results?.length) return;
    const payload = { type: "football-predictor-results-db", competition: GROUPS[groupKey].competition, stage_label: data.stage_label, saved_at: new Date().toISOString(), results: data.results };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ergebnisse_${slug(groupKey)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function archiveAndResetResults(groupKey) {
    const data = leagueState[groupKey];
    if (data?.results?.length) {
      const payload = { type: "football-predictor-results-archive", competition: GROUPS[groupKey].competition, archived_at: new Date().toISOString(), results: data.results };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `ergebnisse_${slug(groupKey)}_archiv_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setSt(groupKey, { results: [], stage_label: "" });
    alert("Archiv wurde heruntergeladen. Die Ergebnis-Datenbank für " + groupKey + " ist jetzt leer für die neue Saison.");
  }

  // ---------- SCHRITT 2: LIGA-INFOS ----------

  async function fetchLeagueInfoOnline(groupKey) {
    const teams = [...new Set((st.fixtures?.matches || []).flatMap(m => [m.home, m.away]))];
    if (teams.length === 0) {
      alert("Bitte zuerst die anstehenden Spiele laden (Schritt 3), damit bekannt ist, welche Teams gebraucht werden — oder lade die Liga-Infos aus einer Datei.");
      return;
    }
    setBusyKey(`leagueinfo-${groupKey}`, true);
    try {
      const res = await fetch("/api/leagueinfo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: GROUPS[groupKey].competition, teams }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSt(groupKey, { leagueInfo: { teams: data.teams || {}, sources: data.sources || [], fetched_at: data.fetched_at } });
    } catch (e) {
      alert("Fehler beim Laden der Liga-Infos: " + e.message);
    }
    setBusyKey(`leagueinfo-${groupKey}`, false);
  }

  function downloadLeagueInfo(groupKey) {
    const data = leagueState[groupKey]?.leagueInfo;
    if (!data) return;
    const payload = { type: "football-predictor-leagueinfo", competition: GROUPS[groupKey].competition, ...data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `liga-infos_${slug(groupKey)}_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function uploadLeagueInfoFile(e, groupKey) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.teams) throw new Error("Datei enthält keine 'teams'-Daten.");
        setSt(groupKey, { leagueInfo: { teams: parsed.teams, sources: parsed.sources || [], fetched_at: parsed.fetched_at } });
      } catch (err) {
        alert("Ungültige Liga-Infos-Datei: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ---------- SCHRITT 3: ANSTEHENDE SPIELE ----------

  async function fetchFixtures(groupKey) {
    setBusyKey(`fixtures-${groupKey}`, true);
    try {
      const res = await fetch("/api/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: GROUPS[groupKey].competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setSt(groupKey, {
        fixtures: {
          round_label: data.round_label || "",
          note: data.note || "",
          matches: (data.matches || []).map((m, i) => ({ ...m, id: `${groupKey}-${i}` })),
        },
      });
    } catch (e) {
      setSt(groupKey, { fixtures: { round_label: "", note: "Fehler: " + e.message, matches: [] } });
    }
    setBusyKey(`fixtures-${groupKey}`, false);
  }

  // ---------- SCHRITT 4: ANALYSE ----------

  async function predict(match, groupKey) {
    setPredLoading(l => ({ ...l, [match.id]: true }));
    try {
      const competition = GROUPS[groupKey].competition;
      const leagueInfo = leagueState[groupKey]?.leagueInfo?.teams || {};
      const results = leagueState[groupKey]?.results || [];
      const homeData = leagueInfo[match.home] || null;
      const awayData = leagueInfo[match.away] || null;

      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: match.home, away: match.away, league: competition, date: match.date,
          homeData, awayData,
          homeResults: results, awayResults: results,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPredictions(p => ({ ...p, [match.id]: data.prediction }));

      setHistory(h => [
        ...h,
        {
          id: `${groupKey}-${match.home}-${match.away}-${match.date}-${Date.now()}`,
          competition, home_team: match.home, away_team: match.away, match_date: match.date,
          predicted_home_score: data.prediction.home_score,
          predicted_away_score: data.prediction.away_score,
          confidence: data.prediction.confidence,
          reasoning: data.prediction.reasoning,
          actual_home_score: null, actual_away_score: null, resolved: false,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (e) {
      setPredictions(p => ({ ...p, [match.id]: { home_score: "?", away_score: "?", confidence: "Error", reasoning: "Fehler: " + e.message } }));
    }
    setPredLoading(l => ({ ...l, [match.id]: false }));
  }

  // ---------- STATISTIK-TAB ----------

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

  function uploadResolveFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.results)) throw new Error("Datei enthält keine Resultate.");
        setLoadedResultSets(rs => [...rs, { filename: file.name, competition: parsed.competition || "?", results: parsed.results }]);
      } catch (err) {
        alert("Ungültige Datei: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function runLocalResolve() {
    let matched = 0;
    setHistory(h => h.map(item => {
      if (item.resolved) return item;
      for (const set of loadedResultSets) {
        const hit = set.results.find(r => r.home?.toLowerCase().trim() === item.home_team?.toLowerCase().trim() && r.away?.toLowerCase().trim() === item.away_team?.toLowerCase().trim());
        if (hit && typeof hit.home_score === "number") {
          matched++;
          return { ...item, actual_home_score: hit.home_score, actual_away_score: hit.away_score, resolved: true };
        }
      }
      return item;
    }));
    if (matched === 0) alert("Keine passenden Resultate gefunden.");
  }

  const resolvedHistory = history.filter(h => h.resolved);
  const stats = {
    total: resolvedHistory.length,
    exactScorePct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => h.predicted_home_score === h.actual_home_score && h.predicted_away_score === h.actual_away_score).length / resolvedHistory.length) : 0,
    tendencyPct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => Math.sign(h.predicted_home_score - h.predicted_away_score) === Math.sign(h.actual_home_score - h.actual_away_score)).length / resolvedHistory.length) : 0,
  };

  function exportPdf(filterCompetition) {
    const filtered = filterCompetition ? history.filter(r => r.competition === filterCompetition) : history;
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
      </tr>`).join("");
    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8" /><title>Prognosen</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111827;} h1{font-size:20px;margin-bottom:2px;}
      .meta{font-size:12px;color:#6b7280;margin-bottom:20px;} table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;} th{background:#f3f4f6;font-weight:600;}
      tr:nth-child(even){background:#fafafa;} @media print{@page{size:A4 landscape;margin:14mm;}}
      </style></head><body>
      <h1>⚽ Football Score Predictor – Prognosen-Übersicht</h1>
      <div class="meta">Erstellt am ${generatedAt}${filterCompetition ? ` · ${filterCompetition}` : ""} · ${filtered.length} Prognosen</div>
      <table><thead><tr><th>Erstellt am</th><th>Wettbewerb</th><th>Spiel</th><th>Spieldatum</th><th>Prognose</th><th>Resultat</th><th>Confidence</th><th>Begründung</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  function exportStatsPdf() {
    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const open = history.length - stats.total;
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8" /><title>Trefferquote</title><style>
      body{font-family:system-ui,sans-serif;padding:32px;color:#111827;} h1{font-size:20px;margin-bottom:2px;}
      .meta{font-size:12px;color:#6b7280;margin-bottom:28px;} .grid{display:flex;gap:24px;margin-bottom:24px;}
      .stat{border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;flex:1;} .stat .num{font-size:32px;font-weight:700;}
      .stat .label{font-size:12px;color:#6b7280;margin-top:4px;} @media print{@page{size:A4 portrait;margin:16mm;}}
      </style></head><body>
      <h1>📊 Football Score Predictor – KI-Trefferquote</h1>
      <div class="meta">Erstellt am ${generatedAt} · basierend auf ${history.length} erfassten Prognosen</div>
      <div class="grid">
        <div class="stat"><div class="num">${stats.total}</div><div class="label">Ausgewertete Prognosen</div></div>
        <div class="stat"><div class="num" style="color:#059669">${stats.tendencyPct}%</div><div class="label">Tendenz korrekt</div></div>
        <div class="stat"><div class="num" style="color:#1d4ed8">${stats.exactScorePct}%</div><div class="label">Exaktes Ergebnis korrekt</div></div>
        <div class="stat"><div class="num" style="color:#9ca3af">${open}</div><div class="label">Noch offen</div></div>
      </div></body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // ---------- RENDER ----------

  const hasResults = (st.results || []).length > 0;
  const hasLeagueInfo = !!st.leagueInfo;
  const hasFixtures = !!st.fixtures;

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>⚽ Football Score Predictor</h1>
      <p className={styles.subtitle}>Schrittweise: Ergebnisse → Liga-Infos → Anstehende Spiele → Analyse</p>

      <div className={styles.filters}>
        {Object.keys(GROUPS).map(l => (
          <button key={l} className={`${styles.filterBtn} ${filter === l && view !== "stats" ? styles.active : ""}`}
            onClick={() => { setFilter(l); setView("league"); }}>
            {GROUPS[l].flag} {l}
          </button>
        ))}
        <button className={`${styles.filterBtn} ${view === "stats" ? styles.active : ""}`} onClick={() => setView("stats")}>
          📊 KI-Trefferquote
        </button>
      </div>

      {view === "stats" ? (
        <div className={styles.list}>
          <div className={styles.leagueHeader}>
            <span className={styles.leagueTitle}>📊 KI-Trefferquote (alle Ligen)</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={styles.analyseAllBtn} onClick={() => resolveFileRef.current?.click()}>⬆️ Resultate-Datei laden</button>
              <button className={styles.analyseAllBtn} disabled={loadedResultSets.length === 0} onClick={runLocalResolve}>✅ Lokal abgleichen</button>
              <input ref={resolveFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadResolveFile} />
              <button className={styles.analyseAllBtn} onClick={downloadHistory}>⬇️ Historie herunterladen</button>
              <button className={styles.analyseAllBtn} style={{ background: "#b91c1c" }} onClick={exportStatsPdf} disabled={history.length === 0}>🖨️ Trefferquote als PDF</button>
              <button className={styles.analyseAllBtn} onClick={() => historyFileRef.current?.click()}>⬆️ Historie hochladen</button>
              <input ref={historyFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={uploadHistory} />
            </div>
          </div>

          {loadedResultSets.length > 0 && (
            <div className={styles.card} style={{ fontSize: 12, color: "#6b7280" }}>
              Geladene Resultate: {loadedResultSets.map((s, i) => (
                <span key={i} className={styles.snapshotBadge} style={{ marginLeft: 6 }}>📄 {s.competition} ({s.results.length})</span>
              ))}
            </div>
          )}

          {history.length === 0 && <div className={styles.card}>Noch keine Prognosen erstellt.</div>}

          {history.length > 0 && (
            <>
              <div className={styles.card}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div><div style={{ fontSize: 28, fontWeight: 700 }}>{stats.total}</div><div style={{ fontSize: 12, color: "#6b7280" }}>Ausgewertete Prognosen</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: "#059669" }}>{stats.tendencyPct}%</div><div style={{ fontSize: 12, color: "#6b7280" }}>Tendenz korrekt</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: "#1d4ed8" }}>{stats.exactScorePct}%</div><div style={{ fontSize: 12, color: "#6b7280" }}>Exaktes Ergebnis korrekt</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 700, color: "#9ca3af" }}>{history.length - stats.total}</div><div style={{ fontSize: 12, color: "#6b7280" }}>Noch offen</div></div>
                </div>
              </div>
              {[...history].reverse().map(r => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.matchInfo}>
                      <span className={styles.leagueBadge} style={{ background: "#f3f4f6", color: "#374151", borderColor: "#e5e7eb" }}>{r.competition} {r.resolved ? "" : "· offen"}</span>
                      <div className={styles.teams}><span>{r.home_team}</span><span className={styles.vs}>vs</span><span>{r.away_team}</span></div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div><div style={{ fontSize: 11, color: "#9ca3af" }}>Prognose</div><div style={{ fontWeight: 600 }}>{r.predicted_home_score}:{r.predicted_away_score}</div></div>
                      <div><div style={{ fontSize: 11, color: "#9ca3af" }}>Resultat</div><div style={{ fontWeight: 600 }}>{r.resolved ? `${r.actual_home_score}:${r.actual_away_score}` : "–"}</div></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className={styles.list}>

          {/* SCHRITT 1: ERGEBNISSE */}
          <div className={styles.stepCard}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>1</span>
              <span className={styles.stepTitle}>Ergebnisse {hasResults && <span className={styles.stepDone}>✓ {st.results.length} Spiele gespeichert</span>}</span>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.analyseAllBtn} disabled={busy[`results-${filter}`]} onClick={() => fetchResultsOnline(filter)}>
                {busy[`results-${filter}`] ? "⏳ Lade…" : "🌐 Ergebnisse aus Internet holen"}
              </button>
              <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={() => resultsFileRef.current?.click()}>⬆️ Aus Datei laden</button>
              <input ref={resultsFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => uploadResultsFile(e, filter)} />
              {hasResults && (
                <>
                  <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={() => downloadResultsDb(filter)}>⬇️ Ergebnis-DB speichern</button>
                  <button className={styles.analyseAllBtn} style={{ background: "#b91c1c" }} onClick={() => archiveAndResetResults(filter)}>📦 Archivieren &amp; neu starten</button>
                </>
              )}
            </div>
          </div>

          {/* SCHRITT 2: LIGA-INFOS */}
          <div className={styles.stepCard} style={{ opacity: hasResults ? 1 : 0.45 }}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>2</span>
              <span className={styles.stepTitle}>Liga-Infos {hasLeagueInfo && <span className={styles.stepDone}>✓ Stand {st.leagueInfo.fetched_at}</span>}</span>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.analyseAllBtn} disabled={!hasResults || busy[`leagueinfo-${filter}`]} onClick={() => fetchLeagueInfoOnline(filter)}>
                {busy[`leagueinfo-${filter}`] ? "⏳ Lade…" : "🌐 Liga-Infos herunterladen"}
              </button>
              <button className={styles.analyseAllBtn} style={{ background: "#374151" }} disabled={!hasResults} onClick={() => leagueInfoFileRef.current?.click()}>⬆️ Aus Datei laden</button>
              <input ref={leagueInfoFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => uploadLeagueInfoFile(e, filter)} />
              {hasLeagueInfo && (
                <button className={styles.analyseAllBtn} style={{ background: "#374151" }} onClick={() => downloadLeagueInfo(filter)}>⬇️ Liga-Infos speichern</button>
              )}
            </div>
          </div>

          {/* SCHRITT 3: ANSTEHENDE SPIELE */}
          <div className={styles.stepCard} style={{ opacity: hasLeagueInfo ? 1 : 0.45 }}>
            <div className={styles.stepHeader}>
              <span className={styles.stepBadge}>3</span>
              <span className={styles.stepTitle}>Anstehende Spiele {hasFixtures && <span className={styles.stepDone}>✓ {st.fixtures.round_label || "geladen"}</span>}</span>
            </div>
            <div className={styles.stepActions}>
              <button className={styles.analyseAllBtn} disabled={!hasLeagueInfo || busy[`fixtures-${filter}`]} onClick={() => fetchFixtures(filter)}>
                {busy[`fixtures-${filter}`] ? "⏳ Lade…" : "📅 Anstehende Spiele laden"}
              </button>
            </div>
            {st.fixtures?.note && st.fixtures.matches.length === 0 && (
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>{st.fixtures.note}</div>
            )}
          </div>

          {/* SCHRITT 4: ANALYSE */}
          {hasFixtures && st.fixtures.matches.length > 0 && (
            <div className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepBadge}>4</span>
                <span className={styles.stepTitle}>Analyse</span>
              </div>
              <div className={styles.stepActions}>
                <button className={styles.analyseAllBtn} disabled={st.fixtures.matches.some(m => predLoading[m.id])}
                  onClick={() => st.fixtures.matches.forEach(m => predict(m, filter))}>
                  ⚡ Alle Spiele dieser Runde analysieren
                </button>
                <button className={styles.analyseAllBtn} style={{ background: "#b91c1c" }}
                  onClick={() => exportPdf(lg.competition)} disabled={!st.fixtures.matches.some(m => predictions[m.id])}>
                  🖨️ Prognosen dieser Runde als PDF
                </button>
              </div>

              <div className={styles.list} style={{ marginTop: 12 }}>
                {st.fixtures.matches.map(match => {
                  const pred = predictions[match.id];
                  const isLoading = predLoading[match.id];
                  const cs = pred ? (CONF_STYLE[pred.confidence] || CONF_STYLE.Low) : null;
                  return (
                    <div key={match.id} className={styles.card}>
                      <div className={styles.cardTop}>
                        <div className={styles.matchInfo}>
                          <div className={styles.teams}><span>{match.home}</span><span className={styles.vs}>vs</span><span>{match.away}</span></div>
                          <div className={styles.date}>{match.date ? new Date(match.date).toLocaleString("de-CH", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>
                        </div>
                        <div className={styles.right}>
                          {pred && (
                            <div className={styles.scoreBox}>
                              <span className={styles.scoreNum}>{pred.home_score}</span><span className={styles.scoreSep}>:</span><span className={styles.scoreNum}>{pred.away_score}</span>
                              <span className={styles.confBadge} style={{ background: cs.bg, color: cs.color, borderColor: cs.border }}>{pred.confidence}</span>
                            </div>
                          )}
                          <button className={styles.predictBtn} onClick={() => predict(match, filter)} disabled={isLoading}>
                            {isLoading ? "Analysiere…" : pred ? "Neu analysieren" : "Prognose"}
                          </button>
                        </div>
                      </div>
                      {pred?.reasoning && <div className={styles.reasoning}>{pred.reasoning}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
