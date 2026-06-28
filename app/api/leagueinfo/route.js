import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Holt Liga-weite Infos (Tabelle, Form, Verletzungen) für die Teams der nächsten Runde — in EINEM Call.
export async function POST(request) {
  const { competition, teams } = await request.json();
  const today = new Date().toISOString().slice(0, 10);
  const teamList = teams.join(", ");

  const prompt = `Today's date is ${today}. Gather current data for these football teams in "${competition}": ${teamList}.

Search efficiently (max 4-5 searches total for ALL teams combined) for each team:
- Current table position and points
- Recent form (last 5 matches, W/D/L)
- Key injuries or suspensions
- Any other notable current factor

Respond ONLY with raw JSON, no markdown, no backticks:
{
  "teams": {
    "<team name exactly as given>": {
      "table_position": "<e.g. '3rd, 45 points' or 'N/A'>",
      "recent_form": "<e.g. 'W-W-D-L-W'>",
      "injuries": "<short text or 'Keine bekannten Ausfälle'>",
      "notes": "<1 short sentence or empty string>"
    }
  },
  "sources": ["<domain of each source used>"],
  "fetched_at": "${today}"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
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
