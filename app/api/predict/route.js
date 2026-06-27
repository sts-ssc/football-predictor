import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request) {
  const { home, away, league, date, homeData, awayData } = await request.json();

  const homeContext = homeData
    ? `${home}: Tabelle: ${homeData.table_position}, Form: ${homeData.recent_form}, Ausfälle: ${homeData.injuries}, Hinweis: ${homeData.notes || "–"} (Daten von ${homeData.fetched_at})`
    : `${home}: Keine Daten verfügbar — bitte zuerst per "Daten holen" laden.`;

  const awayContext = awayData
    ? `${away}: Tabelle: ${awayData.table_position}, Form: ${awayData.recent_form}, Ausfälle: ${awayData.injuries}, Hinweis: ${awayData.notes || "–"} (Daten von ${awayData.fetched_at})`
    : `${away}: Keine Daten verfügbar — bitte zuerst per "Daten holen" laden.`;

  const prompt = `You are a football analyst. Predict the score for: ${home} vs ${away} (${league}, ${date}).

Use ONLY the following pre-gathered data — do NOT search the web, base your analysis entirely on this:

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
