import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { logger } from '../utils/logger.js';

const PEM_HEADER = '-----BEGIN RSA PRIVATE KEY-----';
const PEM_FOOTER = '-----END RSA PRIVATE KEY-----';

/** Custom error class for GitHub App authentication failures */
export class GitHubAuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_key' | 'auth_failed' | 'installation_error',
  ) {
    super(message);
    this.name = 'GitHubAuthError';
  }
}

/**
 * Normalize a PEM private key by replacing literal `\n` sequences
 * with real newlines. Validates basic PEM structure.
 */
export function normalizePrivateKey(key: string): string {
  if (!key || key.trim().length === 0) {
    throw new GitHubAuthError(
      'Private key must not be empty',
      'invalid_key',
    );
  }

  const normalized = key.replace(/\\n/g, '\n').trim();

  if (!normalized.includes(PEM_HEADER) || !normalized.includes(PEM_FOOTER)) {
    throw new GitHubAuthError(
      'Private key must be in PEM format (RSA PRIVATE KEY)',
      'invalid_key',
    );
  }

  return normalized;
}

/**
 * Create an Octokit instance authenticated as the GitHub App itself.
 * Useful for listing installations and app-level endpoints.
 */
export function createAppOctokit(appId: string, privateKey: string): Octokit {
  const log = logger.child({ module: 'github-auth' });

  try {
    const normalizedKey = normalizePrivateKey(privateKey);

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: normalizedKey,
      },
    });

    log.info({ appId }, 'Created app-level Octokit instance');
    return octokit;
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new GitHubAuthError(
      `Failed to create app Octokit: ${message}`,
      'auth_failed',
    );
  }
}

/**
 * Create an Octokit instance authenticated as a specific GitHub App installation.
 * Installation tokens are automatically refreshed by @octokit/auth-app.
 */
export function createInstallationOctokit(
  appId: string,
  privateKey: string,
  installationId: number,
): Octokit {
  const log = logger.child({ module: 'github-auth' });

  try {
    const normalizedKey = normalizePrivateKey(privateKey);

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey: normalizedKey,
        installationId,
      },
    });

    log.info({ appId, installationId }, 'Created installation-level Octokit instance');
    return octokit;
  } catch (error) {
    if (error instanceof GitHubAuthError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new GitHubAuthError(
      `Failed to create installation Octokit: ${message}`,
      'installation_error',
    );
  }
}
