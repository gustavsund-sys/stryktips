import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, doc, getDoc, getFirestore } from 'firebase/firestore';
import type { Round } from '../types';
import { demoRound } from '../data/demo';

const config = { apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: import.meta.env.VITE_FIREBASE_APP_ID };
export async function getCurrentRound(): Promise<{ round: Round; demo: boolean }> {
  if (!config.projectId) return { round: demoRound, demo: true };
  const db = getFirestore(initializeApp(config));
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true') connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const snapshot = await getDoc(doc(db, 'stryktipset', 'current'));
  if (!snapshot.exists()) return { round: demoRound, demo: true };
  return { round: snapshot.data() as Round, demo: false };
}
