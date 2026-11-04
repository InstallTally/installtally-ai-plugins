import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, readFile, realpath, stat, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareAppleReader, createGoogleReaderKey } from '../scripts/store-access.mjs';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'installtally-access-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const path = join(directory, 'reader.p8');
  await writeFile(path, key, { mode: 0o600 });
  return { directory, key, path };
}
const apple = f => ({ issuer_id: '12345678-1234-1234-1234-123456789012', key_id: 'ABCDEFGHIJ',
  private_key_path: f.path, private_directory: join(f.directory, 'prepared'), acknowledge_sales_reader: true });
const google = f => ({ account: 'owner@example.test', project_id: 'owned-project',
  service_account: 'reader@owned-project.iam.gserviceaccount.com', private_directory: join(f.directory, 'prepared'), approve_create: true });
const googleKey = { type: 'service_account', project_id: 'owned-project', client_email: 'reader@owned-project.iam.gserviceaccount.com',
  private_key_id: 'synthetic-key', private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) };

test('Apple p8 is packaged privately, reused on resume, and never returned as content', async t => {
  const f = await fixture(t), args = apple(f);
  const first = await prepareAppleReader(args);
  const second = await prepareAppleReader(args);
  assert.equal(first.state, 'reader_prepared');
  assert.equal(first.credential_file, second.credential_file);
  assert.equal(second.reused, true);
  assert.equal(first.provider_access_verified, false);
  assert.equal((await stat(first.credential_file)).mode & 0o777, 0o600);
  assert.equal((await stat(args.private_directory)).mode & 0o777, 0o700);
  assert.deepEqual(JSON.parse(await readFile(first.credential_file, 'utf8')), {
    issuer_id: args.issuer_id, key_id: args.key_id, private_key: f.key
  });
  assert.ok(!JSON.stringify(first).includes('BEGIN PRIVATE KEY'));
});

test('Apple preparation requires the selected reader and rejects broad files, symlinks and repository output', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareAppleReader({ ...apple(f), acknowledge_sales_reader: false }), /approval/);
  const broad = join(f.directory, 'broad.p8'); await writeFile(broad, f.key, { mode: 0o644 });
  await assert.rejects(prepareAppleReader({ ...apple(f), private_key_path: broad }), /private_file/);
  const link = join(f.directory, 'link.p8'); await symlink(f.path, link);
  await assert.rejects(prepareAppleReader({ ...apple(f), private_key_path: link }), /private_file/);
  await mkdir(join(f.directory, '.git'));
  await assert.rejects(prepareAppleReader(apple(f)), /version_control/);
});

test('Google key creation requires approval and reuses one private key without creating again', async t => {
  const f = await fixture(t); let calls = 0;
  const run = async (command, args) => {
    calls++;
    assert.equal(command, 'gcloud');
    assert.deepEqual(args.slice(0, 4), ['iam', 'service-accounts', 'keys', 'create']);
    assert.ok(args.includes('--account=owner@example.test'));
    assert.ok(args.includes('--iam-account=' + googleKey.client_email));
    await writeFile(args[4], JSON.stringify(googleKey), { mode: 0o600 });
  };
  await assert.rejects(createGoogleReaderKey({ ...google(f), approve_create: false }, { run }), /approval/);
  assert.equal(calls, 0);
  const first = await createGoogleReaderKey(google(f), { run });
  const second = await createGoogleReaderKey(google(f), { run });
  assert.equal(calls, 1);
  assert.equal(first.credential_file, second.credential_file);
  assert.equal(second.reused, true);
  assert.equal(first.provider_access_verified, false);
  assert.ok(!JSON.stringify(first).includes('BEGIN PRIVATE KEY'));
});

test('unknown Google creation outcomes block retries and never expose subprocess errors', async t => {
  const f = await fixture(t); let calls = 0;
  const run = async () => { calls++; throw Error('PRIVATE_SUBPROCESS_ERROR'); };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(createGoogleReaderKey(google(f), { run }), error => {
      assert.match(error.message, /creation_status_unknown/);
      assert.ok(!error.message.includes('PRIVATE_SUBPROCESS_ERROR'));
      return true;
    });
  }
  assert.equal(calls, 1);
});

test('wrong Google identity and existing output are never accepted or overwritten', async t => {
  const f = await fixture(t);
  await assert.rejects(createGoogleReaderKey({ ...google(f), service_account: '--malicious' }, { run: () => assert.fail() }), /configuration/);
  await assert.rejects(createGoogleReaderKey(google(f), { run: async (_, args) => {
    await writeFile(args[4], JSON.stringify({ ...googleKey, project_id: 'wrong-project' }), { mode: 0o600 });
  } }), /creation_status_unknown/);
});

test('Google output is made owner-only even when the CLI creates a broader file', async t => {
  const f = await fixture(t);
  const prepared = await createGoogleReaderKey(google(f), { run: async (_, args) => {
    await writeFile(args[4], JSON.stringify(googleKey), { mode: 0o644 });
  } });
  assert.equal((await stat(prepared.credential_file)).mode & 0o777, 0o600);
});

