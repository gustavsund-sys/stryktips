import type { Firestore } from 'firebase-admin/firestore';

const participants = ['Jocke', 'Tony', 'Gustav', 'Anders', 'Matta-Råsnygg', 'Christer'] as const;
type Participant = typeof participants[number];

export async function renameChallenger(db: Firestore, source: string, target: string, requestedRoundDate?: string): Promise<{ roundDate: string; source: Participant; target: Participant }> {
  if (!participants.includes(source as Participant) || !participants.includes(target as Participant) || source === target) throw new Error('INVALID_PARTICIPANT_RENAME');
  const current = requestedRoundDate ? undefined : await db.doc('stryktipset/current').get();
  const roundDate = requestedRoundDate || current?.data()?.roundDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(roundDate))) throw new Error('ROUND_DATE_NOT_FOUND');

  const claimRef = db.doc(`claimRounds/${roundDate}`);
  const sourceRef = db.doc(`challengerTips/${roundDate}_${source}`);
  const targetRef = db.doc(`challengerTips/${roundDate}_${target}`);
  await db.runTransaction(async (transaction) => {
    const [claimSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(claimRef), transaction.get(sourceRef), transaction.get(targetRef),
    ]);
    if (!claimSnapshot.exists) throw new Error('CLAIM_ROUND_NOT_FOUND');
    const claim = claimSnapshot.data(); const challengers = { ...(claim?.challengers ?? {}) };
    if (!challengers[source] || !sourceSnapshot.exists) throw new Error('SOURCE_CHALLENGER_NOT_FOUND');
    if (challengers[target] || targetSnapshot.exists) throw new Error('TARGET_CHALLENGER_ALREADY_EXISTS');
    const sourceSummary = challengers[source]; delete challengers[source];
    challengers[target] = { ...sourceSummary, participant: target };
    transaction.set(targetRef, { ...sourceSnapshot.data(), participant: target });
    transaction.update(claimRef, { challengers });
    transaction.delete(sourceRef);
  });
  return { roundDate, source: source as Participant, target: target as Participant };
}
