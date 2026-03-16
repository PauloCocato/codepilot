import type { SafetyRule, SafetyViolation } from '../types.js';

function findLineNumber(patch: string, match: RegExpExecArray): number | undefined {
  const beforeMatch = patch.slice(0, match.index);
  const lines = beforeMatch.split('\n');
  return lines.length;
}

export const sqlInjection: SafetyRule = {
  id: 'INJ-001',
  name: 'SQL Injection via String Concatenation',
  severity: 'critical',
  category: 'injection',
  check(patch: string): SafetyViolation | null {
    // Detect SQL keywords concatenated with variables using + or template literals
    const patterns = [
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+.*?\+\s*(?:\w+|['"`])/i,
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+.*?\$\{/i,
      /(?:query|execute|exec)\s*\(\s*['"`](?:SELECT|INSERT|UPDATE|DELETE).*?\+/i,
      /(?:query|execute|exec)\s*\(\s*`(?:SELECT|INSERT|UPDATE|DELETE).*?\$\{/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: sqlInjection.id,
          ruleName: sqlInjection.name,
          severity: sqlInjection.severity,
          category: sqlInjection.category,
          description: 'SQL query constructed via string concatenation or template literals. Use parameterized queries instead.',
          line: findLineNumber(patch, match),
          suggestion: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId])',
        };
      }
    }
    return null;
  },
};

export const commandInjection: SafetyRule = {
  id: 'INJ-002',
  name: 'Command Injection',
  severity: 'critical',
  category: 'injection',
  // Note: This rule DETECTS dangerous exec() patterns in patches.
  // It does not itself call exec — it uses regex matching only.
  check(patch: string): SafetyViolation | null {
    // Detect exec/spawn/execSync with variable interpolation
    const execWithTemplatePattern = /(?:execSync|execFile|execFileSync)\s*\(\s*`[^`]*\$\{/;
    const execWithConcatPattern = /(?:execSync|execFile|execFileSync)\s*\(\s*(?:\w+\s*\+|['"][^'"]*['"]\s*\+\s*\w+)/;
    const cpExecPattern = /(?:child_process|cp)\.(?:execSync)\s*\(\s*`[^`]*\$\{/;

    const patterns = [execWithTemplatePattern, execWithConcatPattern, cpExecPattern];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: commandInjection.id,
          ruleName: commandInjection.name,
          severity: commandInjection.severity,
          category: commandInjection.category,
          description: 'Shell command constructed with unsanitized input. This allows arbitrary command execution.',
          line: findLineNumber(patch, match),
          suggestion: 'Use spawn() with an arguments array instead of string interpolation in shell commands.',
        };
      }
    }
    return null;
  },
};

export const xss: SafetyRule = {
  id: 'INJ-003',
  name: 'Cross-Site Scripting (XSS)',
  severity: 'high',
  category: 'injection',
  check(patch: string): SafetyViolation | null {
    const patterns = [
      /\.innerHTML\s*=\s*(?!['"`]\s*['"`])\S/,
      /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/,
      /document\.write\s*\(\s*(?!['"`]<!\s*DOCTYPE)/,
      /\.outerHTML\s*=\s*(?!['"`]\s*['"`])\S/,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: xss.id,
          ruleName: xss.name,
          severity: xss.severity,
          category: xss.category,
          description: 'Potential XSS vulnerability: setting HTML content with unsanitized input.',
          line: findLineNumber(patch, match),
          suggestion: 'Use textContent instead of innerHTML, or sanitize input with a library like DOMPurify.',
        };
      }
    }
    return null;
  },
};

export const injectionRules: readonly SafetyRule[] = [
  sqlInjection,
  commandInjection,
  xss,
];
