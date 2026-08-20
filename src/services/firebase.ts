import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore';
import type { AliasCandidate, AliasReview, LatestRunStatus, Round } from '../types';
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
