const USER_AGENT = 'StryktipsetExpertkonsensus/1.0 (+contact: configure-before-deploy)';

export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP_${response.status}: ${url}`);
  return response.text();
}

export function findCurrentArticle(indexHtml: string, baseUrl: string): string {
  const links = [...indexHtml.matchAll(/href=["']([^"']+)["'][^>]*>([^<]*(?:stryktips|stryktipset)[^<]*)</gi)];
  if (!links.length) throw new Error('ARTICLE_NOT_FOUND');
  return new URL(links[0][1], baseUrl).toString();
}
