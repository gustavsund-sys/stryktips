const aliases: Record<string, string> = {
  'man utd': 'manchester united', 'man united': 'manchester united', 'man city': 'manchester city',
  'spurs': 'tottenham hotspur', 'wolves': 'wolverhampton wanderers', 'wolverhampton': 'wolverhampton wanderers', 'nottm forest': 'nottingham forest',
  'sheff utd': 'sheffield united', 'sheffield u': 'sheffield united', 'sheff wed': 'sheffield wednesday', 'qpr': 'queens park rangers',
  'psg': 'paris saint germain', 'inter': 'internazionale',
};

export function normalizeTeam(value: string): string {
  const cleaned = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  return aliases[cleaned] ?? cleaned;
}

export function sameTeam(a: string, b: string): boolean {
  const left = normalizeTeam(a); const right = normalizeTeam(b);
  if (left === right) return true;
  const leftTokens = new Set(left.split(' ')); const rightTokens = new Set(right.split(' '));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size) >= 0.75;
}

export function addTeamAlias(alias: string, canonical: string): void { aliases[normalizeTeam(alias)] = normalizeTeam(canonical); }
