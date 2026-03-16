import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { EvalSuiteSchema } from './types.js';
import type { EvalSuite } from './types.js';

/**
 * Load and validate an eval suite from a JSON file.
 */
export async function loadSuite(path: string): Promise<EvalSuite> {
  const raw = await readFile(path, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  const validated = EvalSuiteSchema.parse(parsed);
  return validated;
}

/**
 * List all available suite files in a directory.
 * Returns file names (without directory path) that end in .json.
 */
export async function listSuites(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir);
  const suiteFiles = entries
    .filter((entry) => extname(entry) === '.json')
    .sort();
  return suiteFiles;
}

/**
 * Load a suite by name from the default suites directory.
 */
export async function loadSuiteByName(
  name: string,
  suitesDir: string,
): Promise<EvalSuite> {
  const fileName = name.endsWith('.json') ? name : `${name}.json`;
  const fullPath = join(suitesDir, fileName);
  return loadSuite(fullPath);
}
