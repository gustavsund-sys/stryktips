import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, deleteField, doc, getDoc, getDocs, getFirestore, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { AliasCandidate, AliasReview, ChallengerTip, ClaimRound, ExpertStats, LatestRunStatus, Participant, Round, Tip } from '../types';
import { demoRound } from '../data/demo';

const config = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID };
const app = config.projectId ? initializeApp(config) : undefined;
const db = app ? getFirestore(app) : undefined;
const auth = app ? getAuth(app) : undefined;
if (db && import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') connectFirestoreEmulator(db, '127.0.0.1', 8080);
export async function getCurrentRound(): Promise<{ round: Round; demo: boolean }> {
  if (!db) return { round: demoRound, demo: true };
  const snapshot = await getDoc(doc(db, 'stryktipset', 'current'));
  if (!snapshot.exists()) return { round: demoRound, demo: true };
  return { round: snapshot.data() as Round, demo: false };
}

export async function getLatestRunStatus(): Promise<LatestRunStatus | undefined> {
  if (!db) return undefined;
  try {
    const snapshot = await getDoc(doc(db, 'systemStatus', 'latest'));
    return snapshot.exists() ? snapshot.data() as LatestRunStatus : undefined;
  } catch { return undefined; }
}

export async function getExpertStats(): Promise<ExpertStats | undefined> {
  if (!db) return undefined;
  try { const snapshot = await getDoc(doc(db, 'expertStats', 'current')); return snapshot.exists() ? snapshot.data() as ExpertStats : undefined; }
  catch { return undefined; }
}

export async function getAliasReview(): Promise<AliasReview | undefined> {
  if (!db) return undefined;
  const snapshot = await getDoc(doc(db, 'aliasReviews', 'current'));
  return snapshot.exists() ? snapshot.data() as AliasReview : undefined;
}

export async function loginAliasAdmin(password: string): Promise<void> {
  if (!auth) throw new Error('Firebase är inte konfigurerat');
  await signInWithEmailAndPassword(auth, 'tstipset@gmail.com', password);
}

const aliasId = (candidate: AliasCandidate) => encodeURIComponent(candidate.alias.toLowerCase().replace(/\s+/g, ' ').trim());
export async function approveTeamAliases(candidates: AliasCandidate[]): Promise<void> {
  if (!db || !auth?.currentUser) throw new Error('Logga in först');
  const batch = writeBatch(db);
  for (const candidate of candidates) batch.set(doc(db, 'teamAliases', aliasId(candidate)), { alias: candidate.alias, canonical: candidate.canonical, approvedAt: serverTimestamp(), approvedBy: auth.currentUser.email });
  batch.set(doc(db, 'aliasReviews', 'current'), { status: 'approved', updatedAt: new Date().toISOString() }, { merge: true });
  await batch.commit();
}

export async function logoutAliasAdmin(): Promise<void> { if (auth) await signOut(auth); }

export async function getClaimRounds(): Promise<ClaimRound[]> {
  if (!db) return [];
  try { const snapshot = await getDocs(collection(db, 'claimRounds')); return snapshot.docs.map((item) => item.data() as ClaimRound).sort((a, b) => b.roundDate.localeCompare(a.roundDate)); }
  catch { return []; }
}

async function loginGroup(password: string): Promise<void> {
  if (!auth) throw new Error('Firebase är inte konfigurerat');
  await signInWithEmailAndPassword(auth, 'tstipset@gmail.com', password);
}

export async function claimRound(roundDate: string, participant: Participant, password: string): Promise<void> {
  if (!db) throw new Error('Firebase är inte konfigurerat'); await loginGroup(password); const ref = doc(db, 'claimRounds', roundDate);
  await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists() || snapshot.data().status !== 'unclaimed') throw new Error('Omgången har redan claimats'); transaction.update(ref, { status: 'claimed', participant, claimedAt: serverTimestamp() }); });
}

export async function lockClaimRound(roundDate: string, participant: Participant, base: 'expert' | 'chaparral', originalTips: Tip[], finalTips: Tip[], password: string): Promise<void> {
  if (!db) throw new Error('Firebase är inte konfigurerat'); await loginGroup(password);
  if (finalTips.length !== 13 || finalTips.some((tip) => !['1','X','2','1X','X2','12','1X2'].includes(tip))) throw new Error('Raden måste innehålla 13 giltiga matcher');
  const rows = finalTips.reduce((total, tip) => total * tip.length, 1); if (rows > 300) throw new Error('Systemet får inte överstiga 300 rader');
  const ref = doc(db, 'claimRounds', roundDate); await runTransaction(db, async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists() || snapshot.data().status !== 'claimed') throw new Error('Omgången kan inte låsas'); const challengers = { ...((snapshot.data() as ClaimRound).challengers ?? {}) }; delete challengers[participant]; transaction.update(ref, { status: 'locked', participant, challengers, base, originalTips, finalTips, rows, cost: rows, lockedAt: serverTimestamp() }); });
}

export async function unlockClaimRound(roundDate: string, participant: Participant, password: string): Promise<void> {
  if (!db) throw new Error('Firebase är inte konfigurerat'); await loginGroup(password); const ref = doc(db, 'claimRounds', roundDate);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists() || snapshot.data().status !== 'locked') throw new Error('Omgången kan inte låsas upp');
    const challengers = { ...((snapshot.data() as ClaimRound).challengers ?? {}) }; delete challengers[participant];
    transaction.update(ref, { status: 'claimed', participant, challengers, base: deleteField(), originalTips: deleteField(), finalTips: deleteField(), rows: deleteField(), cost: deleteField(), lockedAt: deleteField(), unlockedAt: serverTimestamp() });
  });
}

export async function saveChallengerTip(roundDate: string, participant: Participant, base: 'expert' | 'chaparral', originalTips: Tip[], finalTips: Tip[], password: string): Promise<void> {
  if (!db) throw new Error('Firebase är inte konfigurerat'); await loginGroup(password);
  if (finalTips.length !== 13 || finalTips.some((tip) => !['1','X','2','1X','X2','12','1X2'].includes(tip))) throw new Error('Utmanarraden måste innehålla 13 giltiga matcher');
  const rows = finalTips.reduce((total, tip) => total * tip.length, 1); if (rows > 300) throw new Error('Utmanarsystemet får inte överstiga 300 rader');
  const ref = doc(db, 'claimRounds', roundDate); await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref); if (!snapshot.exists() || snapshot.data().status !== 'locked') throw new Error('Den skarpa ronden måste vara låst först');
    const data = snapshot.data() as ClaimRound; if (data.participant === participant) throw new Error('Den skarpa tipsaren kan inte utmana sin egen rond');
    const challengers = data.challengers ?? {}; if (!challengers[participant] && Object.keys(challengers).length >= 5) throw new Error('Alla utmanarplatser är upptagna');
    const challenger: ChallengerTip = { participant, base, originalTips, finalTips, rows, cost: rows };
    transaction.update(ref, { [`challengers.${participant}`]: { ...challenger, lockedAt: serverTimestamp() } });
  });
}
