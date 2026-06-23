import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const { pending } = await request.json();

  if (!pending || pending.length === 0) {
    return Response.json({ ok: true, updates: [] });
  }

  const updates = [];

  for (const p of pending.slice(0, 15)) {
    const prompt = `Find the final score of this football match, if it has been played: ${p.home_team} vs ${p.away_team} (${p.competition}, around ${p.match_date}).

Search the web. Respond ONLY with raw JSON, no markdown:
{ "found": <true|false>, "home_score": <number or null>, "away_score": <number or null> }`;

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock) continue;

      let raw = textBlock.text.trim().replace(/```json|```/g, "").trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const result = JSON.parse(jsonMatch[0]);
      if (result.found && result.home_score !== null && result.away_score !== null) {
        updates.push({ id: p.id, actual_home_score: result.home_score, actual_away_score: result.away_score });
      }
    } catch (err) {
      console.error(`Resolve failed for prediction ${p.id}:`, err);
    }
  }

  return Response.json({ ok: true, updates });
}
