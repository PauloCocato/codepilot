import { describe, it, expect } from 'vitest';
import { pathTraversal, sensitiveFileAccess, unlimitedFileRead } from './filesystem.js';

describe('filesystem rules', () => {
  describe('pathTraversal', () => {
    it('should detect ../ in readFile', () => {
      const patch = `fs.readFile("uploads/../../../etc/passwd", cb);`;
      const result = pathTraversal.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('FS-001');
    });

    it('should detect ../ in path.join', () => {
      const patch = `const filePath = path.join(dir, "../../secret");`;
      const result = pathTraversal.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag normal file reads', () => {
      const patch = `fs.readFile("data/users.json", cb);`;
      const result = pathTraversal.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('sensitiveFileAccess', () => {
    it('should detect /etc/passwd access', () => {
      const patch = `fs.readFileSync("/etc/passwd", "utf8");`;
      const result = sensitiveFileAccess.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('FS-002');
      expect(result?.severity).toBe('critical');
    });

    it('should detect .ssh key access', () => {
      const patch = `fs.readFile(".ssh/id_rsa", cb);`;
      const result = sensitiveFileAccess.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag normal files', () => {
      const patch = `fs.readFile("config.json", cb);`;
      const result = sensitiveFileAccess.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('unlimitedFileRead', () => {
    it('should detect readFile without size check', () => {
      const patch = `const data = readFileSync(filePath, "utf8");`;
      const result = unlimitedFileRead.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('FS-003');
    });

    it('should not flag readFile with preceding size check', () => {
      const patch = `const stat = fs.statSync(filePath);\nif (stat.size > MAX_SIZE) throw new Error("too large");\nconst data = readFileSync(filePath, "utf8");`;
      const result = unlimitedFileRead.check(patch);
      expect(result).toBeNull();
    });
  });
});
