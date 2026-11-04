import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkPluginVersion, compareVersions, installedVersion, RELEASE_URL } from '../scripts/check-plugin-version.mjs';

const release = (version, changes = {}) => new Response(JSON.stringify({ tag_name: 'v' + version, draft: false, prerelease: false, ...changes }), {
  headers: { 'content-type': 'application/json' }
});

test('current version performs one anonymous read and never offers an unnecessary update', async () => {
  let calls = 0;
  const result = await checkPluginVersion('0.1.4', { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.github.com/repos/InstallTally/installtally-ai-plugins/releases/latest');
    assert.equal(url, RELEASE_URL);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    assert.equal(Object.keys(options.headers).some(name => name.toLowerCase() === 'authorization'), false);
    assert.equal(options.body, undefined);
    return release('0.1.4');
  } });
  assert.equal(calls, 1);
  assert.equal(result.status, 'current');
  assert.equal(result.update_commands, undefined);
});

test('newer stable release proposes exact client commands but does not execute them', async () => {
  const result = await checkPluginVersion('0.1.9', { fetchImpl: async () => release('0.1.10') });
  assert.equal(result.status, 'update_available');
  assert.equal(result.installed_version, '0.1.9');
  assert.equal(result.latest_version, '0.1.10');
  assert.equal(result.release_url, 'https://github.com/InstallTally/installtally-ai-plugins/releases/tag/v0.1.10');
  assert.deepEqual(result.update_commands.codex, ['codex plugin marketplace upgrade installtally', 'codex plugin add installtally@installtally']);
  assert.deepEqual(result.update_commands.claude, ['claude plugin marketplace update installtally', 'claude plugin update installtally@installtally']);
  assert.equal(result.restart_required, true);
});

test('newer local builds are never downgraded', async () => {
  const result = await checkPluginVersion('0.2.0', { fetchImpl: async () => release('0.1.4') });
  assert.equal(result.status, 'ahead');
  assert.equal(result.update_commands, undefined);
});

test('semantic version precedence handles numeric components, prereleases and build metadata', () => {
  for (const [left, right, expected] of [
    ['0.1.10', '0.1.9', 1], ['0.2.0', '0.10.0', -1], ['1.0.0', '1.0.0-rc.2', 1],
    ['1.0.0-rc.10', '1.0.0-rc.2', 1], ['1.0.0-alpha', '1.0.0-alpha.1', -1],
    ['1.0.0+build1', '1.0.0+build2', 0], ['1.0.0-1', '1.0.0-alpha', -1]
  ]) assert.equal(compareVersions(left, right), expected, `${left} / ${right}`);
  for (const value of ['v1.2.3', '01.2.3', '1.2', '1.2.3-01', '1.2.3\n', '1.2.3;echo private', '9'.repeat(200)]) {
    assert.throws(() => compareVersions(value, '1.0.0'));
  }
});

test('offline and rate limits remain unknown and never imply current or retry automatically', async () => {
  for (const fetchImpl of [async () => { throw new Error('PRIVATE_NETWORK_DETAIL'); }, async () => new Response(null, { status: 403 }), async () => new Response(null, { status: 429 })]) {
    const result = await checkPluginVersion('0.1.4', { fetchImpl });
    assert.equal(result.status, 'unknown');
    assert.equal(result.latest_version, null);
    assert.equal(result.update_commands, undefined);
    assert.ok(!JSON.stringify(result).includes('PRIVATE_NETWORK_DETAIL'));
  }
});

test('redirects, unpublished releases and hostile metadata cannot supply commands or URLs', async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { location: 'https://attacker.example' } }),
    release('0.2.0', { draft: true }), release('0.2.0', { prerelease: true }),
    release('0.2.0', { tag_name: 'v0.2.0; curl attacker.example' }),
    release('0.2.0', { tag_name: 'https://attacker.example' }),
    release('0.2.0-beta.1'), new Response('not json', { headers: { 'content-type': 'application/json' } }),
    new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } })
  ]) {
    const result = await checkPluginVersion('0.1.4', { fetchImpl: async () => response });
    assert.equal(result.status, 'unknown');
    assert.equal(result.update_commands, undefined);
    assert.ok(!JSON.stringify(result).includes('attacker'));
  }
  const result = await checkPluginVersion('0.1.4', { fetchImpl: async () => release('0.2.0', { html_url: 'https://attacker.example' }) });
  assert.equal(result.release_url, 'https://github.com/InstallTally/installtally-ai-plugins/releases/tag/v0.2.0');
});

test('an invalid local version never sends a request', async () => {
  const result = await checkPluginVersion('unknown', { fetchImpl: async () => assert.fail('network') });
  assert.equal(result.status, 'unknown');
});

test('the checker reads only its supplied bundle manifests and requires matching versions', async t => {
  const root = await mkdtemp(join(tmpdir(), 'installtally-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const dir of ['.claude-plugin', '.codex-plugin']) {
    await mkdir(join(root, dir));
    await writeFile(join(root, dir, 'plugin.json'), JSON.stringify({ name: 'installtally', version: '0.1.4' }));
  }
  assert.equal(await installedVersion(root), '0.1.4');
  await writeFile(join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'installtally', version: '0.1.3' }));
  await assert.rejects(installedVersion(root));
});
