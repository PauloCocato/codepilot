import { describe, it, expect } from 'vitest';
import { hardcodedApiKey, hardcodedPassword, privateKey, envFileCommitted } from './secrets.js';

describe('secrets rules', () => {
  describe('hardcodedApiKey', () => {
    it('should detect AWS access key', () => {
      const patch = `const key = "AKIAIOSFODNN7EXAMPLE";`;
      const result = hardcodedApiKey.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('SEC-001');
      expect(result?.severity).toBe('critical');
    });

    it('should detect GitHub personal access token', () => {
      const patch = `const token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";`;
      const result = hardcodedApiKey.check(patch);
      expect(result).not.toBeNull();
    });

    it('should detect Slack token', () => {
      const patch = `const slack = "xoxb-1234567890-abcdefghij";`;
      const result = hardcodedApiKey.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag environment variable references', () => {
      const patch = `const key = process.env.API_KEY;`;
      const result = hardcodedApiKey.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('hardcodedPassword', () => {
    it('should detect hardcoded password assignment', () => {
      const patch = `const password = "supersecret123";`;
      const result = hardcodedPassword.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('SEC-002');
    });

    it('should detect password in object literal', () => {
      const patch = `const config = { password: "mypassword123" };`;
      const result = hardcodedPassword.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag empty password', () => {
      const patch = `const password = "";`;
      const result = hardcodedPassword.check(patch);
      expect(result).toBeNull();
    });

    it('should not flag env variable password', () => {
      const patch = `const password = process.env.DB_PASSWORD;`;
      const result = hardcodedPassword.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('privateKey', () => {
    it('should detect RSA private key', () => {
      const patch = `const key = "-----BEGIN RSA PRIVATE KEY-----\\nMIIE..."`;
      const result = privateKey.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('SEC-003');
    });

    it('should detect EC private key', () => {
      const patch = `-----BEGIN EC PRIVATE KEY-----`;
      const result = privateKey.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag public keys', () => {
      const patch = `-----BEGIN PUBLIC KEY-----`;
      const result = privateKey.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('envFileCommitted', () => {
    it('should detect .env file with values in diff', () => {
      const patch = `--- a/.env\n+++ b/.env\n+ API_KEY=sk-1234567890`;
      const result = envFileCommitted.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('SEC-004');
    });

    it('should not flag regular source files', () => {
      const patch = `--- a/src/config.ts\n+++ b/src/config.ts\n+ const x = 1;`;
      const result = envFileCommitted.check(patch);
      expect(result).toBeNull();
    });
  });
});
