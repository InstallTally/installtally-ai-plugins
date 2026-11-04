import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCipheriv, publicEncrypt, randomBytes, constants, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, chmod, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createTransfers } from '../scripts/private-companion.mjs';

const origin = 'https://api.installtally.com';
const setup = { id: 'setup-1', workspace: 'studio', product_id: 'app-1', provider: 'app_store', destination: '1234567890' };
const response = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

async function bootstrapManifest(directory, privateKeyPath) {
  const manifest = join(directory, 'admin.json');
  if (!privateKeyPath) {
    privateKeyPath = join(directory, 'admin.p8');
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    await writeFile(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  }
  await writeFile(manifest, JSON.stringify({ issuer_id: '12345678-1234-1234-1234-123456789012',
    key_id: 'ABCDEFGHIJ', private_key_path: privateKeyPath }), { mode: 0o600 });
  return manifest;
}

async function callBootstrap(manifest, mockFetch, approveCreate = false) {
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `${mockFetch}; const { serve } = await import('./scripts/private-companion.mjs'); await serve();`]);
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 3000);
  const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'bootstrap_apple_reports', arguments: { app_id: '1234567890',
      credential_manifest: manifest, approve_create: approveCreate }
  } }) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) + '\n');
  try { await closed; } finally { clearTimeout(timer); }
  assert.equal(timedOut, false, 'bootstrap must reject invalid files without blocking subsequent MCP requests');
  assert.equal(stderr, '');
  assert(!stdout.includes('PRIVATE_PROVIDER_ERROR'));
  assert(!stdout.includes(manifest));
  const replies = stdout.trim().split('\n').map(JSON.parse);
  assert.deepEqual(replies[1], { jsonrpc: '2.0', id: 2, result: {} });
  assert.equal(replies[0].result.isError, true);
  const text = replies[0].result.content[0].text;
  return text.startsWith('{') ? JSON.parse(text) : { message: text };
}

test('stdio bootstrap preserves safe provider failure codes without exposing provider errors', async t => {
  const { directory } = await fixture(t);
  const manifest = await bootstrapManifest(directory);
  for (const [status, code] of [[401, 'authentication'], [403, 'permission'], [429, 'rate_limited']]) {
    const result = await callBootstrap(manifest,
      `globalThis.fetch = async () => new Response('PRIVATE_PROVIDER_ERROR', { status: ${status} })`);
    assert.equal(result.error_code, code);
  }
  const result = await callBootstrap(manifest, `globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') throw Error('PRIVATE_PROVIDER_ERROR');
    return new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/json' } });
  }`, true);
  assert.equal(result.error_code, 'creation_status_unknown');
});

test('stdio bootstrap rejects FIFO manifests and keys without blocking ping', { skip: process.platform === 'win32' }, async t => {
  const { directory } = await fixture(t);
  const fifo = join(directory, 'private.fifo');
  execFileSync('mkfifo', [fifo]);
  const noNetwork = `globalThis.fetch = async () => { throw Error('PRIVATE_PROVIDER_ERROR'); }`;
  assert.equal((await callBootstrap(fifo, noNetwork)).error_code, 'configuration');
  const manifest = await bootstrapManifest(directory, fifo);
  assert.equal((await callBootstrap(manifest, noNetwork)).error_code, 'configuration');
});
function seal(recipient, overrides = {}) {
  const value = { setup_id: setup.id, workspace: setup.workspace, product_id: setup.product_id,
    provider: setup.provider, destination: setup.destination, recipient_id: recipient.recipient_id,
    token: 't'.repeat(43), expires_at: 1800000300, upload_url: origin + '/private/provider-handoff', ...overrides };
  const key = randomBytes(32), nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from('installtally-private-handoff-v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
  return { version: 1, key: publicEncrypt({ key: recipient.recipient_public_key,
    oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64url'),
    nonce: nonce.toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'installtally-private-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'reader.json');
  await writeFile(path, JSON.stringify({ private_key: 'PRIVATE_FIXTURE', issuer_id: 'issuer', key_id: 'key' }), { mode: 0o600 });
  return { directory, path };
}

test('MCP-controlled upload keeps file content and capability outside tool results; one use', async t => {
  const { path } = await fixture(t); let count = 0;
  const transfers = createTransfers({ clock: () => 1800000000, fetchImpl: async (url, options) => {
    count++;
    assert.equal(url, origin + '/private/provider-handoff');
    assert.equal(options.method, 'PUT'); assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'ProviderHandoff ' + 't'.repeat(43));
    assert.equal(JSON.parse(options.body).credentials.private_key, 'PRIVATE_FIXTURE');
    assert(options.signal);
    return response({ ...setup, credential_saved: true, state: 'configuring', revision: 2, token: 'server-injected-secret' });
  } });
  const recipient = await transfers.prepare({ setup, credential_file: path });
  assert(!JSON.stringify(recipient).includes('PRIVATE_FIXTURE'));
  const result = await transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient) });
  assert.equal(result.state, 'credentials_saved');
  assert(!JSON.stringify(result).includes('server-injected-secret'));
  assert(!JSON.stringify(result).includes('PRIVATE_FIXTURE'));
  assert(!JSON.stringify(result).includes('t'.repeat(43)));
  await assert.rejects(transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient) }));
  assert.equal(count, 1);
});

