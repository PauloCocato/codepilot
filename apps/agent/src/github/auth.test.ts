import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizePrivateKey,
  createAppOctokit,
  createInstallationOctokit,
  GitHubAuthError,
} from './auth.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockOctokitConstructor = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    constructor(options: unknown) {
      mockOctokitConstructor(options);
    }
  },
}));

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(() => 'mock-auth-strategy'),
}));

const VALID_PEM = `-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJFGo0+FwfLMC3VR5L3MtY7FAKE
-----END RSA PRIVATE KEY-----`;

const ESCAPED_PEM =
  '-----BEGIN RSA PRIVATE KEY-----\\nMIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJFGo0+FwfLMC3VR5L3MtY7FAKE\\n-----END RSA PRIVATE KEY-----';

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GitHubAuthError', () => {
    it('should have correct code and message', () => {
      const error = new GitHubAuthError('test error', 'invalid_key');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GitHubAuthError);
      expect(error.name).toBe('GitHubAuthError');
      expect(error.message).toBe('test error');
      expect(error.code).toBe('invalid_key');
    });
  });

  describe('normalizePrivateKey', () => {
    it('should replace literal \\n with newlines', () => {
      const result = normalizePrivateKey(ESCAPED_PEM);

      expect(result).toContain('\n');
      expect(result).not.toContain('\\n');
      expect(result).toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(result).toContain('-----END RSA PRIVATE KEY-----');
    });

    it('should pass through valid PEM unchanged', () => {
      const result = normalizePrivateKey(VALID_PEM);

      expect(result).toBe(VALID_PEM.trim());
    });

    it('should throw on empty string', () => {
      expect(() => normalizePrivateKey('')).toThrow(GitHubAuthError);
      expect(() => normalizePrivateKey('')).toThrow('Private key must not be empty');
    });

    it('should throw on whitespace-only string', () => {
      expect(() => normalizePrivateKey('   ')).toThrow(GitHubAuthError);
    });

    it('should throw on invalid PEM format', () => {
      expect(() => normalizePrivateKey('not-a-pem-key')).toThrow(GitHubAuthError);
      expect(() => normalizePrivateKey('not-a-pem-key')).toThrow('PEM format');
    });
  });

  describe('createAppOctokit', () => {
    it('should create Octokit with app auth strategy', () => {
      const octokit = createAppOctokit('12345', VALID_PEM);

      expect(octokit).toBeDefined();
      expect(mockOctokitConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            appId: '12345',
            privateKey: VALID_PEM.trim(),
          }),
        }),
      );
    });

    it('should throw GitHubAuthError on invalid credentials', () => {
      expect(() => createAppOctokit('12345', '')).toThrow(GitHubAuthError);
    });
  });

  describe('createInstallationOctokit', () => {
    it('should create Octokit with installation auth', () => {
      const octokit = createInstallationOctokit('12345', VALID_PEM, 67890);

      expect(octokit).toBeDefined();
      expect(mockOctokitConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            appId: '12345',
            privateKey: VALID_PEM.trim(),
            installationId: 67890,
          }),
        }),
      );
    });

    it('should use normalized private key', () => {
      createInstallationOctokit('12345', ESCAPED_PEM, 67890);

      const callArgs = mockOctokitConstructor.mock.calls[0]?.[0] as {
        auth: { privateKey: string };
      };
      expect(callArgs.auth.privateKey).not.toContain('\\n');
      expect(callArgs.auth.privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');
    });

    it('should throw GitHubAuthError on invalid key', () => {
      expect(() =>
        createInstallationOctokit('12345', 'bad-key', 67890),
      ).toThrow(GitHubAuthError);
    });
  });
});
