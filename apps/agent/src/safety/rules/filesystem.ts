import type { SafetyRule, SafetyViolation } from '../types.js';

function findLineNumber(patch: string, match: RegExpExecArray): number | undefined {
  const beforeMatch = patch.slice(0, match.index);
  const lines = beforeMatch.split('\n');
  return lines.length;
}

export const pathTraversal: SafetyRule = {
  id: 'FS-001',
  name: 'Path Traversal',
  severity: 'high',
  category: 'filesystem',
  check(patch: string): SafetyViolation | null {
    // Detect ../ in file operations — but not in import statements or comments
    const patterns = [
      /(?:readFile|writeFile|readFileSync|writeFileSync|createReadStream|createWriteStream|open|openSync)\s*\([^)]*\.\.\//,
      /(?:path\.(?:join|resolve))\s*\([^)]*\.\.\//,
      /(?:fs\.\w+)\s*\([^)]*\.\.\//,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: pathTraversal.id,
          ruleName: pathTraversal.name,
          severity: pathTraversal.severity,
          category: pathTraversal.category,
          description: 'Path traversal pattern (../) detected in file system operation. This may allow access to files outside the intended directory.',
          line: findLineNumber(patch, match),
          suggestion: 'Normalize and validate file paths. Use path.resolve() and verify the resolved path stays within the allowed directory.',
        };
      }
    }
    return null;
  },
};

export const sensitiveFileAccess: SafetyRule = {
  id: 'FS-002',
  name: 'Sensitive File Access',
  severity: 'critical',
  category: 'filesystem',
  check(patch: string): SafetyViolation | null {
    const sensitiveFiles = [
      '/etc/passwd',
      '/etc/shadow',
      '/etc/hosts',
      '~/.ssh',
      '.ssh/id_rsa',
      '.ssh/id_ed25519',
      '.ssh/authorized_keys',
      '/etc/sudoers',
      '.bash_history',
      '.zsh_history',
    ];

    for (const file of sensitiveFiles) {
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`(?:readFile|readFileSync|createReadStream|open|openSync|fs\\.)\\s*\\([^)]*${escaped}`);
      const match = pattern.exec(patch);
      if (match) {
        return {
          ruleId: sensitiveFileAccess.id,
          ruleName: sensitiveFileAccess.name,
          severity: sensitiveFileAccess.severity,
          category: sensitiveFileAccess.category,
          description: `Access to sensitive system file detected: ${file}`,
          line: findLineNumber(patch, match),
          suggestion: 'Do not access system-sensitive files. If required, use proper access controls and document the justification.',
        };
      }
    }
    return null;
  },
};

export const unlimitedFileRead: SafetyRule = {
  id: 'FS-003',
  name: 'Unlimited File Read',
  severity: 'medium',
  category: 'filesystem',
  check(patch: string): SafetyViolation | null {
    // Detect readFile without size checks
    const readPattern = /(?:readFile|readFileSync)\s*\(\s*(?:\w+|`[^`]+`)/;
    const match = readPattern.exec(patch);
    if (match) {
      // Check if there's a stat/size check nearby (within ~5 lines before)
      const contextBefore = patch.slice(Math.max(0, match.index - 300), match.index);
      const hasSizeCheck = /(?:stat|size|maxSize|MAX_SIZE|limit|maxLength|MAX_FILE)/i.test(contextBefore);
      if (!hasSizeCheck) {
        return {
          ruleId: unlimitedFileRead.id,
          ruleName: unlimitedFileRead.name,
          severity: unlimitedFileRead.severity,
          category: unlimitedFileRead.category,
          description: 'File read operation without apparent size limit. Large files could cause memory exhaustion.',
          line: findLineNumber(patch, match),
          suggestion: 'Check file size with fs.stat() before reading. Use streams for large files or set a maximum size limit.',
        };
      }
    }
    return null;
  },
};

export const filesystemRules: readonly SafetyRule[] = [
  pathTraversal,
  sensitiveFileAccess,
  unlimitedFileRead,
];
