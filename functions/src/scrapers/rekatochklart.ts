import { parseTipPage } from './parser';

export const REKATOCHKLART_INDEX = 'https://www.rekatochklart.com/tips/stryktipset/';

export function parseRekatochklart(html: string, url: string) {
  return parseTipPage(html, { source: 'rekatochklart', url, defaultExpert: 'Rekatochklart', selectors: ['[data-match]', '.stryktips-match', '.match-row', 'article h3', 'article p', 'article li', 'table tr'] });
}
