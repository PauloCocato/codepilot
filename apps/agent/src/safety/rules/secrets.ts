import type { SafetyRule, SafetyViolation } from '../types.js';

function findLineNumber(patch: string, match: RegExpExecArray): number | undefined {
  const beforeMatch = patch.slice(0, match.index);
  const lines = beforeMatch.split('\n');
  return lines.length;
}

export const hardcodedApiKey: SafetyRule = {
  id: 'SEC-001',
  name: 'Hardcoded API Key',
  severity: 'critical',
  category: 'secrets',
  check(patch: string): SafetyViolation | null {
    // Match common API key prefixes with actual values (not env references)
    const pattern = /(?:['"`])(sk-[a-zA-Z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{22,}|xox[bpsa]-[a-zA-Z0-9-]{10,}|sk-ant-[a-zA-Z0-9-]{20,})(?:['"`])/;
    const match = pattern.exec(patch);
    if (match) {
      return {
        ruleId: hardcodedApiKey.id,
        ruleName: hardcodedApiKey.name,
        severity: hardcodedApiKey.severity,
        category: hardcodedApiKey.category,
        description: `Hardcoded API key detected (pattern: ${match[1].slice(0, 6)}...). Secrets must not be committed to source code.`,
        line: findLineNumber(patch, match),
        suggestion: 'Use environment variables: process.env.API_KEY or a secret manager.',
      };
    }
    return null;
  },
};

export const hardcodedPassword: SafetyRule = {
  id: 'SEC-002',
  name: 'Hardcoded Password',
  severity: 'critical',
  category: 'secrets',
  check(patch: string): SafetyViolation | null {
    // Match password/senha assignments with literal string values (not empty or placeholder)
    const pattern = /(?:password|passwd|senha|secret|token)\s*[:=]\s*['"`](?!$|['"`]|process\.env|<%|{{|\$\{env)[^'"`]{4,}['"`]/i;
    const match = pattern.exec(patch);
    if (match) {
      return {
        ruleId: hardcodedPassword.id,
        ruleName: hardcodedPassword.name,
        severity: hardcodedPassword.severity,
        category: hardcodedPassword.category,
        description: 'Hardcoded password or secret detected in source code.',
        line: findLineNumber(patch, match),
        suggestion: 'Store passwords in environment variables or a secret manager. Never hardcode credentials.',
      };
    }
    return null;
  },
};

export const privateKey: SafetyRule = {
  id: 'SEC-003',
  name: 'Private Key Exposed',
  severity: 'critical',
  category: 'secrets',
  check(patch: string): SafetyViolation | null {
    const pattern = /-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/;
    const match = pattern.exec(patch);
    if (match) {
      return {
        ruleId: privateKey.id,
        ruleName: privateKey.name,
        severity: privateKey.severity,
        category: privateKey.category,
        description: 'Private key found in source code. This is a critical security violation.',
        line: findLineNumber(patch, match),
        suggestion: 'Remove the private key immediately. Use a secret manager or environment variables. Rotate the exposed key.',
      };
    }
    return null;
  },
};

export const envFileCommitted: SafetyRule = {
  id: 'SEC-004',
  name: 'Environment File with Secrets',
  severity: 'high',
  category: 'secrets',
  check(patch: string): SafetyViolation | null {
    // Detect .env file content in diffs
    const envFilePattern = /^\+\+\+\s+.*\.env(?:\.\w+)?$/m;
    const envValuePattern = /^\+\s*[A-Z_]+=\S+/m;
    const envFileMatch = envFilePattern.exec(patch);
    if (envFileMatch && envValuePattern.test(patch)) {
      return {
        ruleId: envFileCommitted.id,
        ruleName: envFileCommitted.name,
        severity: envFileCommitted.severity,
        category: envFileCommitted.category,
        description: 'Environment file (.env) with values detected in the diff. This file should not be committed.',
        line: findLineNumber(patch, envFileMatch),
        suggestion: 'Add .env to .gitignore and use .env.example with placeholder values instead.',
      };
    }
    return null;
  },
};

export const secretsRules: readonly SafetyRule[] = [
  hardcodedApiKey,
  hardcodedPassword,
  privateKey,
  envFileCommitted,
];
