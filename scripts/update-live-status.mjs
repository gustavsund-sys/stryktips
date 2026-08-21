import { LIVE_API_BASE, parseLiveDraw, toFirestoreValue } from './live-status.mjs';

const projectId = process.env.FIREBASE_PROJECT_ID;
const accessToken = process.env.GOOGLE_ACCESS_TOKEN;
if (!projectId || !accessToken) throw new Error('FIREBASE_PROJECT_ID eller GOOGLE_ACCESS_TOKEN saknas');

const page = await fetch('https://spela.svenskaspel.se/stryktipset/systemspel/speltips', { headers: { 'user-agent': 'TS-Gubbarnas-Live/1.0' } });
if (!page.ok) throw new Error(`SVENSKA_SPEL_PAGE_HTTP_${page.status}`);
const html = await page.text();
const productDraw = html.match(/"productId":1,"drawNumber":(\d+)/);
if (!productDraw) throw new Error('CURRENT_DRAW_NOT_FOUND');

const response = await fetch(`${LIVE_API_BASE}/${productDraw[1]}`, { headers: { accept: 'application/json' } });
if (!response.ok) throw new Error(`LIVE_API_HTTP_${response.status}`);
const live = parseLiveDraw(await response.json());

const documentUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/liveStatus/current`;
const headers = { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
const current = await fetch(documentUrl, { headers });
if (current.ok) {
  const previous = await current.json();
  const oldComparable = JSON.stringify(previous.fields?.matches ?? null);
  const newComparable = JSON.stringify(toFirestoreValue(live.matches));
  if (previous.fields?.drawNumber?.integerValue === String(live.drawNumber) && oldComparable === newComparable && previous.fields?.complete?.booleanValue === live.complete) {
    console.log(JSON.stringify({ updated: false, reason: 'UNCHANGED', roundDate: live.roundDate })); process.exit(0);
  }
}

const write = await fetch(documentUrl, { method: 'PATCH', headers, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(live).map(([key, value]) => [key, toFirestoreValue(value)])) }) });
if (!write.ok) throw new Error(`FIRESTORE_WRITE_${write.status}: ${await write.text()}`);
console.log(JSON.stringify({ updated: true, roundDate: live.roundDate, active: live.active, complete: live.complete }));
