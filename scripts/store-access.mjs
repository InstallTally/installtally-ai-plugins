/** Local reader preparation. Never returns keys or changes provider permissions. */
import { createHash, createPrivateKey } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export class StoreAccessError extends Error {
  constructor(code) { super(`Store access preparation failed (${code})`); this.code = code; }
}
const fail = code => { throw new StoreAccessError(code); };
function googleReadFailure(error, fallback) {
  if (error?.code === 'ENOENT') return 'gcloud_not_installed';
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return fallback;
  if (error?.code === 'ETIMEDOUT' || error?.killed === true) return 'google_metadata_timeout';
  // Classify privately into fixed codes. Never expose provider text or infer
  // authentication failure from generic "gcloud auth login" advice alone.
  const stderr = typeof error?.stderr === 'string' ? error.stderr.slice(0, 32768).toLowerCase() : '';
  if (/service_disabled|api[^\n]*(?:has not been used|not enabled|is disabled)/.test(stderr)) return 'needs_google_iam_api';
  if (/invalid_grant|invalid_rapt|reauthentication|problem refreshing[^\n]*auth|refresherror|no active account|do not currently have an active account|no valid credentials|credentials[^\n]*expired|token[^\n]*expired/.test(stderr)) return 'needs_google_authorization';
  if (/permission_denied|permission[^\n]*denied|\b403\b/.test(stderr)) return 'needs_google_iam_permission';
  if (/not_found|project[^\n]*not found|\b404\b/.test(stderr)) return 'needs_google_project_selection';
  return fallback;
}
export function storeAccessBlocker(error) {
  if (!(error instanceof StoreAccessError)) return null;
  const actions = {
    needs_google_authorization: ['waiting_for_provider_authorization', 'Restore existing authorized local Google access for the selected account, or select an already-authorized alternative. Do not start a browser/login flow or request nonexistent previously approved reader paths.'],
    needs_google_iam_permission: ['waiting_for_provider_permission', 'The selected local account cannot list IAM reader metadata. Obtain the specific metadata-read authority separately or identify an already-authorized reader; discovery failure does not prove a reader is absent.'],
    needs_google_iam_api: ['waiting_for_provider_api', 'The selected project needs its IAM API prerequisite resolved by its owner. Do not enable APIs or create credentials automatically.'],
    needs_google_project_selection: ['waiting_for_project_selection', 'Verify the exact selected Cloud project and its availability to the selected account. Do not choose an app or reader from the project name.'],
    gcloud_not_installed: ['waiting_for_local_tool', 'Make the supported local Google CLI available through an authorized setup action, or select an already-approved reader. Do not install software automatically.'],
    google_metadata_timeout: ['waiting_for_provider_diagnostics', 'Report that metadata discovery timed out. Do not infer missing readers, repeat automatically or request nonexistent file paths.'],
    reader_discovery_unavailable: ['waiting_for_provider_diagnostics', 'Report that metadata discovery did not complete; its cause is unverified. Do not infer missing readers or request supposedly previously approved paths.'],
    local_context_unavailable: ['waiting_for_provider_diagnostics', 'The current local Google context could not be inspected. Report that prerequisite without assuming reader files exist.']
  };
  const action = actions[error.code];
  return action ? { error_code: error.code, state: action[0], request_reader_paths: false,
    retry_without_changes: false, next_action: action[1] } : { error_code: error.code };
}
const fingerprint = values => createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 24);
const result = (credential_file, reused) => ({ state: 'reader_prepared', credential_file, reused,
  provider_access_verified: false, transfer_authorized: false });

