"use client";
import { useState, useRef } from "react";
import styles from "./page.module.css";

const GROUPS = {
  "WM 2026":          { flag: "🏆", color: "#0a1e6e", competition: "FIFA World Cup 2026" },
  "Premier League":   { flag: "EN", color: "#3d195b", competition: "Premier League" },
  "La Liga":          { flag: "🇪🇸", color: "#ee8707", competition: "La Liga" },
  "Serie A":          { flag: "🇮🇹", color: "#1a56db", competition: "Serie A" },
  "Bundesliga":       { flag: "🇩🇪", color: "#d00",    competition: "Bundesliga" },
  "Ligue 1":          { flag: "🇫🇷", color: "#003189", competition: "Ligue 1" },
  "Champions League": { flag: "⭐", color: "#0a1e6e",  competition: "UEFA Champions League" },
};

const CONF_STYLE = {
  High:   { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7" },
  Medium: { bg: "#fef9c3", color: "#713f12", border: "#fde047" },
  Low:    { bg: "#fee2e2", color: "#7f1d1d", border: "#fca5a5" },
};

// ─── Hilfsfunktion: Dateiname ──────────────────────────────────────────────
function makeFilename(liga, runde) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const safe = (s) => (s || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safe(liga)}-${safe(runde)}-${ts}.json`;
}

export default function Home() {
  const [filter, setFilter]           = useState("WM 2026");
  const [view, setView]               = useState("liga"); // "liga" | "stats"

  // ─── Liga-Daten (manuell geladen) ─────────────────────────────────────
  const [fixtures, setFixtures]       = useState(null);  // { round_label, matches: [...] }
  const [fixturesLoading, setFxLoad]  = useState(false);
  const [teamData, setTeamData]       = useState({});    // { teamName: { matches_played, injuries, ... } }
  const [teamDataLoading, setTdLoad]  = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total }
  const [dataSnapshot, setDataSnapshot] = useState(null); // { liga, runde, loaded_at }

  // ─── Prognosen ────────────────────────────────────────────────────────
  const [predictions, setPredictions] = useState({});
  const [predLoading, setPredLoad]    = useState({});

  // ─── Statistik / Historie ─────────────────────────────────────────────
  const [history, setHistory]         = useState([]);
  const [loadedResultSets, setLoadedResultSets] = useState([]);

  // ─── Refs ─────────────────────────────────────────────────────────────
  const dataFileRef    = useRef(null);
  const histFileRef    = useRef(null);
  const resFileRef     = useRef(null);

  const lg = GROUPS[filter];

  // ══════════════════════════════════════════════════════════════════════
  // SCHRITT 1: Spiele laden
  // ══════════════════════════════════════════════════════════════════════
  async function loadFixtures() {
    setFxLoad(true);
    setFixtures(null);
    setTeamData({});
    setPredictions({});
    try {
      const res = await fetch("/api/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competition: lg.competition }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFixtures({
        round_label: data.round_label || "",
        note: data.note || "",
        matches: (data.matches || []).map((m, i) => ({ ...m, id: `${filter}-${i}` })),
      });
    } catch (e) {
      alert("❌ Fehler beim Laden der Spiele: " + e.message);
    }
    setFxLoad(false);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCHRITT 2: Team-Daten laden
  // ══════════════════════════════════════════════════════════════════════
  async function loadAllTeamData() {
    if (!fixtures?.matches?.length) { alert("Bitte zuerst die Spiele laden (Schritt 1)."); return; }
    const teams = [...new Set(fixtures.matches.flatMap(m => [m.home, m.away]))];
    setBulkProgress({ done: 0, total: teams.length });
    setTdLoad(true);
    const newData = {};
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      try {
        const res = await fetch("/api/teamdata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team, competition: lg.competition }),
        });
        const d = await res.json();
        if (!d.ok) throw new Error(d.error);
        const hasMatches = Array.isArray(d.data.matches_played) && d.data.matches_played.length > 0;
        const tablePos = (d.data.table_position || "").toLowerCase();
        const hasTable = tablePos && !tablePos.includes("keine") && !tablePos.includes("nicht gefunden") && !tablePos.includes("n/a");
        newData[team] = { ...d.data, _incomplete: !hasMatches && !hasTable };
      } catch (e) {
        newData[team] = { team, matches_played: [], table_position: "Fehler", injuries: e.message, notes: "", fetched_at: null, _incomplete: true };
      }
      setBulkProgress({ done: i + 1, total: teams.length });
    }
    setTeamData(newData);
    setTdLoad(false);
    setTimeout(() => setBulkProgress(null), 1000);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCHRITT 3: Daten speichern
  // ══════════════════════════════════════════════════════════════════════
  async function loadSingleTeam(team) {
    const newData = { ...teamData };
    try {
      const res = await fetch("/api/teamdata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, competition: lg.competition }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error);
      const hasMatches = Array.isArray(d.data.matches_played) && d.data.matches_played.length > 0;
      const tablePos = (d.data.table_position || "").toLowerCase();
      const hasTable = tablePos && !tablePos.includes("keine") && !tablePos.includes("nicht gefunden") && !tablePos.includes("n/a");
      newData[team] = { ...d.data, _incomplete: !hasMatches && !hasTable };
      setTeamData(newData);
      if (newData[team]._incomplete) alert(`⚠️ Für ${team} konnten keine ausreichenden Daten gefunden werden.`);
    } catch (e) {
      alert(`❌ Fehler beim Laden von ${team}: ` + e.message);
    }
  }
    if (!fixtures) { alert("Keine Daten zum Speichern vorhanden."); return; }
    const payload = {
      type: "football-predictor-snapshot",
      liga: filter,
      competition: lg.competition,
      round_label: fixtures.round_label,
      saved_at: new Date().toISOString(),
      fixtures,
      teamData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFilename(filter, fixtures.round_label);
    a.click();
    URL.revokeObjectURL(url);
  }

  // ══════════════════════════════════════════════════════════════════════
  // SCHRITT 4: Daten laden
  // ══════════════════════════════════════════════════════════════════════
  function loadData(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!parsed.fixtures || !parsed.teamData) throw new Error("Ungültiges Dateiformat.");
        setFixtures(parsed.fixtures);
        setTeamData(parsed.teamData);
        setPredictions({});
        setDataSnapshot({ liga: parsed.liga, runde: parsed.round_label, loaded_at: new Date().toISOString(), filename: file.name });
        alert(`✅ Daten geladen: ${parsed.liga} · ${parsed.round_label} · ${file.name}`);
      } catch (err) {
        alert("❌ Fehler beim Laden: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ══════════════════════════════════════════════════════════════════════
  // PROGNOSE
  // ══════════════════════════════════════════════════════════════════════
  async function predict(match) {
    const homeData = teamData[match.home] || null;
    const awayData = teamData[match.away] || null;

    if (!homeData || !awayData || homeData._incomplete || awayData._incomplete) {
      const missing = [!homeData || homeData._incomplete ? match.home : null, !awayData || awayData._incomplete ? match.away : null].filter(Boolean).join(", ");
      const go = confirm(`⚠️ Fehlende/unvollständige Daten für: ${missing}.\n\nPrognose trotzdem erstellen? (basiert dann auf allgemeinem Fussballwissen)`);
      if (!go) return;
    }

    setPredLoad(l => ({ ...l, [match.id]: true }));
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: match.home, away: match.away, league: lg.competition, date: match.date, homeData, awayData }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPredictions(p => ({ ...p, [match.id]: data.prediction }));
      const sources = [...new Set([...(homeData?.sources || []), ...(awayData?.sources || [])])];
      setPredictions(p => ({ ...p, [match.id]: { ...data.prediction, sources } }));
      setHistory(h => [...h, {
        id: `${match.id}-${Date.now()}`,
        competition: lg.competition,
        liga: filter,
        round_label: fixtures?.round_label || "",
        home_team: match.home,
        away_team: match.away,
        match_date: match.date,
        predicted_home_score: data.prediction.home_score,
        predicted_away_score: data.prediction.away_score,
        confidence: data.prediction.confidence,
        reasoning: data.prediction.reasoning,
        actual_home_score: null,
        actual_away_score: null,
        resolved: false,
        created_at: new Date().toISOString(),
      }]);
    } catch (e) {
      setPredictions(p => ({ ...p, [match.id]: { home_score: "?", away_score: "?", confidence: "Error", reasoning: "Fehler: " + e.message } }));
    }
    setPredLoad(l => ({ ...l, [match.id]: false }));
  }

  async function predictAll() {
    if (!fixtures?.matches?.length) return;
    for (const m of fixtures.matches) await predict(m);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PDF-EXPORT
  // ══════════════════════════════════════════════════════════════════════
  function exportPdf(competitionFilter) {
    const rows = [...history].filter(h => !competitionFilter || h.competition === competitionFilter).reverse();
    if (!rows.length) { alert("Keine Prognosen zum Exportieren."); return; }
    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/>
<title>Prognosen</title>
<style>
  body{font-family:system-ui,sans-serif;padding:24px;color:#111}
  h1{font-size:18px;margin-bottom:2px}
  .meta{font-size:11px;color:#6b7280;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th,td{border:1px solid #e5e7eb;padding:5px 7px;text-align:left;vertical-align:top}
  th{background:#f3f4f6;font-weight:600}
  tr:nth-child(even){background:#fafafa}
  @media print{@page{size:A4 landscape;margin:12mm}}
</style></head><body>
<h1>⚽ Football Score Predictor – Prognosen${competitionFilter ? ` · ${competitionFilter}` : ""}</h1>
<div class="meta">Erstellt am ${generatedAt} · ${rows.length} Prognosen</div>
<table><thead><tr>
  <th>Erstellt am</th><th>Wettbewerb</th><th>Runde</th><th>Spiel</th>
  <th>Spieldatum</th><th>Prognose</th><th>Resultat</th><th>Confidence</th><th>Begründung</th>
</tr></thead><tbody>
${rows.map(r => `<tr>
  <td>${new Date(r.created_at).toLocaleString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
  <td>${r.competition}</td>
  <td>${r.round_label||"-"}</td>
  <td>${r.home_team} vs ${r.away_team}</td>
  <td>${r.match_date?new Date(r.match_date).toLocaleDateString("de-CH",{day:"2-digit",month:"2-digit",year:"numeric"}):"-"}</td>
  <td style="text-align:center;font-weight:600">${r.predicted_home_score}:${r.predicted_away_score}</td>
  <td style="text-align:center">${r.resolved?`${r.actual_home_score}:${r.actual_away_score}`:"–"}</td>
  <td>${r.confidence}</td>
  <td style="font-size:10px;color:#555">${(r.reasoning||"").replace(/</g,"&lt;")}</td>
</tr>`).join("")}
</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }

  function exportStatsPdf() {
    const resolved = history.filter(h => h.resolved);
    const total = resolved.length;
    const tendency = total ? Math.round(100 * resolved.filter(h => Math.sign(h.predicted_home_score - h.predicted_away_score) === Math.sign(h.actual_home_score - h.actual_away_score)).length / total) : 0;
    const exact = total ? Math.round(100 * resolved.filter(h => h.predicted_home_score === h.actual_home_score && h.predicted_away_score === h.actual_away_score).length / total) : 0;
    const generatedAt = new Date().toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/>
<title>KI-Trefferquote</title>
<style>body{font-family:system-ui,sans-serif;padding:32px;color:#111}h1{font-size:18px;margin-bottom:2px}.meta{font-size:11px;color:#6b7280;margin-bottom:24px}.grid{display:flex;gap:20px;flex-wrap:wrap}.stat{border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;min-width:140px}.num{font-size:32px;font-weight:700}.label{font-size:12px;color:#6b7280;margin-top:4px}@media print{@page{size:A4;margin:16mm}}</style>
</head><body>
<h1>📊 KI-Trefferquote</h1>
<div class="meta">Erstellt am ${generatedAt} · ${history.length} erfasste Prognosen</div>
<div class="grid">
  <div class="stat"><div class="num">${total}</div><div class="label">Ausgewertete Prognosen</div></div>
  <div class="stat"><div class="num" style="color:#059669">${tendency}%</div><div class="label">Tendenz korrekt</div></div>
  <div class="stat"><div class="num" style="color:#1d4ed8">${exact}%</div><div class="label">Exaktes Ergebnis korrekt</div></div>
  <div class="stat"><div class="num" style="color:#9ca3af">${history.length - total}</div><div class="label">Noch offen</div></div>
</div>
</body></html>`;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }

  // ══════════════════════════════════════════════════════════════════════
  // HISTORIE / ABGLEICH
  // ══════════════════════════════════════════════════════════════════════
  function saveHistory() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `prognosen-historie-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function loadHistory(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed)) throw new Error("Kein Array.");
        setHistory(parsed);
        alert(`✅ ${parsed.length} Prognosen geladen.`);
      } catch (err) { alert("❌ Fehler: " + err.message); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  function loadResultsFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.results)) throw new Error("Kein results-Array.");
        setLoadedResultSets(rs => [...rs, { filename: file.name, competition: parsed.competition, results: parsed.results }]);
        alert(`✅ ${parsed.results.length} Resultate geladen (${parsed.competition}).`);
      } catch (err) { alert("❌ Fehler: " + err.message); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  function runLocalResolve() {
    let count = 0;
    setHistory(h => h.map(item => {
      if (item.resolved) return item;
      for (const set of loadedResultSets) {
        const hit = set.results.find(r =>
          r.home?.toLowerCase().trim() === item.home_team?.toLowerCase().trim() &&
          r.away?.toLowerCase().trim() === item.away_team?.toLowerCase().trim()
        );
        if (hit && typeof hit.home_score === "number") {
          count++;
          return { ...item, actual_home_score: hit.home_score, actual_away_score: hit.away_score, resolved: true };
        }
      }
      return item;
    }));
    setTimeout(() => alert(`✅ ${count} Prognosen abgeglichen.`), 100);
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  const resolvedHistory = history.filter(h => h.resolved);
  const stats = {
    total: resolvedHistory.length,
    tendencyPct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => Math.sign(h.predicted_home_score - h.predicted_away_score) === Math.sign(h.actual_home_score - h.actual_away_score)).length / resolvedHistory.length) : 0,
    exactScorePct: resolvedHistory.length ? Math.round(100 * resolvedHistory.filter(h => h.predicted_home_score === h.actual_home_score && h.predicted_away_score === h.actual_away_score).length / resolvedHistory.length) : 0,
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>⚽ Football Score Predictor</h1>
      <p className={styles.subtitle}>Manuelle Datensteuerung · KI-Prognosen · Trefferquote</p>

      {/* ── Liga-Tabs ── */}
      <div className={styles.filters}>
        {Object.keys(GROUPS).map(l => (
          <button key={l} className={`${styles.filterBtn} ${filter === l && view === "liga" ? styles.active : ""}`}
            onClick={() => { setFilter(l); setView("liga"); setFixtures(null); setTeamData({}); setPredictions({}); setDataSnapshot(null); }}>
            {GROUPS[l].flag} {l}
          </button>
        ))}
        <button className={`${styles.filterBtn} ${view === "stats" ? styles.active : ""}`} onClick={() => setView("stats")}>
          📊 KI-Trefferquote
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          LIGA-ANSICHT
      ══════════════════════════════════════════════════════════════ */}
      {view === "liga" && (
        <div className={styles.list}>

          {/* Snapshot-Badge */}
          {dataSnapshot && (
            <div className={styles.snapshotBadge}>
              📄 {dataSnapshot.filename} · {dataSnapshot.liga} · {dataSnapshot.runde}
            </div>
          )}

          {/* ── REIHE 1: Daten-Buttons ── */}
          <div className={styles.btnRow}>
            <button className={styles.btnStep} disabled={fixturesLoading} onClick={loadFixtures}>
              {fixturesLoading ? "⏳ Lade Spiele…" : "1️⃣ Spiele laden"}
            </button>
            <button className={styles.btnStep} disabled={!fixtures || teamDataLoading} onClick={loadAllTeamData}>
              {teamDataLoading ? `⏳ Lade Teams… (${bulkProgress?.done || 0}/${bulkProgress?.total || "?"})` : "2️⃣ Team-Daten laden"}
            </button>
            <button className={styles.btnStep} disabled={!fixtures} onClick={saveData}>
              3️⃣ Daten speichern
            </button>
            <button className={styles.btnStep} onClick={() => dataFileRef.current?.click()}>
              4️⃣ Daten laden
            </button>
            <input ref={dataFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={loadData} />
          </div>

          {/* Fortschrittsbalken */}
          {bulkProgress && (
            <div className={styles.progressBarOuter}>
              <div className={styles.progressBarInner} style={{ width: `${Math.round(100 * bulkProgress.done / bulkProgress.total)}%` }} />
            </div>
          )}

          {/* ── REIHE 2: Analyse-Buttons ── */}
          <div className={styles.btnRow}>
            <button className={styles.btnAction} disabled={!fixtures?.matches?.length || Object.values(predLoading).some(Boolean)}
              onClick={predictAll}>
              ⚡ Alle Spiele dieser Runde analysieren
            </button>
            <button className={styles.btnActionRed} disabled={!history.some(h => h.competition === lg.competition)}
              onClick={() => exportPdf(lg.competition)}>
              🖨️ Prognosen dieser Runde als PDF
            </button>
          </div>

          {/* ── Spielplan-Info ── */}
          {!fixtures && (
            <div className={styles.card} style={{ color: "#9ca3af", textAlign: "center", padding: "32px 16px" }}>
              Drücke <strong>«1️⃣ Spiele laden»</strong> um den Spielplan für {filter} zu holen.
            </div>
          )}

          {fixtures?.note && !fixtures.matches?.length && (
            <div className={styles.card}>{fixtures.note}</div>
          )}

          {/* ── Spielkarten ── */}
          {fixtures?.matches?.map(match => {
            const pred = predictions[match.id];
            const busy = predLoading[match.id];
            const cs   = pred ? (CONF_STYLE[pred.confidence] || CONF_STYLE.Low) : null;
            const homeTd = teamData[match.home];
            const awayTd = teamData[match.away];

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

                    {/* Team-Status-Chips */}
                    <div className={styles.teamDataRow}>
                      {[{ team: match.home, td: homeTd }, { team: match.away, td: awayTd }].map(({ team, td }) => {
                        const needsLoad = !td || td._incomplete;
                        return (
                          <span key={team}
                            className={`${styles.teamDataChip} ${td && !td._incomplete ? styles.teamDataChipOk : td?._incomplete ? styles.teamDataChipWarn : styles.teamDataChipMissing}`}
                            style={{ cursor: needsLoad ? "pointer" : "default" }}
                            onClick={() => needsLoad && loadSingleTeam(team)}
                            title={td && !td._incomplete
                              ? `Tabelle: ${td.table_position}\nSpiele: ${(td.matches_played || []).map(m => `${m.opponent} ${m.score}`).join(", ")}\nAusfälle: ${td.injuries}`
                              : `Klicken um Daten für ${team} nachzuladen`}>
                            {!td ? "❔ " : td._incomplete ? "⚠️ " : "✅ "}{team}{td?.fetched_at ? ` (${td.fetched_at})` : ""}
                            {needsLoad && <span style={{ marginLeft: 4, fontSize: 10 }}>↻ nachladen</span>}
                          </span>
                        );
                      })}
                    </div>

                    {/* Match-History */}
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
                        <span className={styles.confBadge} style={{ background: cs.bg, color: cs.color, borderColor: cs.border }}>
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
      )}

      {/* ══════════════════════════════════════════════════════════════
          STATISTIK-ANSICHT
      ══════════════════════════════════════════════════════════════ */}
      {view === "stats" && (
        <div className={styles.list}>
          <div className={styles.leagueHeader}>
            <span className={styles.leagueTitle}>📊 KI-Trefferquote</span>
          </div>

          {/* Buttons */}
          <div className={styles.btnRow} style={{ flexWrap: "wrap" }}>
            <button className={styles.btnStep} onClick={saveHistory} disabled={!history.length}>⬇️ Historie speichern</button>
            <button className={styles.btnStep} onClick={() => histFileRef.current?.click()}>⬆️ Historie laden</button>
            <button className={styles.btnStep} onClick={() => resFileRef.current?.click()}>⬆️ Resultate laden</button>
            <button className={styles.btnStep} onClick={runLocalResolve} disabled={!loadedResultSets.length}>✅ Lokal abgleichen</button>
            <button className={styles.btnActionRed} onClick={() => exportPdf()} disabled={!history.length}>🖨️ Prognosen als PDF</button>
            <button className={styles.btnActionRed} onClick={exportStatsPdf} disabled={!history.length}>🖨️ Trefferquote als PDF</button>
            <input ref={histFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={loadHistory} />
            <input ref={resFileRef}  type="file" accept="application/json" style={{ display: "none" }} onChange={loadResultsFile} />
          </div>

          {/* Geladene Resultate */}
          {loadedResultSets.length > 0 && (
            <div className={styles.card}>
              <strong style={{ fontSize: 13 }}>Geladene Resultate-Dateien:</strong>
              <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {loadedResultSets.map((s, i) => (
                  <span key={i} className={styles.snapshotBadge}>📄 {s.competition} ({s.results.length} Spiele)</span>
                ))}
              </div>
            </div>
          )}

          {/* Stats-Karte */}
          {history.length > 0 ? (
            <>
              <div className={styles.card}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {[
                    { num: stats.total, label: "Ausgewertete Prognosen", color: "#111827" },
                    { num: `${stats.tendencyPct}%`, label: "Tendenz korrekt", color: "#059669" },
                    { num: `${stats.exactScorePct}%`, label: "Exaktes Ergebnis korrekt", color: "#1d4ed8" },
                    { num: history.length - stats.total, label: "Noch offen", color: "#9ca3af" },
                  ].map(({ num, label, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 28, fontWeight: 700, color }}>{num}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {[...history].reverse().map(r => (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.matchInfo}>
                      <span className={styles.leagueBadge} style={{ background: "#f3f4f6", color: "#374151", borderColor: "#e5e7eb" }}>
                        {r.competition}{r.round_label ? ` · ${r.round_label}` : ""} {r.resolved ? "" : "· offen"}
                      </span>
                      <div className={styles.teams}>
                        <span>{r.home_team}</span><span className={styles.vs}>vs</span><span>{r.away_team}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <div><div style={{ fontSize: 11, color: "#9ca3af" }}>Prognose</div><div style={{ fontWeight: 600 }}>{r.predicted_home_score}:{r.predicted_away_score}</div></div>
                      <div><div style={{ fontSize: 11, color: "#9ca3af" }}>Resultat</div><div style={{ fontWeight: 600 }}>{r.resolved ? `${r.actual_home_score}:${r.actual_away_score}` : "–"}</div></div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div className={styles.card} style={{ color: "#9ca3af", textAlign: "center", padding: "32px 16px" }}>
              Noch keine Prognosen erstellt. Erstelle Prognosen oder lade eine bestehende Historie-Datei hoch.
            </div>
          )}
        </div>
      )}
    </main>
  );
}
