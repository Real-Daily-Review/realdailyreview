// Anthropic API wrapper for article generation.
// Uses Haiku for volume articles, Sonnet for the daily digest.

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT_BASE = `You are a senior wire-service editor for Real Daily Review, a daily news digest. Your job: take a cluster of headlines and excerpts about the same story from multiple outlets, and write a tight, balanced, accurate summary.

Hard rules:
1. Only state things the source excerpts establish. If the sources don't say it, don't write it.
2. Never fabricate quotes, statistics, or specific numbers. If a number isn't in the sources, omit it.
3. If the topic is contested, label perspectives plainly: "Supporters argue...", "Critics argue...", "The administration says...", "Opponents counter...".
4. No clickbait. No editorial flourishes. No "this changes everything" hyperbole. Write the news, not your opinion.
5. Tone: Reuters-meets-Axios. Direct, scannable, neutral.
6. American English, AP-style numerals (one through nine spelled out, 10+ as digits, except for years/percentages/money).
7. Never mention "the AI" or "as an AI"; you are the editor of record.`;

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
  const prompt = `Write a 180-260 word news brief in Markdown about the following story. Aggregate the sources below; cite specific outlets in-line where useful (e.g., "according to Reuters"). Open with one sharp lede sentence. End with one sentence on what to watch next.

Then, on a new line after the body, output a JSON block (between <json>…</json> tags) with these fields:
- title: string, 60-100 chars, no clickbait
- description: string, 130-200 chars, plain summary for SEO meta
- section: one of [politics, business, world, tech, culture, explainer]
- tags: array of 2-5 lowercase tags
- perspectives: array of {label, summary} entries (only if the story is contested; empty array otherwise). Examples of labels: "Supporters", "Critics", "Administration", "Opposition".
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

  const prompt = `Write today's "Real Daily Review — The Brief" for ${dateStr}. This is a 500-650 word morning digest covering the day's most important stories.

Structure:
- Opening: 1-2 sentence "what's the day shaped by" framing.
- Three to five top items, each as a brief (~80-100 words) section under a "## " heading. Lead each with the news, follow with one sentence of context.
- Closing: a 2-3 sentence "what to watch" outlook.
- Tone: Reuters-meets-Axios. No first-person plural ("we") except in the closing.

Then output a JSON block (between <json>…</json>) with:
- title: e.g. "The Brief — Tuesday, May 6, 2026"
- description: 150-220 chars, what's covered today
- tags: array of topic tags
- sources: array of {title, url, publisher} pulling from all source items below
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
