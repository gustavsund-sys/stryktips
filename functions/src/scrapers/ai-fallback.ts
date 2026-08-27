import * as cheerio from 'cheerio';
import type { ExpertPick, SourceId, Tip } from '../types';

interface AIExtraction { expert: string; matches: Array<{ matchNumber: number; homeTeam: string; awayTeam: string; tip: Tip; evidence: string }> }

export async function extractPicksWithAI(html: string, source: SourceId, sourceUrl: string): Promise<ExpertPick[] | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;
  const $ = cheerio.load(html); $('script,style,noscript,svg').remove();
  const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 60_000);
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_SCRAPER_MODEL || 'gpt-5.6-luna',
      input: [{ role: 'system', content: 'Extrahera endast uttryckliga Stryktipset-val från texten. Gissa aldrig. Returnera tom matches-lista om exakt information saknas.' }, { role: 'user', content: `Källa: ${source}\nURL: ${sourceUrl}\n\n${pageText}` }],
      text: { format: { type: 'json_schema', name: 'expert_picks', strict: true, schema: { type: 'object', additionalProperties: false, required: ['expert','matches'], properties: { expert: { type: 'string' }, matches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['matchNumber','homeTeam','awayTeam','tip','evidence'], properties: { matchNumber: { type: 'integer', minimum: 1, maximum: 13 }, homeTeam: { type: 'string' }, awayTeam: { type: 'string' }, tip: { type: 'string', enum: ['1','X','2','1X','X2','12','1X2'] }, evidence: { type: 'string' } } } } } } } },
    }),
  });
  if (!response.ok) throw new Error(`AI_FALLBACK_HTTP_${response.status}`);
  const payload = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text')?.text;
  if (!text) throw new Error('AI_FALLBACK_EMPTY');
  const parsed = JSON.parse(text) as AIExtraction;
  return parsed.matches.map(({ evidence, ...match }) => { void evidence; return { ...match, expert: parsed.expert || source, source, sourceUrl }; });
}
