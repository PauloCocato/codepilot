import type { SafetyRule, SafetyViolation } from '../types.js';

function findLineNumber(patch: string, match: RegExpExecArray): number | undefined {
  const beforeMatch = patch.slice(0, match.index);
  const lines = beforeMatch.split('\n');
  return lines.length;
}

export const ssrf: SafetyRule = {
  id: 'NET-001',
  name: 'Server-Side Request Forgery (SSRF)',
  severity: 'high',
  category: 'network',
  check(patch: string): SafetyViolation | null {
    // Detect fetch/axios/http.get with user-controlled URLs
    const patterns = [
      /(?:fetch|axios\.get|axios\.post|axios\.put|axios\.delete|http\.get|https\.get)\s*\(\s*(?:req\.(?:body|query|params)\.\w+)/,
      /(?:fetch|axios\.\w+)\s*\(\s*`\$\{req\./,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        // Check if there's URL validation nearby
        const contextBefore = patch.slice(Math.max(0, match.index - 400), match.index);
        const hasValidation = /(?:allowlist|whitelist|allowedHosts|validUrl|validateUrl|URL\.parse|new URL)/i.test(contextBefore);
        if (!hasValidation) {
          return {
            ruleId: ssrf.id,
            ruleName: ssrf.name,
            severity: ssrf.severity,
            category: ssrf.category,
            description: 'HTTP request with potentially user-controlled URL without validation. This may allow SSRF attacks.',
            line: findLineNumber(patch, match),
            suggestion: 'Validate and restrict URLs against an allowlist of trusted domains. Block internal/private IP ranges.',
          };
        }
      }
    }
    return null;
  },
};

export const openRedirect: SafetyRule = {
  id: 'NET-002',
  name: 'Open Redirect',
  severity: 'medium',
  category: 'network',
  check(patch: string): SafetyViolation | null {
    // Detect redirects with user input
    const patterns = [
      /(?:res\.redirect|response\.redirect|redirect)\s*\(\s*(?:req\.(?:body|query|params)\.\w+)/,
      /(?:location\.href|window\.location)\s*=\s*(?:req\.|params\.|query\.)/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        const contextBefore = patch.slice(Math.max(0, match.index - 400), match.index);
        const hasValidation = /(?:allowlist|whitelist|allowedUrls|validRedirect|isSafeUrl|startsWith\s*\(\s*['"`]\/)/i.test(contextBefore);
        if (!hasValidation) {
          return {
            ruleId: openRedirect.id,
            ruleName: openRedirect.name,
            severity: openRedirect.severity,
            category: openRedirect.category,
            description: 'Redirect with user-controlled URL without validation. This may allow open redirect attacks.',
            line: findLineNumber(patch, match),
            suggestion: 'Validate redirect URLs against an allowlist or restrict to relative paths only.',
          };
        }
      }
    }
    return null;
  },
};

export const insecureCrypto: SafetyRule = {
  id: 'NET-003',
  name: 'Insecure Cryptographic Algorithm',
  severity: 'high',
  category: 'crypto',
  check(patch: string): SafetyViolation | null {
    // Detect MD5/SHA1 usage for password hashing
    const patterns = [
      /createHash\s*\(\s*['"`](?:md5|sha1)['"`]\s*\)/i,
      /(?:md5|sha1)\s*\(\s*(?:password|passwd|senha|secret)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: insecureCrypto.id,
          ruleName: insecureCrypto.name,
          severity: insecureCrypto.severity,
          category: insecureCrypto.category,
          description: 'Insecure hash algorithm (MD5/SHA1) detected. These are vulnerable to collision attacks and should not be used for security purposes.',
          line: findLineNumber(patch, match),
          suggestion: 'Use bcrypt, scrypt, or argon2 for password hashing. Use SHA-256 or SHA-3 for general hashing.',
        };
      }
    }
    return null;
  },
};

export const networkRules: readonly SafetyRule[] = [
  ssrf,
  openRedirect,
  insecureCrypto,
];