test('reject host, destination, product, workspace, provider and recipient swaps before network I/O', async t => {
  const { path } = await fixture(t); let count = 0;
  const transfers = createTransfers({ clock: () => 1800000000, fetchImpl: async () => { count++; throw Error('unexpected'); } });
  for (const override of [{ upload_url: 'https://evil.example/private/provider-handoff' },
    { upload_url: origin + '/private/provider-handoff?token=leak' }, { destination: 'other' },
    { product_id: 'other' }, { workspace: 'other' }, { provider: 'google_play' }, { recipient_id: 'z'.repeat(43) },
    { expires_at: 1799999999 }, { expires_at: 1800009999 }]) {
    const recipient = await transfers.prepare({ setup, credential_file: path });
    await assert.rejects(transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient, override) }));
  }
  assert.equal(count, 0);
});

test('private-file permissions, symlinks, invalid JSON and oversized inputs fail safely', async t => {
  const { directory, path } = await fixture(t); let count = 0;
  const transfers = createTransfers({ clock: () => 1800000000, fetchImpl: async () => { count++; } });
  const link = join(directory, 'link.json'); await symlink(path, link);
  for (const invalid of [link, '/missing/PRIVATE_PATH']) {
    const recipient = await transfers.prepare({ setup, credential_file: invalid });
    await assert.rejects(transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient) }),
      error => !error.message.includes('PRIVATE_PATH'));
  }
  for (const [mode, contents] of [[0o644, '{}'], [0o600, '{PRIVATE_BAD_JSON'], [0o600, 'x'.repeat(32769)]]) {
    await chmod(path, mode); await writeFile(path, contents);
    const recipient = await transfers.prepare({ setup, credential_file: path });
    await assert.rejects(transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient) }),
      error => !error.message.includes('PRIVATE_BAD_JSON'));
  }
  assert.equal(count, 0);
});

test('redirects, hostile provider errors and replies never disclose credentials', async t => {
  const { path } = await fixture(t);
  for (const fetchImpl of [async () => new Response('PRIVATE_PROVIDER_ERROR', { status: 307, headers: { Location: 'https://evil.example' } }),
    async () => { throw Error('PRIVATE_PROVIDER_ERROR'); }, async () => response({ ...setup, credential_saved: false, error: 'PRIVATE_PROVIDER_ERROR' })]) {
    const transfers = createTransfers({ clock: () => 1800000000, fetchImpl });
    const recipient = await transfers.prepare({ setup, credential_file: path });
    await assert.rejects(transfers.complete({ recipient_id: recipient.recipient_id, envelope: seal(recipient) }),
      error => !error.message.includes('PRIVATE_'));
  }
});