async function privateFile(path, maximum = 32768) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail('configuration');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    if (!info.isFile() || info.size > maximum || process.platform === 'win32'
      || (info.mode & 0o077) || info.uid !== process.getuid()) fail('private_file');
    const buffer = Buffer.alloc(maximum + 1);
    try {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maximum) fail('private_file');
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally { buffer.fill(0); }
  } catch { fail('private_file'); }
  finally { await handle?.close(); }
}
async function outsideVersionControl(path) {
  // Refuse any worktree, including submodules and linked-worktree .git files.
  for (let current = resolve(path); ; current = dirname(current)) {
    try { await lstat(join(current, '.git')); fail('version_control'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dirname(current) === current) break;
  }
}
async function privateDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.length > 4096 || process.platform === 'win32') fail('configuration');
  await outsideVersionControl(path);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)
    || info.uid !== process.getuid() || await realpath(path) !== resolve(path)) fail('private_directory');
  return resolve(path);
}
async function writeNew(path, value) {
  const handle = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
}
export async function prepareAppleReader({ issuer_id, key_id, private_key_path, private_directory, acknowledge_sales_reader }) {
  if (acknowledge_sales_reader !== true) fail('approval');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(issuer_id)
    || !/^[A-Z0-9]{10}$/.test(key_id)) fail('configuration');
  const directory = await privateDirectory(private_directory);
  if (typeof private_key_path !== 'string' || !isAbsolute(private_key_path)) fail('configuration');
  await outsideVersionControl(dirname(await realpath(private_key_path)));
  const pem = await privateFile(private_key_path, 16384);
  try {
    const key = createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') fail('private_file');
  } catch { fail('private_file'); }
  const value = { issuer_id, key_id, private_key: pem };
  const path = join(directory, 'apple-' + fingerprint([issuer_id, key_id]) + '.json');
  try { await writeNew(path, value); return result(path, false); }
  catch (error) {
    if (error.code !== 'EEXIST') fail('private_file');
    let existing;
    try { existing = JSON.parse(await privateFile(path)); } catch { fail('existing_reader_conflict'); }
    if (Object.keys(existing).sort().join(',') !== 'issuer_id,key_id,private_key'
      || existing.issuer_id !== issuer_id || existing.key_id !== key_id || existing.private_key !== pem) fail('existing_reader_conflict');
    return result(path, true);
  }
}
const execute = promisify(execFile);
async function runGcloud(command, args) {
  return await execute(command, args, { timeout: 45000, maxBuffer: 32768, windowsHide: true,
    env: { ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: '1', CLOUDSDK_CORE_LOG_HTTP: 'false', CLOUDSDK_CORE_VERBOSITY: 'error',
      // Ambient overrides must not silently replace the explicitly selected account.
      CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT: '', CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE: '',
      CLOUDSDK_AUTH_ACCESS_TOKEN_FILE: '', CLOUDSDK_AUTH_ACCESS_TOKEN: '' } });
}
export async function inspectGoogleContext({ run = runGcloud } = {}) {
  try {
    const account = (await run('gcloud', ['config', 'get-value', 'core/account', '--quiet'])).stdout.trim();
    const project = (await run('gcloud', ['config', 'get-value', 'core/project', '--quiet'])).stdout.trim();
    return { account: /^[A-Za-z0-9][A-Za-z0-9@._+-]{2,253}$/.test(account) ? account : null,
      project_id: /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) ? project : null,
      provider_authorization_verified: false };
  } catch (error) { fail(googleReadFailure(error, 'local_context_unavailable')); }
}
export async function listGoogleReaderCandidates({ account, project_id }, { run = runGcloud } = {}) {
  if (typeof account !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9@._+-]{2,253}$/.test(account)
    || typeof project_id !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project_id)) fail('configuration');
  let stdout;
  try {
    ({ stdout } = await run('gcloud', ['iam', 'service-accounts', 'list',
      '--project=' + project_id, '--account=' + account, '--limit=101', '--format=json(email,disabled)', '--quiet']));
  } catch (error) { fail(googleReadFailure(error, 'reader_discovery_unavailable')); }
  try {
    if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 32768) fail('reader_discovery_unavailable');
    const rows = JSON.parse(stdout);
    if (!Array.isArray(rows) || rows.length > 101) fail('reader_discovery_unavailable');
    const candidates = rows.slice(0, 100).filter(row => row && typeof row.email === 'string'
      && /^[a-z][a-z0-9-]{4,28}[a-z0-9]@/.test(row.email)
      && row.email.endsWith('@' + project_id + '.iam.gserviceaccount.com')
      && (row.disabled === undefined || typeof row.disabled === 'boolean'))
      .map(row => ({ service_account: row.email, disabled: row.disabled === true }));
    return { account, project_id, candidates, truncated: rows.length > 100, provider_access_verified: false };
  } catch { fail('reader_discovery_unavailable'); }
}
async function verifyGoogleKey(path, project, account) {
  const value = JSON.parse(await privateFile(path));
  if (value.type !== 'service_account' || value.project_id !== project || value.client_email !== account
    || typeof value.private_key_id !== 'string' || !value.private_key_id || typeof value.private_key !== 'string'
    || createPrivateKey(value.private_key).asymmetricKeyType !== 'rsa') fail('private_file');
}
export async function createGoogleReaderKey({ account, project_id, service_account, private_directory, approve_create }, { run = runGcloud } = {}) {
  if (approve_create !== true) fail('approval');
  if (typeof account !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9@._+-]{2,253}$/.test(account)
    || typeof project_id !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project_id)
    || typeof service_account !== 'string' || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@/.test(service_account)
    || !service_account.endsWith('@' + project_id + '.iam.gserviceaccount.com')) fail('configuration');
  const directory = await privateDirectory(private_directory);
  const base = 'google-' + fingerprint([project_id, service_account]);
  const path = join(directory, base + '.json'), journal = join(directory, base + '.state.json');
  try { await writeNew(journal, { state: 'creating', credential_file: path }); }
  catch (error) {
    if (error.code !== 'EEXIST') fail('private_file');
    try {
      const previous = JSON.parse(await privateFile(journal));
      if (previous.state !== 'created' || previous.credential_file !== path) fail('creation_status_unknown');
      await verifyGoogleKey(path, project_id, service_account);
      return result(path, true);
    } catch { fail('creation_status_unknown'); }
  }
  try {
    try { await lstat(path); fail('existing_reader_conflict'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await run('gcloud', ['iam', 'service-accounts', 'keys', 'create', path,
      '--iam-account=' + service_account, '--project=' + project_id, '--account=' + account,
      '--key-file-type=json', '--quiet', '--format=none']);
    const keyFile = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const info = await keyFile.stat();
      if (!info.isFile() || info.uid !== process.getuid()) fail('private_file');
      await keyFile.chmod(0o600);
    } finally { await keyFile.close(); }
    await verifyGoogleKey(path, project_id, service_account);
    // Keep a durable intent after any uncertain outcome; never blindly create a second key.
    const handle = await open(journal, constants.O_WRONLY | constants.O_NOFOLLOW);
    try {
      await handle.truncate(0); await handle.writeFile(JSON.stringify({ state: 'created', credential_file: path })); await handle.sync();
    } finally { await handle.close(); }
    return result(path, false);
  } catch { fail('creation_status_unknown'); }
}
