/** Read-only stable-release check. No credentials, local writes or update execution. */
import { open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEASE_URL = 'https://api.github.com/repos/InstallTally/installtally-ai-plugins/releases/latest';
const BUNDLE = fileURLToPath(new URL('../', import.meta.url));
const MAX_BYTES = 65536;

function version(value) {
  if (typeof value !== 'string' || value.length > 128) throw new Error('Invalid version');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  if (!match || match[0] !== value) throw new Error('Invalid version');
  const pre = match[4]?.split('.') ?? [];
  if (pre.some(part => /^\d+$/.test(part) && !/^(0|[1-9]\d*)$/.test(part))) throw new Error('Invalid version');
  return { core: match.slice(1, 4).map(BigInt), pre };
}

export function compareVersions(left, right) {
  const a = version(left), b = version(right);
  const compare = (x, y) => x === y ? 0 : x < y ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    const order = compare(a.core[i], b.core[i]);
    if (order) return order;
  }
  if (!a.pre.length || !b.pre.length) return compare(Boolean(b.pre.length), Boolean(a.pre.length));
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    if (a.pre[i] === undefined || b.pre[i] === undefined) return compare(a.pre.length, b.pre.length);
    const numericA = /^\d+$/.test(a.pre[i]), numericB = /^\d+$/.test(b.pre[i]);
    const order = numericA && numericB ? compare(BigInt(a.pre[i]), BigInt(b.pre[i]))
      : numericA !== numericB ? numericA ? -1 : 1 : compare(a.pre[i], b.pre[i]);
    if (order) return order;
  }
  return 0;
}

export async function installedVersion(root = BUNDLE) {
  const versions = [];
  for (const directory of ['.claude-plugin', '.codex-plugin']) {
    const handle = await open(join(root, directory, 'plugin.json'), 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 16384) throw new Error('Invalid manifest');
      const buffer = Buffer.alloc(16385);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 16384) throw new Error('Invalid manifest');
      const manifest = JSON.parse(buffer.subarray(0, bytesRead).toString());
      if (manifest.name !== 'installtally') throw new Error('Invalid manifest');
      version(manifest.version);
      versions.push(manifest.version);
    } finally { await handle.close(); }
  }
  if (versions[0] !== versions[1]) throw new Error('Inconsistent manifests');
  return versions[0];
}

async function releaseDocument(response) {
  const type = response.headers.get('content-type')?.split(';')[0].trim();
  if (response.status !== 200 || !['application/json', 'application/vnd.github+json'].includes(type)
    || Number(response.headers.get('content-length') ?? 0) > MAX_BYTES || !response.body) throw new Error('Release unavailable');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > MAX_BYTES) throw new Error('Response too large');
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString());
  if (data.draft !== false || data.prerelease !== false || typeof data.tag_name !== 'string') throw new Error('Invalid release');
  const latest = data.tag_name.startsWith('v') ? data.tag_name.slice(1) : data.tag_name;
  if (version(latest).pre.length) throw new Error('Not a stable version');
  return { latest, tag: data.tag_name };
}

export async function checkPluginVersion(installed, { fetchImpl = fetch } = {}) {
  try { version(installed); }
  catch { return { status: 'unknown', installed_version: null, latest_version: null, reason: 'installed_version_unavailable' }; }
  const unknown = { status: 'unknown', installed_version: installed, latest_version: null, reason: 'release_unavailable' };
  try {
    const response = await fetchImpl(RELEASE_URL, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'installtally-version-check', 'X-GitHub-Api-Version': '2022-11-28' } });
    const { latest, tag } = await releaseDocument(response);
    const order = compareVersions(installed, latest);
    const result = { status: order === 0 ? 'current' : order > 0 ? 'ahead' : 'update_available',
      installed_version: installed, latest_version: latest,
      release_url: `https://github.com/InstallTally/installtally-ai-plugins/releases/tag/${encodeURIComponent(tag)}` };
    if (order >= 0) return result;
    return { ...result, restart_required: true, update_commands: {
      codex: ['codex plugin marketplace upgrade installtally', 'codex plugin add installtally@installtally'],
      claude: ['claude plugin marketplace update installtally', 'claude plugin update installtally@installtally']
    } };
  } catch { return unknown; }
}

async function main() {
  if (process.argv.length > 2) {
    if (process.argv.length === 3 && process.argv[2] === '--help') {
      process.stdout.write('Check the loaded InstallTally bundle against its latest stable public release. No update is executed.\n');
    } else {
      process.stdout.write(JSON.stringify({ status: 'unknown', reason: 'invalid_arguments', installed_version: null, latest_version: null }) + '\n');
    }
    return;
  }
  let current;
  try { current = await installedVersion(); }
  catch {
    process.stdout.write(JSON.stringify({ status: 'unknown', reason: 'installed_version_unavailable', installed_version: null, latest_version: null }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(await checkPluginVersion(current)) + '\n');
}

// Plugin hosts can expose bundle directories through symlinks. Resolve only
// the entry script identity, never scan client settings or unrelated files.
let isEntry = false;
try { isEntry = Boolean(process.argv[1]) && await realpath(process.argv[1]) === fileURLToPath(import.meta.url); } catch {}
if (isEntry) await main();
