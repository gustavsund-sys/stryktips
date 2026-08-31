import { LIVE_API_BASE, parseLiveDraw, resolveDrawNumber, toFirestoreValue } from './live-status.mjs';
import { createSign } from 'node:crypto';

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!projectId || !serviceAccountJson) throw new Error('FIREBASE_PROJECT_ID eller FIREBASE_SERVICE_ACCOUNT_JSON saknas');

async function createAccessToken(json) {
  const account = JSON.parse(json); const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  if (!tokenResponse.ok) throw new Error(`GOOGLE_TOKEN_${tokenResponse.status}`);
  return (await tokenResponse.json()).access_token;
}
const accessToken = await createAccessToken(serviceAccountJson);
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const roundUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/stryktipset/current`;
const roundResponse = await fetch(roundUrl, { headers });
if (!roundResponse.ok) throw new Error(`FIRESTORE_ROUND_READ_${roundResponse.status}`);
const round = await roundResponse.json();
const roundDate = round?.fields?.roundDate?.stringValue;
let archived;
if (roundDate) {
  const archivedResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/rounds/${encodeURIComponent(roundDate)}`, { headers });
  if (archivedResponse.ok) archived = await archivedResponse.json();
}
const drawNumber = resolveDrawNumber(round, archived);
if (!drawNumber) throw new Error('CURRENT_DRAW_NOT_FOUND');

const response = await fetch(`${LIVE_API_BASE}/${drawNumber}`, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`LIVE_API_HTTP_${response.status}`);
const live = parseLiveDraw(await response.json());

const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/liveStatus/current`;
const write = await fetch(documentUrl, { method: 'PATCH', headers, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(live).map(([key, value]) => [key, toFirestoreValue(value)])) }) });
if (!write.ok) throw new Error(`FIRESTORE_WRITE_${write.status}: ${await write.text()}`);
console.log(JSON.stringify({ updated: true, roundDate: live.roundDate, active: live.active, complete: live.complete }));
