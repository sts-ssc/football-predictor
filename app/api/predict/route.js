import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function formatTeamData(name, data) {
  if (!data) return `${name}: Keine Daten verfügbar — bitte zuerst per "Daten holen" laden.`;

  const matchLines = (data.matches_played || []).length > 0
    ? data.matches_played.map(m => `  - ${m.date}: ${name} ${m.home_away === "Heim" ? "vs" : "@"} ${m.opponent} → ${m.score}`).join("\n")
    : "  (keine Spiele in dieser Saison/diesem Turnier gefunden)";

  return `${name}:
Tabelle/Stand: ${data.table_position}
Bisherige Spiele in dieser Saison/diesem Turnier:
${matchLines}
Aktuelle Ausfälle: ${data.injuries}
Hinweis: ${data.notes || "–"}
(Daten erfasst am ${data.fetched_at})`;
}

export async function POST(request) {
  const { home, away, league, date, homeData, awayData } = await request.json();

  const homeContext = formatTeamData(home, homeData);
  const awayContext = formatTeamData(away, awayData);

  const prompt = `You are a football analyst. Predict the score for: ${home} vs ${away} (${league}, ${date}).

Base your analysis ONLY on the following pre-gathered data — do NOT search the web, do NOT invent additional matches or stats:

${homeContext}

${awayContext}

Analyze the actual match results listed above (not just a vague "form" label) to assess each team's current strength, scoring tendency, and defensive solidity. Factor in injuries/suspensions explicitly.

If a team has no matches listed (e.g. season/tournament hasn't started or no data was found), state this explicitly in your reasoning and rely on general football knowledge instead, noting the prediction is less reliable.

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
      max_tokens: 700,
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
