/** Local, app-scoped Analytics request bootstrap. No key upload or retention. */
import { createPrivateKey, sign } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const BASE = 'https://api.appstoreconnect.apple.com';
const MAX_BYTES = 512 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;

export class BootstrapError extends Error {
  constructor(code) { super(`Apple bootstrap failed (${code})`); this.code = code; }
}
const fail = code => { throw new BootstrapError(code); };

async function privateFile(path, maximum) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('configuration');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum || (process.platform !== 'win32' && (info.mode & 0o077))) fail('configuration');
    const buffer = Buffer.alloc(maximum + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maximum) fail('configuration');
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export async function loadCredential(path) {
  try {
    const manifest = JSON.parse((await privateFile(path, 4096)).toString());
    if (Object.keys(manifest).sort().join(',') !== 'issuer_id,key_id,private_key_path') fail('configuration');
    const privateKey = createPrivateKey(await privateFile(manifest.private_key_path, 16384));
    return { issuer_id: manifest.issuer_id, key_id: manifest.key_id, privateKey };
  } catch { fail('configuration'); }
}

function credentialValid(credential) {
  return credential && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(credential.issuer_id)
    && /^[A-Z0-9]{10}$/.test(credential.key_id) && credential.privateKey?.type === 'private'
    && credential.privateKey.asymmetricKeyType === 'ec'
    && credential.privateKey.asymmetricKeyDetails?.namedCurve === 'prime256v1';
}

function token(credential, method, path, clock) {
  const now = Math.floor(clock());
  const header = { alg: 'ES256', kid: credential.key_id, typ: 'JWT' };
  const claims = { iss: credential.issuer_id, iat: now, exp: now + 120, aud: 'appstoreconnect-v1' };
  // Apple documents endpoint scoping for GET. Do not invent POST-only scope.
  if (method === 'GET') claims.scope = [`GET ${path}`];
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const message = `${encode(header)}.${encode(claims)}`;
  return `${message}.${sign('sha256', Buffer.from(message), {
    key: credential.privateKey, dsaEncoding: 'ieee-p1363'
  }).toString('base64url')}`;
}

async function document(response) {
  if (response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
    || Number(response.headers.get('content-length') || 0) > MAX_BYTES) fail('invalid_response');
  const chunks = []; let bytes = 0;
  if (!response.body) fail('invalid_response');
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) fail('invalid_response');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_response');
    return value;
  } catch { fail('invalid_response'); }
}

function requestResource(value) {
  if (!value || value.type !== 'analyticsReportRequests' || typeof value.id !== 'string' || !ID.test(value.id)
    || !['ONGOING', 'ONE_TIME_SNAPSHOT'].includes(value.attributes?.accessType)
    || typeof value.attributes?.stoppedDueToInactivity !== 'boolean') fail('invalid_response');
  return value;
}

export async function bootstrap({ appId, credential, approveCreate = false,
  fetchImpl = fetch, clock = () => Date.now() / 1000 }) {
  if (typeof appId !== 'string' || !/^[1-9][0-9]{4,19}$/.test(appId)
    || typeof approveCreate !== 'boolean' || !credentialValid(credential)) fail('configuration');
  const path = `/v1/apps/${appId}/analyticsReportRequests`;
  const deadline = performance.now() + 60000;
  async function request(method, url, body) {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) fail('transport');
    try {
      return await fetchImpl(url, { method, redirect: 'manual', signal: AbortSignal.timeout(Math.min(15000, remaining)),
        headers: { Authorization: `Bearer ${token(credential, method, new URL(url).pathname, clock)}`,
          Accept: 'application/json', 'Accept-Encoding': 'identity', 'Content-Type': 'application/json',
          'User-Agent': 'installtally-apple-bootstrap/1' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { fail(method === 'POST' ? 'creation_status_unknown' : 'transport'); }
  }
  function status(response, expected) {
    if (response.status !== expected) {
      fail(({ 401: 'authentication', 403: 'permission', 429: 'rate_limited' })[response.status] || 'provider_response');
    }
  }
  async function existing() {
    let url = `${BASE}${path}?limit=200`;
    const seen = new Set(), identities = new Set(), active = [];
    for (let page = 0; page < 16; page++) {
      if (seen.has(url)) fail('invalid_response');
      seen.add(url);
      const response = await request('GET', url);
      status(response, 200);
      const data = await document(response);
      if (!Array.isArray(data.data) || data.data.length > 200) fail('invalid_response');
      for (const value of data.data) {
        const entry = requestResource(value);
        if (identities.has(entry.id) || identities.size >= 1000) fail('invalid_response');
        identities.add(entry.id);
        if (entry.attributes.accessType === 'ONGOING' && !entry.attributes.stoppedDueToInactivity) active.push(entry.id);
      }
      if (active.length > 1) fail('ambiguous_request');
      const next = data.links?.next;
      if (next == null) return active[0] || null;
      if (typeof next !== 'string' || next.length > 4096 || /[\s\\]/.test(next)) fail('invalid_response');
      let parsed;
      try { parsed = new URL(next, BASE); } catch { fail('invalid_response'); }
      if (parsed.origin !== BASE || parsed.pathname !== path || parsed.username || parsed.password || parsed.hash) fail('invalid_response');
      url = parsed.href;
    }
    fail('invalid_response');
  }
  const reused = await existing();
  if (reused) return { app_id: appId, request_id: reused, state: 'request_ready', created: false };
  if (!approveCreate) return { app_id: appId, state: 'needs_admin_bootstrap', created: false };
  const response = await request('POST', `${BASE}/v1/analyticsReportRequests`, {
    data: { type: 'analyticsReportRequests', attributes: { accessType: 'ONGOING' },
      relationships: { app: { data: { type: 'apps', id: appId } } } }
  });
  if (response.status === 409) {
    const raced = await existing();
    if (!raced) fail('request_conflict');
    return { app_id: appId, request_id: raced, state: 'request_ready', created: false };
  }
  status(response, 201);
  const created = requestResource((await document(response)).data);
  if (created.attributes.accessType !== 'ONGOING' || created.attributes.stoppedDueToInactivity) fail('invalid_response');
  return { app_id: appId, request_id: created.id, state: 'request_ready', created: true };
}

async function main() {
  try {
    const { values } = parseArgs({ options: {
      credentials: { type: 'string' }, 'app-id': { type: 'string' },
      'approve-create-ongoing': { type: 'boolean', default: false }
    }, strict: true, allowPositionals: false });
    const credential = await loadCredential(values.credentials);
    const result = await bootstrap({ appId: values['app-id'], credential,
      approveCreate: values['approve-create-ongoing'] });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ error_code: error instanceof BootstrapError ? error.code : 'configuration' }) + '\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
