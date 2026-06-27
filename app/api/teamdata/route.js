import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const { team, competition } = await request.json();
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Today's date is ${today}. Gather current data for the football team "${team}" in the context of "${competition}".

Search efficiently (max 2-3 searches total) for:
- Current league/tournament table position and points
- Form: result of the last 5 matches (W/D/L)
- Key injuries or suspensions currently affecting the squad
- Any other notable current factors (e.g. manager change, key player return)

Respond ONLY with raw JSON, no markdown, no backticks:
{
  "team": "${team}",
  "table_position": "<e.g. '3rd, 45 points' or 'N/A'>",
  "recent_form": "<e.g. 'W-W-D-L-W'>",
  "injuries": "<short text listing key absences, or 'Keine bekannten Ausfälle'>",
  "notes": "<1 short sentence with any other relevant current factor, or empty string>",
  "sources": ["<domain of each source used>"],
  "fetched_at": "${today}"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text block in response");

    let raw = textBlock.text.trim().replace(/```json|```/g, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json({ ok: true, data: parsed });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