test('cancel and local expiry discard ephemeral recipients without reading files', async t => {
  const { path } = await fixture(t); let now = 1800000000;
  const transfers = createTransfers({ clock: () => now });
  const a = await transfers.prepare({ setup, credential_file: path });
  transfers.cancel({ recipient_id: a.recipient_id });
  await assert.rejects(transfers.complete({ recipient_id: a.recipient_id, envelope: seal(a) }));
  const b = await transfers.prepare({ setup, credential_file: path }); now += 301;
  await assert.rejects(transfers.complete({ recipient_id: b.recipient_id, envelope: seal(b) }));
});

test('actual stdio MCP initializes and advertises local private-transfer and Apple bootstrap tools', async () => {
  const child = spawn(process.execPath, ['scripts/private-companion.mjs']);
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) + '\n' +
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n' +
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(stderr, ''); const replies = stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].result.protocolVersion, '2025-03-26');
  assert.deepEqual(replies[1].result.tools.map(x => x.name), ['check_plugin_version', 'inspect_google_context', 'list_google_reader_candidates', 'prepare_apple_reader', 'create_google_reader_key', 'prepare_private_transfer', 'complete_private_transfer', 'cancel_private_transfer', 'bootstrap_apple_reports']);
  assert(!stdout.includes('"private_key"'));
  assert(!stdout.includes('BEGIN PRIVATE KEY'));
});

test('MCP exposes version checking without shell access, credential reads or update execution', async t => {
  const { directory } = await fixture(t);
  const preload = join(directory, 'release-fixture.mjs');
  await writeFile(preload, `globalThis.fetch = async (url, options) => {
    if (url !== 'https://api.github.com/repos/InstallTally/installtally-ai-plugins/releases/latest' || options.method !== 'GET' || Object.keys(options.headers).some(k => k.toLowerCase() === 'authorization')) throw Error('PRIVATE_ERROR');
    return new Response(JSON.stringify({ tag_name: 'v0.1.9', draft: false, prerelease: false }), { headers: { 'content-type': 'application/json' } });
  };`);
  const child = spawn(process.execPath, ['--import', preload, 'scripts/private-companion.mjs']);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'check_plugin_version', arguments: {} } }) + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const reply = JSON.parse(stdout); assert.ok(reply.result, stdout); assert.equal(reply.result.isError, undefined, stdout);
  const value = JSON.parse(reply.result.content[0].text);
  assert.ok(['current', 'update_available'].includes(value.status));
  assert.equal(value.latest_version, '0.1.9');
  assert.equal(stderr, ''); assert.ok(!stdout.includes('PRIVATE_ERROR'));
});

test('MCP Google authorization failure returns an actionable blocker instead of requesting nonexistent reader paths', async t => {
  const { directory } = await fixture(t), bin = join(directory, 'bin');
  const { mkdir } = await import('node:fs/promises'); await mkdir(bin, { mode: 0o700 });
  await writeFile(join(bin, 'gcloud'), `#!${process.execPath}\nconsole.error('ERROR: Reauthentication failed. cannot prompt during non-interactive execution. PRIVATE_TOKEN_AND_PATH');process.exit(1);`, { mode: 0o700 });
  const child = spawn(process.execPath, ['scripts/private-companion.mjs'], { env: { ...process.env, PATH: bin + ':' + process.env.PATH } });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_google_reader_candidates', arguments: { account: 'owner@example.test', project_id: 'owned-project' } } }) + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const reply = JSON.parse(stdout); assert.equal(reply.result.isError, true);
  const blocker = JSON.parse(reply.result.content[0].text);
  assert.equal(blocker.error_code, 'needs_google_authorization');
  assert.equal(blocker.state, 'waiting_for_provider_authorization');
  assert.equal(blocker.request_reader_paths, false);
  assert.equal(blocker.retry_without_changes, false);
  assert.equal(typeof blocker.next_action, 'string'); assert.ok(blocker.next_action.length > 0);
  assert.equal(stderr, ''); assert.doesNotMatch(stdout, /PRIVATE_TOKEN|PRIVATE_MESSAGE|PRIVATE_SECRET/);
});
