import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Holt die tatsächlichen, einzelnen Spielresultate eines Teams in der laufenden Saison/im laufenden Turnier,
// plus aktuelle Verletzungen/Sperren. Liefert Rohdaten statt einer geratenen Zusammenfassung.
export async function POST(request) {
  const { team, competition } = await request.json();
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Today's date is ${today}. Research the football team "${team}" in the context of "${competition}".

Search the web (use as many searches as needed, but be efficient — aim for 3-5) to find:

1. ALL matches this team has played in the CURRENT season/tournament so far (e.g. for a World Cup: all group stage matches; for a league: all matches since the season started). List each match individually with date, opponent, and final score. If the team has played 0 matches so far in this competition, say so explicitly — do not invent matches.

2. Current table position / group standing, if applicable (e.g. "2nd in Group A, 4 points" or "5th in Premier League, 32 points").

3. Currently known injuries or suspensions affecting the squad RIGHT NOW (name specific players if known). If none are reported, say "Keine bekannten Ausfälle gemeldet" — do not guess.

4. Any other notable current factor (manager change, momentum, key returning player), if relevant.

Be factually careful: if you cannot find reliable information for a category, say so explicitly rather than guessing or leaving it vague.

Respond ONLY with raw JSON, no markdown, no backticks:
{
  "team": "${team}",
  "matches_played": [
    { "date": "<YYYY-MM-DD>", "opponent": "<team name>", "score": "<e.g. '2:1' from this team's perspective, home/away noted in 'home_away'>", "home_away": "<'Heim'|'Auswärts'>" }
  ],
  "table_position": "<short text, or 'Keine Tabellendaten gefunden'>",
  "injuries": "<short text, specific players if known, or 'Keine bekannten Ausfälle gemeldet'>",
  "notes": "<1 short sentence with other relevant current factor, or empty string>",
  "sources": ["<domain of each source actually used>"],
  "fetched_at": "${today}"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text block in response");

    let raw = textBlock.text.trim().replace(/```json|```/g, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in model response");

    const parsed = JSON.parse(jsonMatch[0]);

    // Validierung: Fehlt das Wichtigste, ist es ein Fehler — kein "leeres Erfolgsergebnis"
    if (!parsed.team || !Array.isArray(parsed.matches_played)) {
      throw new Error("Unvollständige Daten von der KI erhalten");
    }

    return Response.json({ ok: true, data: parsed });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
