import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CONFIG = 'dist/server/wrangler.production.json';
const configPath = resolve(CONFIG);
const CANARY_BRANCH = 'feature/dr-ota-cloudflare';
const WORKER_NAME = 'retroguyvn';
const BASE_URL = 'https://retroguyvn.com';
const uploadOutputPath = resolve('.wrangler-preview-upload.ndjson');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    env: options.env ?? process.env
  });

  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? 1}`);
  }
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: options.env ?? process.env,
    maxBuffer: 8 * 1024 * 1024
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw new Error(`Failed to start ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? 1}`);
  }

  return result.stdout ?? '';
}

function parseJsonOutput(text, label) {
  try {
    return JSON.parse(text.trim());
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
}

function findDeploymentVersions(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);

  if (Array.isArray(value.versions)) {
    const allocations = value.versions
      .map((entry) => ({
        versionId: entry?.version_id ?? entry?.versionId ?? entry?.id ?? null,
        percentage: Number(entry?.percentage)
      }))
      .filter((entry) => entry.versionId && Number.isFinite(entry.percentage));
    if (allocations.length) return allocations;
  }

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const found = findDeploymentVersions(child, seen);
    if (found?.length) return found;
  }
  return null;
}

function getCurrentProductionVersion() {
  const stdout = runCapture(npxCommand, [
    'wrangler', 'deployments', 'status', '--json', '--config', CONFIG
  ]);
  const status = parseJsonOutput(stdout, 'wrangler deployments status');
  const allocations = findDeploymentVersions(status) ?? [];
  const serving = allocations.filter((entry) => entry.percentage > 0.0001);

  if (serving.length !== 1 || Math.abs(serving[0].percentage - 100) > 0.01) {
    throw new Error(
      `Refusing OTA canary because current production is already a live split: ${JSON.stringify(allocations)}`
    );
  }

  return serving[0].versionId;
}

function recursiveVersionId(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.version_id === 'string') return value.version_id;
  if (typeof value.versionId === 'string') return value.versionId;
  for (const child of Object.values(value)) {
    const found = recursiveVersionId(child);
    if (found) return found;
  }
  return null;
}

function readUploadedVersionId() {
  if (!existsSync(uploadOutputPath)) return null;
  const lines = readFileSync(uploadOutputPath, 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'version-upload') {
        const id = recursiveVersionId(event);
        if (id) return id;
      }
    } catch {
      // Ignore unrelated/non-JSON lines in Wrangler structured output.
    }
  }
  return null;
}

function findTaggedVersion(value, tag) {
  if (!value || typeof value !== 'object') return null;
  const tagValue = value.tag ?? value.version_tag ?? value.versionTag;
  if (tagValue === tag) {
    return value.version_id ?? value.versionId ?? value.id ?? null;
  }
  for (const child of Object.values(value)) {
    const found = findTaggedVersion(child, tag);
    if (found) return found;
  }
  return null;
}

function lookupUploadedVersionId(tag) {
  const stdout = runCapture(npxCommand, [
    'wrangler', 'versions', 'list', '--json', '--config', CONFIG
  ]);
  return findTaggedVersion(parseJsonOutput(stdout, 'wrangler versions list'), tag);
}

function verifyCanaryAllocation(productionVersionId, canaryVersionId) {
  const stdout = runCapture(npxCommand, [
    'wrangler', 'deployments', 'status', '--json', '--config', CONFIG
  ]);
  const status = parseJsonOutput(stdout, 'wrangler deployments status');
  const allocations = findDeploymentVersions(status) ?? [];
  const production = allocations.find((entry) => entry.versionId === productionVersionId);
  const canary = allocations.find((entry) => entry.versionId === canaryVersionId);

  if (!production || Math.abs(production.percentage - 100) > 0.01) {
    throw new Error(`Production version is not pinned at 100%: ${JSON.stringify(allocations)}`);
  }
  if (!canary || Math.abs(canary.percentage) > 0.01) {
    throw new Error(`OTA canary version is not pinned at 0%: ${JSON.stringify(allocations)}`);
  }
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function requestCanary(path, canaryVersionId, extraHeaders = {}) {
  const headers = {
    'Cloudflare-Workers-Version-Overrides': `${WORKER_NAME}="${canaryVersionId}"`,
    'User-Agent': 'DR-OTA-CI-SMOKE/1.0',
    ...extraHeaders
  };

  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, { headers, redirect: 'manual' });
      const text = await response.text();
      return { response, text };
    } catch (error) {
      lastError = error;
      console.warn(`[cloudflare-preview] Smoke request attempt ${attempt} failed: ${error.message}`);
      await sleep(2000);
    }
  }
  throw lastError ?? new Error('Smoke request failed');
}

async function smokeTest(canaryVersionId) {
  // Missing required OTA headers must reach the new route and return its contract error.
  const missing = await requestCanary('/api/dr/ota', canaryVersionId);
  if (missing.response.status !== 400) {
    throw new Error(`OTA missing-header smoke expected 400, got ${missing.response.status}: ${missing.text}`);
  }

  const sha = (process.env.WORKERS_CI_COMMIT_SHA || 'unknown').slice(0, 12);
  const valid = await requestCanary('/api/dr/ota', canaryVersionId, {
    'X-DR-Device-ID': `CI-OTA-${sha}`,
    'X-DR-HW-Version': 'HW0.5.1',
    'X-DR-FW-Version': '0.0.1',
    'X-DR-Boot-Version': '1.0.0',
    'X-DR-Channel': 'stable'
  });

  if (valid.response.status !== 200) {
    throw new Error(`OTA valid-check smoke expected 200, got ${valid.response.status}: ${valid.text}`);
  }

  let payload;
  try {
    payload = JSON.parse(valid.text);
  } catch {
    throw new Error(`OTA valid-check smoke returned non-JSON: ${valid.text}`);
  }
  if (typeof payload.update_available !== 'boolean') {
    throw new Error(`OTA valid-check smoke missing update_available boolean: ${valid.text}`);
  }

  const admin = await requestCanary('/api/admin/ota/releases', canaryVersionId);
  if (![401, 403].includes(admin.response.status)) {
    throw new Error(`OTA admin auth smoke expected 401/403, got ${admin.response.status}: ${admin.text}`);
  }

  console.log(`[cloudflare-preview] OTA canary smoke passed on version ${canaryVersionId}.`);
}

function rollbackToProduction(productionVersionId) {
  console.warn(`[cloudflare-preview] Rolling back canary deployment to ${productionVersionId}@100%.`);
  run(npxCommand, [
    'wrangler', 'versions', 'deploy', `${productionVersionId}@100%`, '-y',
    '--message', 'Automatic rollback after DR OTA canary smoke failure',
    '--config', CONFIG
  ]);
}

async function main() {
  if (!existsSync(configPath)) {
    console.log('[cloudflare-preview] Astro output is missing; running npm run build first.');
    run(npmCommand, ['run', 'build']);
  }

  if (!existsSync(configPath)) {
    throw new Error(`Required generated config is still missing: ${CONFIG}`);
  }

  const isOtaCanary = process.env.WORKERS_CI === '1'
    && process.env.WORKERS_CI_BRANCH === CANARY_BRANCH;
  const commitSha = process.env.WORKERS_CI_COMMIT_SHA || Date.now().toString(36);
  const tag = `dr-ota-${commitSha.slice(0, 12)}`;
  let productionVersionId = null;
  let canaryDeploymentAttempted = false;

  try {
    if (isOtaCanary) {
      productionVersionId = getCurrentProductionVersion();
      console.log(`[cloudflare-preview] Current production version: ${productionVersionId}@100%.`);
    }

    if (existsSync(uploadOutputPath)) unlinkSync(uploadOutputPath);
    console.log(`[cloudflare-preview] Uploading Worker preview version with ${CONFIG}.`);
    run(npxCommand, [
      'wrangler', 'versions', 'upload',
      '--tag', tag,
      '--message', `DR OTA preview ${commitSha}`,
      '--config', CONFIG
    ], {
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: uploadOutputPath }
    });

    if (!isOtaCanary) {
      console.log('[cloudflare-preview] Non-OTA preview branch: upload complete; active deployment unchanged.');
      return;
    }

    const canaryVersionId = readUploadedVersionId() || lookupUploadedVersionId(tag);
    if (!canaryVersionId) {
      throw new Error(`Unable to resolve uploaded Worker version for tag ${tag}`);
    }

    console.log(`[cloudflare-preview] Creating zero-traffic OTA canary ${canaryVersionId}@0%.`);
    canaryDeploymentAttempted = true;
    run(npxCommand, [
      'wrangler', 'versions', 'deploy',
      `${canaryVersionId}@0%`, `${productionVersionId}@100%`, '-y',
      '--message', `DR OTA zero-traffic canary ${commitSha}`,
      '--config', CONFIG
    ]);

    verifyCanaryAllocation(productionVersionId, canaryVersionId);
    await sleep(3000);
    await smokeTest(canaryVersionId);
  } catch (error) {
    console.error(`[cloudflare-preview] ${error.stack || error.message}`);
    if (isOtaCanary && canaryDeploymentAttempted && productionVersionId) {
      try {
        rollbackToProduction(productionVersionId);
      } catch (rollbackError) {
        console.error(`[cloudflare-preview] Automatic rollback failed: ${rollbackError.stack || rollbackError.message}`);
      }
    }
    process.exitCode = 1;
  } finally {
    if (existsSync(uploadOutputPath)) unlinkSync(uploadOutputPath);
  }
}

await main();
