import { z } from 'zod';
import type { ParsedIssue } from '@codepilot/shared';
import type { LLMAdapter, CompletionResult } from '../llm/index.js';
import type { CriticResult, CriticIssue } from './types.js';
import { logger } from '../utils/logger.js';

const PASSING_THRESHOLD = 60;

const CriticIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  description: z.string().min(1),
  file: z.string().optional(),
  line: z.number().optional(),
});

const CriticResponseSchema = z.object({
  correctness: z.number().min(0).max(20),
  security: z.number().min(0).max(20),
  style: z.number().min(0).max(20),
  completeness: z.number().min(0).max(20),
  simplicity: z.number().min(0).max(20),
  feedback: z.string().min(1),
  issues: z.array(CriticIssueSchema),
});

const SYSTEM_PROMPT = `You are CodePilot's code review module. Review the following patch for a GitHub issue and provide a quality assessment.

Score each criterion from 0-20:
1. **Correctness** — Does the patch correctly solve the issue?
2. **Security** — Are there any security concerns introduced?
3. **Style** — Does the code follow good practices and consistent style?
4. **Completeness** — Does the patch fully address the issue requirements?
5. **Simplicity** — Is the solution appropriately simple and maintainable?

Total score is the sum of all criteria (max 100). The patch passes if total >= 60.

Output ONLY valid JSON matching this schema:
{
  "correctness": 0-20,
  "security": 0-20,
  "style": 0-20,
  "completeness": 0-20,
  "simplicity": 0-20,
  "feedback": "Overall review feedback",
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "description": "Issue description",
      "file": "optional/file/path.ts",
      "line": 42
    }
  ]
}

Do NOT include markdown code fences. Output raw JSON only.`;

function buildUserPrompt(patch: string, issue: ParsedIssue, codeContext: string): string {
  return `## GitHub Issue #${issue.number}: ${issue.title}

${issue.body}

## Patch to Review
\`\`\`diff
${patch}
\`\`\`

## Original Code Context
${codeContext || 'No context available.'}`;
}

function extractJson(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const braceStart = text.indexOf('{');
  const braceEnd = text.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }

  return text.trim();
}

/** Review a patch and produce a quality score */
export async function reviewPatch(
  patch: string,
  issue: ParsedIssue,
  codeContext: string,
  llm: LLMAdapter,
): Promise<CriticResult> {
  const log = logger.child({ module: 'critic', issueNumber: issue.number });

  log.info('Reviewing patch');

  const userPrompt = buildUserPrompt(patch, issue, codeContext);

  let completion: CompletionResult;
  try {
    completion = await llm.complete({
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.1,
      maxTokens: 4096,
    });
  } catch (error) {
    log.error({ error }, 'LLM completion failed during review');
    throw error;
  }

  const rawJson = extractJson(completion.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    log.warn('Failed to parse critic JSON response, returning default fail');
    return {
      score: 0,
      passed: false,
      feedback: 'Failed to parse review response from LLM.',
      issues: [{ severity: 'error', description: 'Review response was not valid JSON' }],
    };
  }

  const validateResult = CriticResponseSchema.safeParse(parsed);

  if (!validateResult.success) {
    log.warn({ validationError: validateResult.error.issues }, 'Critic response validation failed');
    return {
      score: 0,
      passed: false,
      feedback: 'Review response did not match expected schema.',
      issues: [{ severity: 'error', description: `Validation error: ${validateResult.error.issues.map((i) => i.message).join(', ')}` }],
    };
  }

  const data = validateResult.data;
  const score = data.correctness + data.security + data.style + data.completeness + data.simplicity;
  const passed = score >= PASSING_THRESHOLD;

  const issues: readonly CriticIssue[] = data.issues.map((i) => ({
    severity: i.severity,
    description: i.description,
    file: i.file,
    line: i.line,
  }));

  const result: CriticResult = {
    score,
    passed,
    feedback: data.feedback,
    issues,
  };

  log.info(
    {
      score,
      passed,
      correctness: data.correctness,
      security: data.security,
      style: data.style,
      completeness: data.completeness,
      simplicity: data.simplicity,
      issueCount: issues.length,
    },
    'Patch review completed',
  );

  return result;
}
