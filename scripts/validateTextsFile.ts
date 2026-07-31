import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEXTS_PATH = resolve(process.cwd(), 'src/data/texts.json');
const EXPECTED_TOP_LEVEL_KEYS = ['cards', 'glossary', 'affixHelp', 'effectText'] as const;
const EXPECTED_EVOLUTION_NODES = 35;
const EXPECTED_EVOLUTION_BRANCHES = 210;
const EXPECTED_BRANCH_KEYS = ['intent', 'name', 'summary'];
const RETIRED_BRANCH_KEYS = new Set(['keywords', 'buildFit']);

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidUtf8Byte(bytes: Uint8Array): number {
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    if (first <= 0x7f) {
      index += 1;
      continue;
    }

    let continuationCount: number;
    let minimumSecond = 0x80;
    let maximumSecond = 0xbf;
    if (first >= 0xc2 && first <= 0xdf) {
      continuationCount = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      continuationCount = 2;
      if (first === 0xe0) minimumSecond = 0xa0;
      if (first === 0xed) maximumSecond = 0x9f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      continuationCount = 3;
      if (first === 0xf0) minimumSecond = 0x90;
      if (first === 0xf4) maximumSecond = 0x8f;
    } else {
      return index;
    }

    if (index + continuationCount >= bytes.length) return index;
    const second = bytes[index + 1];
    if (second < minimumSecond || second > maximumSecond) return index + 1;
    for (let offset = 2; offset <= continuationCount; offset += 1) {
      const continuation = bytes[index + offset];
      if (continuation < 0x80 || continuation > 0xbf) return index + offset;
    }
    index += continuationCount + 1;
  }
  return -1;
}

function decodeStrict(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    const offset = invalidUtf8Byte(bytes);
    throw new Error(`texts.json is not valid UTF-8 at byte ${offset >= 0 ? offset : 'unknown'}`);
  }
}

function parseTexts(text: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`texts.json is not valid JSON: ${detail}`);
  }
  if (!isObject(parsed)) throw new Error('texts.json root must be an object');
  return parsed;
}

function validateRequiredNodes(data: JsonObject): void {
  for (const key of EXPECTED_TOP_LEVEL_KEYS) {
    if (!isObject(data[key])) throw new Error(`texts.json is missing required object: ${key}`);
  }
}

function validateEvolution(data: JsonObject): { nodes: number; branches: number } {
  const evolution = data.evolution;
  if (!isObject(evolution)) throw new Error('texts.json is missing required object: evolution');

  let nodes = 0;
  let branches = 0;
  for (const [nodeName, candidate] of Object.entries(evolution)) {
    if (!isObject(candidate)) continue;
    const candidates = Object.values(candidate);
    if (candidates.length === 0 || !candidates.every(isObject)) continue;

    nodes += 1;
    for (const [branchName, branch] of Object.entries(candidate)) {
      if (!isObject(branch)) {
        throw new Error(`evolution.${nodeName}.${branchName} must be an object`);
      }
      branches += 1;
      const actualKeys = Object.keys(branch).sort();
      if (
        actualKeys.length !== EXPECTED_BRANCH_KEYS.length
        || actualKeys.some((key, index) => key !== EXPECTED_BRANCH_KEYS[index])
      ) {
        throw new Error(
          `evolution.${nodeName}.${branchName} must contain exactly ${EXPECTED_BRANCH_KEYS.join('/')}; got ${actualKeys.join('/')}`,
        );
      }
      for (const retired of RETIRED_BRANCH_KEYS) {
        if (retired in branch) {
          throw new Error(`evolution.${nodeName}.${branchName} contains retired field: ${retired}`);
        }
      }
    }
  }

  if (nodes !== EXPECTED_EVOLUTION_NODES) {
    throw new Error(`evolution node count mismatch: expected ${EXPECTED_EVOLUTION_NODES}, got ${nodes}`);
  }
  if (branches !== EXPECTED_EVOLUTION_BRANCHES) {
    throw new Error(`evolution branch count mismatch: expected ${EXPECTED_EVOLUTION_BRANCHES}, got ${branches}`);
  }
  return { nodes, branches };
}

function main(): void {
  const bytes = readFileSync(TEXTS_PATH);
  const text = decodeStrict(bytes);
  if (text.includes('\uFFFD')) throw new Error('texts.json contains U+FFFD');
  const data = parseTexts(text);
  validateRequiredNodes(data);
  const { nodes, branches } = validateEvolution(data);
  console.log(
    `texts.json OK: ${bytes.length} bytes, ${Object.keys(data).length} top-level keys, ${nodes} evolution nodes, ${branches} branches`,
  );
}

main();