test('Apple same-identity key replacement is refused without changing the saved reader', async t => {
  const f = await fixture(t), args = apple(f), first = await prepareAppleReader(args);
  const before = await readFile(first.credential_file);
  const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  await writeFile(f.path, other, { mode: 0o600 });
  await assert.rejects(prepareAppleReader(args), /existing_reader_conflict/);
  assert.deepEqual(await readFile(first.credential_file), before);
});

test('local Google discovery reads only selected nonsecret config metadata, never tokens or other accounts', async () => {
  const { inspectGoogleContext } = await import('../scripts/store-access.mjs');
  const calls = [];
  const value = await inspectGoogleContext({ run: async (command, args) => {
    calls.push([command, args]);
    return { stdout: args.includes('core/account') ? 'owner@example.test\n' : 'owned-project\n' };
  } });
  assert.equal(calls.length, 2);
  for (const [command, args] of calls) {
    assert.equal(command, 'gcloud'); assert.deepEqual(args.slice(0, 2), ['config', 'get-value']);
    assert.ok(!args.some(x => /token|auth|list|login/.test(x)));
  }
  assert.deepEqual(value, { account: 'owner@example.test', project_id: 'owned-project', provider_authorization_verified: false });
  await assert.rejects(inspectGoogleContext({ run: async () => { throw Error('PRIVATE_AUTH_ERROR'); } }), /local_context_unavailable/);
});

test('actual companion MCP prepares Apple JSON and rejects unapproved Google creation without leaking keys', async t => {
  const { spawn } = await import('node:child_process');
  const f = await fixture(t);
  const child = spawn(process.execPath, ['scripts/private-companion.mjs']);
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.stdin.end([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'prepare_apple_reader', arguments: apple(f) } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_google_reader_key', arguments: { ...google(f), approve_create: false } } },
    { jsonrpc: '2.0', id: 3, method: 'ping' }
  ].map(JSON.stringify).join('\n') + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(stderr, '');
  const replies = stdout.trim().split('\n').map(JSON.parse);
  const prepared = JSON.parse(replies[0].result.content[0].text);
  assert.equal(prepared.state, 'reader_prepared');
  assert.equal(JSON.parse(await readFile(prepared.credential_file, 'utf8')).private_key, f.key);
  assert.equal(replies[1].result.isError, true);
  assert.equal(JSON.parse(replies[1].result.content[0].text).error_code, 'approval');
  assert.deepEqual(replies[2].result, {});
  assert.ok(!stdout.includes(f.key)); assert.ok(!stdout.includes('BEGIN PRIVATE KEY'));
});

test('actual MCP Google CLI subprocess captures output, pins account and disables ambient identity overrides', async t => {
  const { spawn } = await import('node:child_process');
  const f = await fixture(t), bin = join(f.directory, 'bin'); await mkdir(bin, { mode: 0o700 });
  const cli = `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
for (const name of ['CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT', 'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE', 'CLOUDSDK_AUTH_ACCESS_TOKEN_FILE', 'CLOUDSDK_AUTH_ACCESS_TOKEN']) {
  if (process.env[name] !== '') process.exit(2);
}
if (args[0] === 'config') console.log(args[2] === 'core/account' ? 'owner@example.test' : 'owned-project');
else {
  if (!args.includes('--account=owner@example.test') || !args.includes('--quiet')) process.exit(3);
  writeFileSync(args[4], ${JSON.stringify(JSON.stringify(googleKey))}, { mode: 0o644 });
  console.log('PRIVATE_CLI_OUTPUT');
}
console.error('PRIVATE_CLI_ERROR');\n`;
  await writeFile(join(bin, 'gcloud'), cli, { mode: 0o700 });
  const child = spawn(process.execPath, ['scripts/private-companion.mjs'], {
    env: { ...process.env, PATH: bin + ':' + process.env.PATH, CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT: 'unapproved@example.test', CLOUDSDK_AUTH_ACCESS_TOKEN: 'PRIVATE_AMBIENT_TOKEN' }
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  child.stdin.end([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'inspect_google_context', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'create_google_reader_key', arguments: google(f) } }
  ].map(JSON.stringify).join('\n') + '\n');
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const replies = stdout.trim().split('\n').map(JSON.parse);
  assert.equal(replies[0].result.isError, undefined, stdout);
  assert.equal(JSON.parse(replies[0].result.content[0].text).account, 'owner@example.test');
  assert.equal(replies[1].result.isError, undefined, stdout);
  const prepared = JSON.parse(replies[1].result.content[0].text);
  assert.equal(prepared.state, 'reader_prepared');
  assert.equal((await stat(prepared.credential_file)).mode & 0o777, 0o600);
  assert.equal(stderr, '');
  assert.doesNotMatch(stdout, /PRIVATE_CLI|PRIVATE_AMBIENT|BEGIN PRIVATE KEY/);
});
