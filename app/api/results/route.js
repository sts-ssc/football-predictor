import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const { competition } = await request.json();
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Today's date is ${today}. Find the most recently COMPLETED matches (with final scores) for: ${competition}.

Use web search to find up to 15 of the most recent finished matches (already played, with confirmed final scores) for "${competition}", ordered most recent first.

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
