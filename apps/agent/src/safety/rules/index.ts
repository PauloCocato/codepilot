import type { SafetyRule } from '../types.js';
import { injectionRules } from './injection.js';
import { secretsRules } from './secrets.js';
import { filesystemRules } from './filesystem.js';
import { networkRules } from './network.js';
import { dependenciesRules } from './dependencies.js';

export { injectionRules } from './injection.js';
export { secretsRules } from './secrets.js';
export { filesystemRules } from './filesystem.js';
export { networkRules } from './network.js';
export { dependenciesRules } from './dependencies.js';

export const allRules: readonly SafetyRule[] = [
  ...injectionRules,
  ...secretsRules,
  ...filesystemRules,
  ...networkRules,
  ...dependenciesRules,
];
