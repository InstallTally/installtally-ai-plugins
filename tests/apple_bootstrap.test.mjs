import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bootstrap, loadCredential } from '../skills/setup-app-store-reports/scripts/apple-bootstrap.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const credential = { issuer_id: '12345678-1234-1234-1234-123456789012', key_id: 'ABCDE12345', privateKey };
const appId = '1234567890';
const resource = id => ({ type: 'analyticsReportRequests', id,
  attributes: { accessType: 'ONGOING', stoppedDueToInactivity: false } });
const response = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' }
});

test('reuse an active ONGOING request; sign a short-lived GET-scoped JWT', async () => {
  let count = 0;
  const result = await bootstrap({ appId, credential, clock: () => 1800000000,
    fetchImpl: async (url, options) => {
      count++;
      assert.equal(url, `https://api.appstoreconnect.apple.com/v1/apps/${appId}/analyticsReportRequests?limit=200`);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      const token = options.headers.Authorization.slice(7), [header, claims, signature] = token.split('.');
      const payload = JSON.parse(Buffer.from(claims, 'base64url'));
      assert.equal(payload.exp - payload.iat, 120);
      assert.deepEqual(payload.scope, [`GET /v1/apps/${appId}/analyticsReportRequests`]);
      assert(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
      return response({ data: [resource('existing')], links: { next: null } });
    } });
  assert.deepEqual(result, { app_id: appId, request_id: 'existing', state: 'request_ready', created: false });
  assert.equal(count, 1);
});

test('missing requests need explicit approval before a provider write', async () => {
  const methods = [];
  const result = await bootstrap({ appId, credential, fetchImpl: async (_, options) => {
    methods.push(options.method); return response({ data: [] });
  } });
  assert.equal(result.state, 'needs_admin_bootstrap');
  assert.deepEqual(methods, ['GET']);
});

test('approved bootstrap creates only the selected app request and never scopes POST as GET', async () => {
  const methods = [];
  const result = await bootstrap({ appId, credential, approveCreate: true, fetchImpl: async (url, options) => {
    methods.push(options.method);
    if (options.method === 'GET') return response({ data: [] });
    assert.equal(url, 'https://api.appstoreconnect.apple.com/v1/analyticsReportRequests');
    assert.deepEqual(JSON.parse(options.body), { data: { type: 'analyticsReportRequests', attributes: { accessType: 'ONGOING' }, relationships: { app: { data: { type: 'apps', id: appId } } } } });
    const claims = JSON.parse(Buffer.from(options.headers.Authorization.slice(7).split('.')[1], 'base64url'));
    assert.equal(claims.scope, undefined);
    return response({ data: resource('created') }, 201);
  } });
  assert.equal(result.created, true);
  assert.equal(result.request_id, 'created');
  assert.deepEqual(methods, ['GET', 'POST']);
});

test('a 409 re-reads existing requests without another POST', async () => {
  const methods = [];
  const result = await bootstrap({ appId, credential, approveCreate: true, fetchImpl: async (_, options) => {
    methods.push(options.method);
    if (options.method === 'POST') return response({ errors: [{ detail: 'PRIVATE_PROVIDER_BODY' }] }, 409);
    return response({ data: methods.length === 1 ? [] : [resource('raced')] });
  } });
  assert.equal(result.request_id, 'raced');
  assert.deepEqual(methods, ['GET', 'POST', 'GET']);
});

test('hostile pagination and redirects never receive a second bearer request', async () => {
  for (const next of ['https://attacker.example/v1/apps/1234567890/analyticsReportRequests',
    'https://api.appstoreconnect.apple.com/v1/apps/9999999999/analyticsReportRequests']) {
    let calls = 0;
    await assert.rejects(bootstrap({ appId, credential, fetchImpl: async () => {
      calls++; return response({ data: [resource('request')], links: { next } });
    } }), error => error.code === 'invalid_response');
    assert.equal(calls, 1);
  }
  await assert.rejects(bootstrap({ appId, credential, fetchImpl: async () => new Response(null, {
    status: 302, headers: { location: 'https://attacker.example/' }
  }) }), error => error.code === 'provider_response');
});

test('permission failures do not echo provider bodies or try a write', async () => {
  let calls = 0;
  await assert.rejects(bootstrap({ appId, credential, approveCreate: true, fetchImpl: async () => {
    calls++; return response({ errors: [{ detail: 'PRIVATE_SECRET' }] }, 403);
  } }), error => error.code === 'permission' && !String(error).includes('PRIVATE_SECRET'));
  assert.equal(calls, 1);
});

test('invalid app IDs and ambiguous active requests cannot trigger writes', async () => {
  await assert.rejects(bootstrap({ appId: '../other', credential, fetchImpl: () => assert.fail('network') }), error => error.code === 'configuration');
  await assert.rejects(bootstrap({ appId, credential, approveCreate: true, fetchImpl: async () =>
    response({ data: [resource('one'), resource('two')] }) }), error => error.code === 'ambiguous_request');
});

test('selected local credentials require private regular files and never expose CLI errors', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'installtally-bootstrap-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keyPath = join(directory, 'key.p8'), manifestPath = join(directory, 'manifest.json');
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  await writeFile(manifestPath, JSON.stringify({ issuer_id: credential.issuer_id, key_id: credential.key_id, private_key_path: keyPath }), { mode: 0o600 });
  const loaded = await loadCredential(manifestPath);
  assert.equal(loaded.privateKey.asymmetricKeyType, 'ec');
  await chmod(keyPath, 0o644);
  await assert.rejects(loadCredential(manifestPath), error => error.code === 'configuration');
  await chmod(keyPath, 0o600);
  const linked = join(directory, 'linked.json');
  await symlink(manifestPath, linked);
  await assert.rejects(loadCredential(linked), error => error.code === 'configuration');
  const helper = new URL('../skills/setup-app-store-reports/scripts/apple-bootstrap.mjs', import.meta.url);
  const child = spawnSync(process.execPath, [helper.pathname, '--credentials', join(directory, 'PRIVATE_MISSING_FILE'), '--app-id', appId], { encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  assert.deepEqual(JSON.parse(child.stderr), { error_code: 'configuration' });
});
