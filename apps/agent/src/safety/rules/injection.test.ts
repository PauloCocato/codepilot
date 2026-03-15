import { describe, it, expect } from 'vitest';
import { sqlInjection, commandInjection, xss } from './injection.js';

describe('injection rules', () => {
  describe('sqlInjection', () => {
    it('should detect SQL query with string concatenation', () => {
      const patch = `const query = "SELECT * FROM users WHERE id = " + userId;`;
      const result = sqlInjection.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('INJ-001');
      expect(result?.severity).toBe('critical');
    });

    it('should detect SQL query with template literal', () => {
      const patch = 'const query = `SELECT * FROM users WHERE name = ${userName}`;';
      const result = sqlInjection.check(patch);
      expect(result).not.toBeNull();
    });

    it('should detect db.query with concatenation', () => {
      const patch = `db.query("SELECT * FROM orders WHERE status = " + status);`;
      const result = sqlInjection.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag parameterized queries', () => {
      const patch = `db.query("SELECT * FROM users WHERE id = $1", [userId]);`;
      const result = sqlInjection.check(patch);
      expect(result).toBeNull();
    });

    it('should not flag static SQL strings', () => {
      const patch = `const query = "SELECT * FROM users WHERE active = true";`;
      const result = sqlInjection.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('commandInjection', () => {
    it('should detect shell command with template literal interpolation', () => {
      // This test verifies the rule detects dangerous shell usage.
      // The strings below are test data for the regex-based detector,
      // not actual shell invocations.
      const patch = 'execSync(`ls ${userInput}`)';
      const result = commandInjection.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('INJ-002');
      expect(result?.severity).toBe('critical');
    });

    it('should detect shell command with string concatenation', () => {
      const patch = `execFileSync("cmd" + userInput)`;
      const result = commandInjection.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag spawn with array arguments', () => {
      const patch = `spawn('ls', ['-la', directory])`;
      const result = commandInjection.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('xss', () => {
    it('should detect innerHTML assignment with variable', () => {
      const patch = `element.innerHTML = userContent;`;
      const result = xss.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('INJ-003');
    });

    it('should detect dangerouslySetInnerHTML', () => {
      const patch = `<div dangerouslySetInnerHTML={{ __html: content }} />`;
      const result = xss.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag innerHTML set to empty string', () => {
      const patch = `element.innerHTML = "";`;
      const result = xss.check(patch);
      expect(result).toBeNull();
    });
  });
});
