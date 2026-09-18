import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { renameChallenger } from './admin/rename-challenger';

initializeApp();
const source = process.env.CHALLENGER_SOURCE ?? '';
const target = process.env.CHALLENGER_TARGET ?? '';
const roundDate = process.env.ROUND_DATE?.trim() || undefined;

renameChallenger(getFirestore(), source, target, roundDate)
  .then((result) => console.log(JSON.stringify({ renamed: true, ...result })))
  .catch((error) => { console.error(error); process.exitCode = 1; });
