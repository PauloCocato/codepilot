import { z } from 'zod';
import type { Octokit } from '@octokit/rest';
import type { ParsedIssue } from '@codepilot/shared';
import { logger } from '../utils/logger.js';

/** Issue types detected from labels and content */
export type IssueType = 'bug' | 'feature' | 'refactor' | 'test' | 'docs' | 'unknown';

/** Extended parsed issue with additional extracted metadata */
export interface ExtendedParsedIssue extends ParsedIssue {
  readonly actualBehavior?: string;
  readonly codeBlocks: readonly string[];
  readonly issueType: IssueType;
  readonly languages: readonly string[];
}

/** Custom error class for GitHub API errors */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_found' | 'forbidden' | 'rate_limit' | 'api_error',
    public readonly statusCode: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

/** Zod schema for validating parsed issue fields */
const parsedIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1, 'Issue title is required'),
  body: z.string(),
  labels: z.array(z.string()),
  repoOwner: z.string().min(1, 'Repository owner is required'),
  repoName: z.string().min(1, 'Repository name is required'),
  fileMentions: z.array(z.string()),
  stepsToReproduce: z.string().optional(),
  expectedBehavior: z.string().optional(),
});

const FILE_PATH_REGEX = /(?:`([^`\s]+\.[a-zA-Z]{1,10})`|(?:^|\s)((?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z]{1,10}))/gm;

const SECTION_PATTERNS: Record<string, RegExp> = {
  stepsToReproduce: /##?\s*(?:steps?\s*to\s*reproduce|reproduction\s*steps?|how\s*to\s*reproduce|repro(?:duce)?)\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/i,
  expectedBehavior: /##?\s*(?:expected\s*(?:behavior|result|outcome|behaviour))\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/i,
  actualBehavior: /##?\s*(?:actual\s*(?:behavior|result|outcome|behaviour)|current\s*(?:behavior|behaviour))\s*\n([\s\S]*?)(?=\n##?\s|\n*$)/i,
};

const CODE_BLOCK_REGEX = /```[\s\S]*?```/g;

const LANGUAGE_KEYWORDS: Record<string, readonly string[]> = {
  typescript: ['typescript', 'ts', '.ts', '.tsx', 'tsconfig'],
  javascript: ['javascript', 'js', '.js', '.jsx', 'node', 'npm'],
  python: ['python', 'py', '.py', 'pip', 'django', 'flask', 'fastapi'],
  rust: ['rust', 'rs', '.rs', 'cargo'],
  go: ['golang', 'go', '.go'],
  react: ['react', 'jsx', 'tsx', 'component'],
  nextjs: ['next.js', 'nextjs', 'next'],
  vue: ['vue', '.vue', 'vuex', 'nuxt'],
};

const LABEL_TYPE_MAP: Record<string, IssueType> = {
  bug: 'bug',
  'type: bug': 'bug',
  defect: 'bug',
  feature: 'feature',
  enhancement: 'feature',
  'type: feature': 'feature',
  'feature-request': 'feature',
  refactor: 'refactor',
  refactoring: 'refactor',
  test: 'test',
  testing: 'test',
  docs: 'docs',
  documentation: 'docs',
};

const BUG_KEYWORDS = ['bug', 'error', 'crash', 'broken', 'fix', 'issue', 'fail', 'wrong', 'unexpected'];
const FEATURE_KEYWORDS = ['feature', 'add', 'implement', 'new', 'support', 'request', 'proposal', 'enhance'];

/** Extract file paths mentioned in issue body */
export function extractFilePaths(body: string): readonly string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;

  FILE_PATH_REGEX.lastIndex = 0;
  while ((match = FILE_PATH_REGEX.exec(body)) !== null) {
    const filePath = (match[1] ?? match[2])?.trim();
    if (filePath && !filePath.startsWith('http') && !filePath.startsWith('//')) {
      matches.add(filePath);
    }
  }

  return [...matches];
}

/** Extract a named section from the issue body */
export function extractSection(body: string, sectionName: keyof typeof SECTION_PATTERNS): string | undefined {
  const pattern = SECTION_PATTERNS[sectionName];
  if (!pattern) return undefined;

  const match = pattern.exec(body);
  const content = match?.[1]?.trim();
  return content && content.length > 0 ? content : undefined;
}

/** Extract code blocks from the issue body */
export function extractCodeBlocks(body: string): readonly string[] {
  const matches = body.match(CODE_BLOCK_REGEX);
  return matches?.map((block) => block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim()) ?? [];
}

/** Detect languages/frameworks mentioned in the issue */
export function detectLanguages(body: string): readonly string[] {
  const lowerBody = body.toLowerCase();
  const detected = new Set<string>();

  for (const [language, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerBody.includes(keyword.toLowerCase())) {
        detected.add(language);
        break;
      }
    }
  }

  return [...detected];
}

/** Detect issue type from labels and content */
export function detectIssueType(labels: readonly string[], title: string, body: string): IssueType {
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase().trim();
    const mappedType = LABEL_TYPE_MAP[normalizedLabel];
    if (mappedType) return mappedType;
  }

  const lowerContent = `${title} ${body}`.toLowerCase();

  if (BUG_KEYWORDS.some((kw) => lowerContent.includes(kw))) return 'bug';
  if (FEATURE_KEYWORDS.some((kw) => lowerContent.includes(kw))) return 'feature';

  return 'unknown';
}

/** Map GitHub API error status to GitHubApiError */
function handleApiError(error: unknown): never {
  if (error instanceof GitHubApiError) throw error;

  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 404) {
    throw new GitHubApiError(`Issue not found: ${message}`, 'not_found', 404, false);
  }
  if (status === 403) {
    const isRateLimit = message.toLowerCase().includes('rate limit');
    throw new GitHubApiError(
      isRateLimit ? `GitHub API rate limit exceeded: ${message}` : `Access forbidden: ${message}`,
      isRateLimit ? 'rate_limit' : 'forbidden',
      403,
      isRateLimit,
    );
  }

  throw new GitHubApiError(`GitHub API error: ${message}`, 'api_error', status ?? 500, true);
}

/** Parse a GitHub issue into a structured representation */
export async function parseIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<ExtendedParsedIssue> {
  const log = logger.child({ module: 'github-issues', owner, repo, issueNumber });
  log.info('Fetching issue from GitHub');

  let issueData: Awaited<ReturnType<Octokit['rest']['issues']['get']>>['data'];
  try {
    const response = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    issueData = response.data;
  } catch (error: unknown) {
    log.error({ error }, 'Failed to fetch issue from GitHub');
    handleApiError(error);
  }

  const body = issueData.body ?? '';
  const labels = issueData.labels
    .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
    .filter((name) => name.length > 0);

  const fileMentions = extractFilePaths(body);
  const stepsToReproduce = extractSection(body, 'stepsToReproduce');
  const expectedBehavior = extractSection(body, 'expectedBehavior');
  const actualBehavior = extractSection(body, 'actualBehavior');
  const codeBlocks = extractCodeBlocks(body);
  const languages = detectLanguages(body);
  const issueType = detectIssueType(labels, issueData.title, body);

  const rawIssue = {
    number: issueData.number,
    title: issueData.title,
    body,
    labels,
    repoOwner: owner,
    repoName: repo,
    fileMentions: [...fileMentions],
    stepsToReproduce,
    expectedBehavior,
  };

  const validated = parsedIssueSchema.parse(rawIssue);

  const result: ExtendedParsedIssue = {
    ...validated,
    fileMentions: validated.fileMentions as readonly string[],
    labels: validated.labels as readonly string[],
    actualBehavior,
    codeBlocks,
    issueType,
    languages,
  };

  log.info(
    {
      issueType,
      fileCount: fileMentions.length,
      codeBlockCount: codeBlocks.length,
      languageCount: languages.length,
    },
    'Issue parsed successfully',
  );

  return result;
}
