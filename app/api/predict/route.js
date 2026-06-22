import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const { home, away, league, date } = await request.json();

  const prompt = `You are a football analyst. Predict the score for: ${home} vs ${away} (${league}, ${date}).

Use your web search tool to find the MOST RECENT available information, as close as possible to the match date, including:
1. Current league table positions / tournament standing of both teams
2. Recent form (last 5 matches) of both teams
3. Head-to-head record
4. Key injuries, suspensions, or confirmed squad news as close to matchday as possible
5. Home/away performance stats
6. Any confirmed or rumored starting lineup news if available

Prioritize the latest news (within days of the match) over older season-long stats when they conflict.

Respond ONLY with raw JSON, no markdown, no backticks:
{
  "home_score": <number>,
  "away_score": <number>,
  "confidence": "<Low|Medium|High>",
  "reasoning": "<2-3 sentences in German covering form, key factors, and why this score>"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text block in response");

    let raw = textBlock.text.trim().replace(/```json|```/g, "").trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const prediction = JSON.parse(jsonMatch[0]);
    return Response.json({ ok: true, prediction });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
