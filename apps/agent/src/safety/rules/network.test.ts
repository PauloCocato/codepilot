import { describe, it, expect } from 'vitest';
import { ssrf, openRedirect, insecureCrypto } from './network.js';

describe('network rules', () => {
  describe('ssrf', () => {
    it('should detect fetch with user-controlled URL', () => {
      const patch = `const response = await fetch(req.body.url);`;
      const result = ssrf.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('NET-001');
    });

    it('should detect axios with user query param', () => {
      const patch = `const data = await axios.get(req.query.endpoint);`;
      const result = ssrf.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag fetch with hardcoded URL', () => {
      const patch = `const response = await fetch("https://api.example.com/data");`;
      const result = ssrf.check(patch);
      expect(result).toBeNull();
    });

    it('should not flag when URL validation exists', () => {
      const patch = `const validUrl = validateUrl(req.body.url);\nconst response = await fetch(req.body.url);`;
      const result = ssrf.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('openRedirect', () => {
    it('should detect redirect with user input', () => {
      const patch = `res.redirect(req.query.returnUrl);`;
      const result = openRedirect.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('NET-002');
    });

    it('should not flag redirect with static path', () => {
      const patch = `res.redirect("/dashboard");`;
      const result = openRedirect.check(patch);
      expect(result).toBeNull();
    });
  });

  describe('insecureCrypto', () => {
    it('should detect MD5 hash usage', () => {
      const patch = `const hash = createHash("md5").update(data).digest("hex");`;
      const result = insecureCrypto.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe('NET-003');
    });

    it('should detect SHA1 hash usage', () => {
      const patch = `const hash = createHash("sha1").update(data).digest("hex");`;
      const result = insecureCrypto.check(patch);
      expect(result).not.toBeNull();
    });

    it('should not flag SHA-256', () => {
      const patch = `const hash = createHash("sha256").update(data).digest("hex");`;
      const result = insecureCrypto.check(patch);
      expect(result).toBeNull();
    });
  });
});
