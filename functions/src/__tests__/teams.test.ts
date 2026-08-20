import { describe, expect, it } from 'vitest';
import { sameTeam } from '../normalization/teams';

describe('lagnamnsnormalisering', () => {
  it.each([
    ['Wolves', 'Wolverhampton'],
    ['Wolverhampton Wanderers', 'Wolverhampton'],
    ['Sheffield United', 'Sheffield U'],
    ['Sheff Utd', 'Sheffield U'],
  ])('behandlar %s och %s som samma lag', (left, right) => {
    expect(sameTeam(left, right)).toBe(true);
    expect(sameTeam(right, left)).toBe(true);
  });
});
