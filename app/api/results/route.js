import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WORLDCUP_JSON_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// Für die WM 2026: direkte, kostenlose, strukturierte Datenquelle (kein KI-Aufruf nötig).
async function fetchWorldCupResults() {
  const res = await fetch(WORLDCUP_JSON_URL);
  if (!res.ok) throw new Error("openfootball-Datenquelle nicht erreichbar (" + res.status + ")");
  const data = await res.json();

  const results = (data.matches || [])
    .filter(m => m.score && m.score.ft) // nur Spiele mit Endresultat
    .map(m => ({
      home: m.team1,
      away: m.team2,
      home_score: m.score.ft[0],
      away_score: m.score.ft[1],
      date: m.date ? `${m.date}T00:00:00Z` : null,
    }));

  return { stage_label: "Gruppenphase / Turnierverlauf (openfootball.org)", results };
}

export async function POST(request) {
  const { competition } = await request.json();

  // WM 2026: direkte, vollständige, kostenlose Quelle nutzen statt KI-Suche
  if (competition === "FIFA World Cup 2026") {
    try {
      const data = await fetchWorldCupResults();
      return Response.json({ ok: true, ...data });
    } catch (err) {
      console.error("openfootball fetch failed, falling back to AI search:", err);
      // Fällt unten durch zur KI-Suche als Fallback
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Today's date is ${today}. Find the most recently COMPLETED matches (with final scores) for: ${competition}.

Use web search to find up to 20 of the most recent finished matches (already played, with confirmed final scores) for "${competition}", ordered most recent first.

Respond ONLY with raw JSON, no markdown, no backticks, no explanation:
{
  "stage_label": "<e.g. 'Gruppenphase', 'Spieltag 34'>",
  "results": [
    { "home": "<team>", "away": "<team>", "home_score": <number>, "away_score": <number>, "date": "<ISO 8601 UTC>" }
  ]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text block in response");

    let raw = textBlock.text.trim().replace(/```json|```/g, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json({ ok: true, ...parsed });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
