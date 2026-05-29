// Anthropic API wrapper for article generation.
// Uses Haiku for volume articles, Sonnet for the daily digest.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_BASE = `You are a senior editor at Real Daily Review, a conservative political news publication covering Colorado state politics, elections, economy, and the impact of national policy on Colorado.

Your voice: direct, no-nonsense, and unapologetically conservative. You write for Coloradans who value limited government, free markets, individual liberty, Second Amendment rights, responsible energy development, and low taxes. You are skeptical of government overreach, regulatory expansion, and progressive policy experiments.

Hard rules:
1. Only state things the source excerpts establish. Do not fabricate quotes, statistics, or specific numbers not present in the sources.
2. When covering liberal or progressive policy, state clearly what conservatives and Republicans argue against it. Never present left-wing framing as neutral fact.
3. When relevant, draw the Colorado angle: how does this affect Colorado taxpayers, businesses, ranchers, energy workers, or gun owners?
4. Label perspectives directly: "Republicans argue...", "Democrats counter...", "Conservatives say...", "The left claims...".
5. No liberal-media euphemisms. Call government spending "spending," not "investment." Call tax hikes "tax hikes," not "revenue measures."
6. Tone: sharp, readable, confident — like the editorial page of the Wall Street Journal meets a Colorado rancher's common sense.
7. American English, AP-style numerals.
8. Never mention "the AI" or "as an AI"; you are the editor of record.`;

async function call({ model, system, prompt, maxTokens = 1500, temperature = 0.4 }) {
  const r = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { text, usage: r.usage };
}

export async function draftStandaloneArticle(cluster) {
  const sources = cluster.items.slice(0, 6).map((i, idx) => `[${idx + 1}] ${i.source} (${i.lean}): ${i.title}\n${i.summary}\nURL: ${i.link}`).join('\n\n');
  const prompt = `Write a 180-260 word news brief in Markdown about the following story. Aggregate the sources below; cite specific outlets in-line where useful. Open with one sharp lede sentence from a conservative Colorado perspective. End with one sentence on what conservatives/taxpayers should watch next.

When the story involves government spending, new regulations, progressive policy, or Democrat-led initiatives, include the conservative/Republican counterargument clearly. If the story affects Colorado specifically (energy, water, guns, taxes, land use, elections), make that angle prominent.

Then, on a new line after the body, output a JSON block (between <json>…</json> tags) with these fields:
- title: string, 60-100 chars, punchy and direct — no softening language
- description: string, 130-200 chars, plain summary for SEO meta
- section: one of [politics, elections, economy, national, opinion, digest]
- tags: array of 2-5 lowercase tags relevant to Colorado conservatives
- perspectives: array of {label, summary} entries (only if the story is contested; empty array otherwise). Use labels like: "Republicans", "Democrats", "Conservatives", "The Left", "Taxpayers", "Industry".
- sources: array of {title, url, publisher} taken from the source list

SOURCES:
${sources}`;

  const { text, usage } = await call({
    model: 'claude-haiku-4-5-20251001',
    system: SYSTEM_PROMPT_BASE,
    prompt,
    maxTokens: 1800,
    temperature: 0.4,
  });

  const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/);
  if (!jsonMatch) throw new Error('Model did not return JSON metadata block.');
  const meta = JSON.parse(jsonMatch[1]);
  const body = text.slice(0, jsonMatch.index).trim();
  return { body, meta, usage };
}

export async function draftDigest(allClusters, dateStr) {
  const top = allClusters.slice(0, 8).map((c, idx) => `${idx + 1}. ${c.title} (${c.sourceCount} outlets, leans: ${c.leans.join(', ')})\n   ${c.items[0].summary.slice(0, 240)}`).join('\n\n');

  const prompt = `Write today's "Real Daily Review — The Brief" for ${dateStr}. This is a 500-650 word morning digest covering the day's most important stories for Colorado conservatives.

Structure:
- Opening: 1-2 sentences framing the day from a conservative Colorado perspective.
- Three to five top items, each as a brief (~80-100 words) section under a "## " heading. Lead each with the news, follow with one sentence of conservative context or what it means for Colorado.
- Closing: a 2-3 sentence "what to watch" outlook — focused on what conservatives, Republicans, and Colorado taxpayers should pay attention to.
- Tone: direct, confident, conservative. No "both sides" hedging on issues where the conservative position is clear. Call out government overreach, tax hikes, and leftward policy drift plainly.

Then output a JSON block (between <json>…</json>) with:
- title: e.g. "The Brief — Tuesday, May 6, 2026"
- description: 150-220 chars, what's covered today
- tags: array of topic tags
- sources: array of {title, url, publisher} — pull each from the SOURCES list below verbatim. The 'url' field MUST be the URL from the source item.
- perspectives: empty array (digest, not single-issue)

TOP STORIES:
${top}`;

  const { text, usage } = await call({
    model: 'claude-sonnet-4-6',
    system: SYSTEM_PROMPT_BASE,
    prompt,
    maxTokens: 2400,
    temperature: 0.5,
  });

  const jsonMatch = text.match(/<json>([\s\S]*?)<\/json>/);
  if (!jsonMatch) throw new Error('Model did not return JSON metadata block.');
  const meta = JSON.parse(jsonMatch[1]);
  const body = text.slice(0, jsonMatch.index).trim();
  return { body, meta, usage };
}
