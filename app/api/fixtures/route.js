import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COMPETITION_HINTS = {
  "FIFA World Cup 2026": "FIFA World Cup 2026 next round fixtures (Round of 16, Quarter-finals, Semi-finals, or Final depending on tournament stage)",
  "Premier League": "Premier League next matchday fixtures",
  "La Liga": "La Liga next matchday fixtures",
  "Serie A": "Serie A next matchday fixtures",
  "Bundesliga": "Bundesliga next matchday fixtures",
  "Ligue 1": "Ligue 1 next matchday fixtures",
  "UEFA Champions League": "UEFA Champions League next matchday fixtures (league phase or knockout round depending on current stage)",
};

export async function POST(request) {
  const { competition } = await request.json();
  const hint = COMPETITION_HINTS[competition] || `${competition} next fixtures`;

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Today's date is ${today}. Find the matches for: ${hint}.

Use web search to find the CONFIRMED, OFFICIAL next round/matchday of fixtures for "${competition}" that have not been played yet (no results/scores available, only upcoming kickoffs).

Rules:
- Only include matches with confirmed team names (no "TBD" placeholders) and a confirmed or strongly expected date.
- If this is a knockout competition (World Cup, Champions League, etc.) and the next round's matchups are not yet determined (still depends on earlier results), return an empty list with a note.
- Include up to 10 matches maximum.
- Dates must be in ISO 8601 UTC format (e.g. "2026-08-22T16:30:00Z"). If exact kickoff time is unknown, use a reasonable placeholder time (e.g. 15:00 UTC) but keep the date accurate.

Respond ONLY with raw JSON, no markdown, no backticks, no explanation:
{
  "round_label": "<e.g. 'Spieltag 1', 'Achtelfinale', 'Viertelfinale'>",
  "matches": [
    { "home": "<team name>", "away": "<team name>", "date": "<ISO 8601 UTC>" }
  ],
  "note": "<optional short note in German if list is empty or uncertain, else empty string>"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
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
