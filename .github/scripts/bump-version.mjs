#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
let explicitVersion;
let bumpType = 'patch';

for (let i = 0; i < args.length; i += 1) {
  const value = args[i];
  if (value === '--set') {
    explicitVersion = args[i + 1];
    if (!explicitVersion) {
      console.error('Expected value after --set');
      process.exit(1);
    }
    i += 1;
  } else {
    bumpType = value.toLowerCase();
  }
}

const pkgPath = resolve(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const nextVersion = explicitVersion
  ? normalizeVersion(explicitVersion)
  : bumpVersion(pkg.version, bumpType);

pkg.version = nextVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

console.log(nextVersion);

function normalizeVersion(candidate) {
  const clean = String(candidate).trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(clean)) {
    throw new Error(`Invalid semantic version: ${candidate}`);
  }
  return clean;
}

function bumpVersion(version, type) {
  const allowed = new Set(['major', 'minor', 'patch']);
  if (!allowed.has(type)) {
    throw new Error(`Unsupported bump type: ${type}`);
  }

  const [core] = String(version).split('-');
  const parts = core.split('.').map((part) => {
    const value = Number.parseInt(part, 10);
    if (Number.isNaN(value)) {
      throw new Error(`Invalid semver component: ${part}`);
    }
    return value;
  });

  if (parts.length !== 3) {
    throw new Error(`Version must have three numeric parts (got "${version}")`);
  }

  if (type === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }

  return parts.join('.');
}
