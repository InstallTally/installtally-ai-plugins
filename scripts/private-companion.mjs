/** Local MCP private transfer. Secrets stay in this process and direct TLS requests. */
import { constants as cryptoConstants, createDecipheriv, generateKeyPairSync, privateDecrypt, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { bootstrap, BootstrapError, loadCredential } from '../skills/setup-app-store-reports/scripts/apple-bootstrap.mjs';

const AAD = Buffer.from('installtally-private-handoff-v1');
const ID = /^[A-Za-z0-9_-]{43}$/;
const MAX_BYTES = 32768;
const fail = code => { throw new Error(`Private MCP operation failed (${code})`); };
function origin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) fail('origin');
    return value;
  } catch { fail('origin'); }
}
function bytes(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum * 2 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('envelope');
  const result = Buffer.from(value, 'base64url');
  if (result.length > maximum || result.toString('base64url') !== value) fail('envelope');
  return result;
}
async function credentialFile(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_BYTES || (process.platform !== 'win32'
      && ((info.mode & 0o077) || info.uid !== process.getuid()))) fail('private_file');
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    try {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_BYTES) fail('private_file');
      const value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('private_file');
      return value;
    } finally { buffer.fill(0); }
  } catch { fail('private_file'); }
  finally { await handle?.close(); }
}
async function document(response) {
  if (response.status !== 200 || response.headers.get('content-type')?.split(';')[0].trim() !== 'application/json'
    || Number(response.headers.get('content-length') || 0) > MAX_BYTES || !response.body) fail('upload_not_confirmed');
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length; if (length > MAX_BYTES) fail('upload_not_confirmed'); chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createTransfers({ apiOrigin = 'https://api.installtally.com', fetchImpl = fetch,
  clock = () => Math.floor(Date.now() / 1000) } = {}) {
  const trustedOrigin = origin(apiOrigin), sessions = new Map();
  function prune() { for (const [id, session] of sessions) if (session.expires_at <= clock()) sessions.delete(id); }
  return {
    async prepare({ setup, credential_file }) {
      prune();
      if (!setup || !['app_store', 'google_play'].includes(setup.provider)
        || ['id', 'workspace', 'product_id', 'destination'].some(key => typeof setup[key] !== 'string'
          || !/^[A-Za-z0-9._-]{1,200}$/.test(setup[key]))
        || typeof credential_file !== 'string' || !isAbsolute(credential_file) || credential_file.length > 4096) fail('configuration');
      if (sessions.size >= 8) fail('capacity');
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
      const recipient_id = randomBytes(32).toString('base64url'), expires_at = clock() + 300;
      sessions.set(recipient_id, { setup: { ...setup }, credential_file, privateKey, expires_at });
      return { recipient_id, recipient_public_key: publicKey.export({ type: 'spki', format: 'pem' }).toString(), expires_at };
    },
    async complete({ recipient_id, envelope }) {
      prune(); const session = sessions.get(recipient_id); sessions.delete(recipient_id);
      if (!session) fail('recipient_unavailable');
      let key, plain;
      try {
        if (!envelope || envelope.version !== 1 || Object.keys(envelope).sort().join(',') !== 'ciphertext,key,nonce,version') fail('envelope');
        key = privateDecrypt({ key: session.privateKey, oaepHash: 'sha256', padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING }, bytes(envelope.key, 512));
        const nonce = bytes(envelope.nonce, 12), ciphertext = bytes(envelope.ciphertext, 8192);
        if (nonce.length !== 12 || ciphertext.length <= 16 || key.length !== 32) fail('envelope');
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(AAD); decipher.setAuthTag(ciphertext.subarray(-16));
        plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
        const payload = JSON.parse(plain.toString('utf8'));
        if (payload.recipient_id !== recipient_id || !ID.test(payload.token)
          || payload.upload_url !== trustedOrigin + '/private/provider-handoff'
          || !Number.isSafeInteger(payload.expires_at) || payload.expires_at <= clock() || payload.expires_at > clock() + 300
          || payload.setup_id !== session.setup.id
          || ['workspace', 'product_id', 'provider', 'destination'].some(key => payload[key] !== session.setup[key])) fail('binding');
        const credentials = await credentialFile(session.credential_file);
        const response = await fetchImpl(payload.upload_url, { method: 'PUT', redirect: 'manual',
          signal: AbortSignal.timeout(15000), headers: { Authorization: `ProviderHandoff ${payload.token}`,
            'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'installtally-private-companion/1' },
          body: JSON.stringify({ credentials }) });
        const result = await document(response);
        if (result.id !== session.setup.id || result.credential_saved !== true || result.state !== 'configuring'
          || ['workspace', 'product_id', 'provider', 'destination'].some(key => result[key] !== session.setup[key])) fail('upload_not_confirmed');
        return { setup_id: session.setup.id, state: 'credentials_saved', provider: session.setup.provider,
          provider_access_verified: false, next_action: 'Resume provider setup through the authenticated InstallTally MCP.' };
      } catch { fail('transfer_not_confirmed'); }
      finally { key?.fill(0); plain?.fill(0); }
    },
    cancel({ recipient_id }) { sessions.delete(recipient_id); return { state: 'local_recipient_discarded' }; }
  };
}

const string = { type: 'string' };
const object = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const tools = [
  { name: 'prepare_private_transfer', description: 'Prepare an ephemeral local recipient for one explicitly selected private reader credential file. Only the absolute file path and nonsecret setup state are arguments. Does not read or return the credential. Requires user authorization for the selected file and destination.',
    inputSchema: object({ setup: object({ id: string, workspace: string, product_id: string, provider: { enum: ['app_store', 'google_play'] }, destination: string }), credential_file: string }) },
  { name: 'complete_private_transfer', description: 'Open the encrypted owner-authorized envelope in memory and upload the selected file directly to the configured InstallTally API over TLS. Never returns file content or capability. A successful save does not prove provider access or report imports.',
    inputSchema: object({ recipient_id: string, envelope: object({ version: { const: 1 }, key: string, nonce: string, ciphertext: string }) }) },
  { name: 'cancel_private_transfer', description: 'Discard an ephemeral local recipient. Does not remove existing remote connections or provider permissions.', inputSchema: object({ recipient_id: string }) },
  { name: 'bootstrap_apple_reports', description: 'Use an explicitly selected private local Admin credential manifest to read/reuse an ONGOING Analytics request for the selected app. Create only with explicit approve_create authorization. Admin key stays local; no browser or key upload. Returns safe request state.',
    inputSchema: object({ app_id: string, credential_manifest: string, approve_create: { type: 'boolean' } }) }
].map(tool => ({ ...tool, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: tool.name !== 'cancel_private_transfer' } }));

export async function serve() {
  const transfers = createTransfers({ apiOrigin: process.env.INSTALLTALLY_API_ORIGIN || 'https://api.installtally.com' });
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let message;
    try {
      if (Buffer.byteLength(line) > 65536) fail('request_size');
      message = JSON.parse(line);
      if (message.jsonrpc !== '2.0') fail('request');
      if (message.id === undefined) continue;
      let result;
      if (message.method === 'initialize') {
        if (!['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(message.params?.protocolVersion)) fail('protocol');
        result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'installtally-private', version: '0.1.5' } };
      } else if (message.method === 'ping') result = {};
      else if (message.method === 'tools/list') result = { tools };
      else if (message.method === 'tools/call') {
        const { name, arguments: args } = message.params || {};
        const tool = tools.find(tool => tool.name === name);
        if (!tool || !args || typeof args !== 'object' || Array.isArray(args)
          || Object.keys(args).sort().join(',') !== Object.keys(tool.inputSchema.properties).sort().join(',')) fail('arguments');
        let value;
        try {
          if (name === 'prepare_private_transfer') value = await transfers.prepare(args);
          if (name === 'complete_private_transfer') value = await transfers.complete(args);
          if (name === 'cancel_private_transfer') value = transfers.cancel(args);
          if (name === 'bootstrap_apple_reports') {
            if (typeof args.approve_create !== 'boolean') fail('approval');
            value = await bootstrap({ appId: args.app_id, credential: await loadCredential(args.credential_manifest), approveCreate: args.approve_create });
          }
          result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
        } catch (error) {
          // Only helper-defined codes are safe; never serialize provider errors or file paths.
          const text = name === 'bootstrap_apple_reports' && error instanceof BootstrapError
            ? JSON.stringify({ error_code: error.code })
            : 'Private MCP operation did not complete. Check the selected private file, permission, setup status and authorization; secrets are never returned.';
          result = { isError: true, content: [{ type: 'text', text }] };
        }
      } else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } }) + '\n'); continue; }
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n');
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'Invalid private MCP request' } }) + '\n');
    }
  }
}

if (process.argv[1] && await realpath(process.argv[1]).catch(() => '') === fileURLToPath(import.meta.url)) {
  try { await serve(); } catch { process.stderr.write('InstallTally private MCP failed to start. Check Node and the configured HTTPS API origin.\n'); process.exitCode = 1; }
}
