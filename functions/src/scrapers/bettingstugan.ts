import { parseTipPage } from './parser';

export const BETTINGSTUGAN_INDEX = 'https://bettingstugan.se/stryktipset/';

export function parseBettingstugan(html: string, url: string) {
  return parseTipPage(html, { source: 'bettingstugan', url, defaultExpert: 'Bettingstugan', selectors: ['[data-match]', '.stryktips-match', '.match-row', 'article p', 'article li', 'table tr'] });
}
