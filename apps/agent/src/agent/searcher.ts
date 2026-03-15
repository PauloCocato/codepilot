import type { ParsedIssue } from '@codepilot/shared';
import type { VectorStore, SearchResult } from '../indexer/store.js';
import { logger } from '../utils/logger.js';

const MAX_CONTEXT_TOKENS = 30_000;
const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_CHARS = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
const TOP_K_PER_QUERY = 10;

function extractErrorMessages(text: string): readonly string[] {
  const patterns = [
    /(?:Error|Exception|TypeError|ReferenceError|SyntaxError):\s*(.+)/g,
    /(?:ENOENT|EACCES|EPERM|ETIMEDOUT):\s*(.+)/g,
    /(?:Cannot find module|Module not found)\s*['"]([^'"]+)['"]/g,
    /(?:is not a function|is not defined|is undefined)/g,
    /(?:expected|unexpected)\s+.+/gi,
  ];

  const messages: string[] = [];
  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match !== null) {
      messages.push(match[0].trim());
      match = pattern.exec(text);
    }
  }
  return messages;
}

function extractKeywords(issue: ParsedIssue): readonly string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'but', 'and', 'or', 'not', 'no',
    'this', 'that', 'these', 'those', 'it', 'its', 'i', 'we', 'you',
    'they', 'he', 'she', 'when', 'where', 'how', 'what', 'which',
    'who', 'whom', 'why', 'if', 'then', 'else', 'so', 'than',
  ]);

  const combined = `${issue.title} ${issue.body}`;
  const words = combined
    .toLowerCase()
    .replace(/[^a-z0-9_.\-/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return [...new Set(words)].slice(0, 20);
}

function buildQueries(issue: ParsedIssue): readonly string[] {
  const queries: string[] = [];

  queries.push(issue.title);

  if (issue.fileMentions.length > 0) {
    queries.push(`files: ${issue.fileMentions.join(', ')}`);
  }

  const fullText = `${issue.title}\n${issue.body}`;
  const errors = extractErrorMessages(fullText);
  if (errors.length > 0) {
    queries.push(errors.join(' '));
  }

  if (issue.stepsToReproduce) {
    queries.push(issue.stepsToReproduce);
  }

  const keywords = extractKeywords(issue);
  if (keywords.length > 0) {
    queries.push(keywords.slice(0, 10).join(' '));
  }

  if (issue.labels.length > 0) {
    queries.push(`${issue.labels.join(' ')} ${issue.title}`);
  }

  return queries;
}

function deduplicateResults(resultSets: readonly (readonly SearchResult[])[]): readonly SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const results of resultSets) {
    for (const result of results) {
      const key = `${result.chunk.filePath}:${result.chunk.startLine}-${result.chunk.endLine}`;
      const existing = seen.get(key);

      if (!existing || result.score > existing.score) {
        seen.set(key, result);
      }
    }
  }

  return [...seen.values()].sort((a, b) => b.score - a.score);
}

function formatContextString(results: readonly SearchResult[]): string {
  const sections: string[] = [];
  let totalChars = 0;

  for (const result of results) {
    const section = [
      `--- ${result.chunk.filePath} (lines ${result.chunk.startLine}-${result.chunk.endLine}, ${result.chunk.language}, score: ${result.score.toFixed(3)}) ---`,
      result.chunk.content,
      '',
    ].join('\n');

    if (totalChars + section.length > MAX_CONTEXT_CHARS) {
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  return sections.join('\n');
}

export async function searchForIssue(
  issue: ParsedIssue,
  store: VectorStore,
): Promise<string> {
  const log = logger.child({ module: 'searcher', issueNumber: issue.number });

  const queries = buildQueries(issue);
  log.info({ queryCount: queries.length, queries }, 'Built search queries from issue');

  const resultSets: SearchResult[][] = [];

  for (const query of queries) {
    try {
      const results = await store.search(query, TOP_K_PER_QUERY);
      resultSets.push([...results]);
      log.debug({ query: query.slice(0, 80), resultCount: results.length }, 'Query executed');
    } catch (error) {
      log.warn({ query: query.slice(0, 80), error }, 'Query failed, skipping');
    }
  }

  const deduplicated = deduplicateResults(resultSets);
  const context = formatContextString(deduplicated);

  log.info({
    totalResults: deduplicated.length,
    contextLength: context.length,
    estimatedTokens: Math.ceil(context.length / CHARS_PER_TOKEN),
  }, 'Search context assembled');

  return context;
}

export {
  extractErrorMessages,
  extractKeywords,
  buildQueries,
  deduplicateResults,
  formatContextString,
};
