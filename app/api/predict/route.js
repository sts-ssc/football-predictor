import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Berechnet die Form eines Teams aus den letzten N gespeicherten Ergebnissen.
function computeFormFromResults(team, results) {
  const relevant = results
    .filter(r => r.home === team || r.away === team)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  if (relevant.length === 0) return null;

  const formLetters = relevant.map(r => {
    const isHome = r.home === team;
    const own = isHome ? r.home_score : r.away_score;
    const opp = isHome ? r.away_score : r.home_score;
    if (own > opp) return "W";
    if (own < opp) return "L";
    return "D";
  });

  return formLetters.join("-");
}

export async function POST(request) {
  const { home, away, league, date, homeData, awayData, homeResults, awayResults } = await request.json();

  const homeForm = homeResults ? computeFormFromResults(home, homeResults) : null;
  const awayForm = awayResults ? computeFormFromResults(away, awayResults) : null;

  const homeContext = `${home}: ` + [
    homeData ? `Tabelle: ${homeData.table_position}, Liga-Info-Form: ${homeData.recent_form}, Ausfälle: ${homeData.injuries}, Hinweis: ${homeData.notes || "–"}` : "Keine Liga-Infos geladen",
    homeForm ? `Berechnete Form aus gespeicherten Resultaten (letzte ${Math.min(5, (homeResults || []).length)} Spiele): ${homeForm}` : "Keine gespeicherten Resultate vorhanden",
  ].join(" | ");

  const awayContext = `${away}: ` + [
    awayData ? `Tabelle: ${awayData.table_position}, Liga-Info-Form: ${awayData.recent_form}, Ausfälle: ${awayData.injuries}, Hinweis: ${awayData.notes || "–"}` : "Keine Liga-Infos geladen",
    awayForm ? `Berechnete Form aus gespeicherten Resultaten (letzte ${Math.min(5, (awayResults || []).length)} Spiele): ${awayForm}` : "Keine gespeicherten Resultate vorhanden",
  ].join(" | ");

  const prompt = `You are a football analyst. Predict the score for: ${home} vs ${away} (${league}, ${date}).

Use ONLY the following pre-gathered data — do NOT search the web, base your analysis entirely on this. Combine both the league info (injuries, table) and the form computed from stored match results — they are complementary, not redundant:

${homeContext}
${awayContext}

If data is missing for a team, state that explicitly in your reasoning and rely on general football knowledge instead, noting the prediction is less reliable.

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
