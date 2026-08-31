import { LIVE_API_BASE, fromFirestoreDocument, mergeLiveStatus, parseLiveDraw, resolveDrawNumber, toFirestoreValue } from './live-status.mjs';
import { createSign } from 'node:crypto';

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!projectId || !serviceAccountJson) throw new Error('FIREBASE_PROJECT_ID eller FIREBASE_SERVICE_ACCOUNT_JSON saknas');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12_000) });
      if (!response.ok && (response.status >= 500 || response.status === 429)) throw new Error(`HTTP_${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 750);
    }
  }
  throw lastError;
}

async function createAccessToken(json) {
  const account = JSON.parse(json); const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${signer.sign(account.private_key, 'base64url')}`;
  const tokenResponse = await fetchWithRetry('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer', assertion }) });
  if (!tokenResponse.ok) throw new Error(`GOOGLE_TOKEN_${tokenResponse.status}`);
  return (await tokenResponse.json()).access_token;
}

const accessToken = await createAccessToken(serviceAccountJson);
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
let previousLiveDocument;

async function patchHealth(error) {
  const now = new Date().toISOString(); const previous = fromFirestoreDocument(previousLiveDocument);
  const fields = {
    phase: toFirestoreValue('degraded'), lastAttemptAt: toFirestoreValue(now),
    consecutiveFailures: toFirestoreValue(Number(previous?.consecutiveFailures ?? 0) + 1),
    lastError: toFirestoreValue(error instanceof Error ? error.message : String(error)), schemaVersion: toFirestoreValue(2),
  };
  const masks = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
  try { await fetchWithRetry(`${baseUrl}/liveStatus/current?${masks}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) }, 2); } catch { /* Preserve the original failure. */ }
}

try {
  const [roundResponse, liveResponse] = await Promise.all([
    fetchWithRetry(`${baseUrl}/stryktipset/current`, { headers }),
    fetchWithRetry(`${baseUrl}/liveStatus/current`, { headers }, 2),
  ]);
  if (!roundResponse.ok) throw new Error(`FIRESTORE_ROUND_READ_${roundResponse.status}`);
  if (liveResponse.ok) previousLiveDocument = await liveResponse.json();
  const round = await roundResponse.json(); const roundDate = round?.fields?.roundDate?.stringValue;
  let archived;
  if (roundDate) {
    const archivedResponse = await fetchWithRetry(`${baseUrl}/rounds/${encodeURIComponent(roundDate)}`, { headers }, 2);
    if (archivedResponse.ok) archived = await archivedResponse.json();
  }
  const drawNumber = resolveDrawNumber(round, archived);
  if (!drawNumber) throw new Error('CURRENT_DRAW_NOT_FOUND');

  const response = await fetchWithRetry(`${LIVE_API_BASE}/${drawNumber}`, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`LIVE_API_HTTP_${response.status}`);
  const parsed = parseLiveDraw(await response.json());
  if (parsed.drawNumber !== drawNumber) throw new Error(`LIVE_DRAW_MISMATCH_${parsed.drawNumber}_${drawNumber}`);
  const live = mergeLiveStatus(fromFirestoreDocument(previousLiveDocument), parsed);

  const fields = Object.fromEntries(Object.entries(live).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toFirestoreValue(value)]));
  const write = await fetchWithRetry(`${baseUrl}/liveStatus/current`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  if (!write.ok) throw new Error(`FIRESTORE_WRITE_${write.status}: ${await write.text()}`);
  console.log(JSON.stringify({ updated: true, roundDate: live.roundDate, active: live.active, complete: live.complete, phase: live.phase, pollRecommended: live.pollRecommended }));
} catch (error) {
  await patchHealth(error);
  throw error;
}
