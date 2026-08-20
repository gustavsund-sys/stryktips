import { describe, expect, it } from 'vitest';
import { omitUndefined } from '../persistence';

describe('Firestore persistence', () => {
  it('utelämnar undefined rekursivt utan att ändra giltiga värden', () => {
    expect(omitUndefined({
      statuses: {
        rekatochklart: {
          status: 'ERROR',
          lastSuccessfulUpdate: undefined,
        },
      },
      matches: [{ odds: undefined, signs: ['1', undefined, 'X'] }],
      published: false,
    })).toEqual({
      statuses: {
        rekatochklart: { status: 'ERROR' },
      },
      matches: [{ signs: ['1', 'X'] }],
      published: false,
    });
  });
});
