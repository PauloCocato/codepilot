import { z } from 'zod';
import type { ParsedIssue } from '@codepilot/shared';
import type { LLMAdapter, CompletionResult } from '../llm/index.js';
import type { Plan } from './types.js';
import { logger } from '../utils/logger.js';

const MAX_PLAN_RETRIES = 2;

const PlanStepSchema = z.object({
  description: z.string().min(1),
  files: z.array(z.string()),
  action: z.enum(['modify', 'create', 'delete']),
});

const PlanSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(PlanStepSchema).min(1),
  estimatedFiles: z.array(z.string()),
  approach: z.string().min(1),
});

const SYSTEM_PROMPT = `You are CodePilot's planning module. Given a GitHub issue and relevant code context, create a step-by-step plan to resolve the issue.

Be specific about which files and functions need to change. Consider edge cases and testing requirements.

Output ONLY valid JSON matching this schema:
{
  "summary": "Brief description of the solution",
  "steps": [
    {
      "description": "What to do in this step",
      "files": ["path/to/file.ts"],
      "action": "modify" | "create" | "delete"
    }
  ],
  "estimatedFiles": ["all/files/that/will/change.ts"],
  "approach": "High-level description of the approach"
}

Do NOT include markdown code fences. Output raw JSON only.`;

function buildUserPrompt(issue: ParsedIssue, codeContext: string): string {
  return `## GitHub Issue #${issue.number}: ${issue.title}

${issue.body}

${issue.stepsToReproduce ? `### Steps to Reproduce\n${issue.stepsToReproduce}\n` : ''}
${issue.expectedBehavior ? `### Expected Behavior\n${issue.expectedBehavior}\n` : ''}
### Labels
${issue.labels.join(', ') || 'None'}

### File Mentions
${issue.fileMentions.join(', ') || 'None'}

## Relevant Code Context
${codeContext || 'No relevant code found.'}`;
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

/** Create a solution plan for a given issue using an LLM */
export async function createPlan(
  issue: ParsedIssue,
  codeContext: string,
  llm: LLMAdapter,
): Promise<Plan> {
  const log = logger.child({ module: 'planner', issueNumber: issue.number });

  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_PLAN_RETRIES; attempt++) {
    log.info({ attempt }, 'Creating solution plan');

    const userPrompt = lastError
      ? `${buildUserPrompt(issue, codeContext)}\n\n### Previous Attempt Failed\nValidation error: ${lastError}\nPlease fix the JSON output.`
      : buildUserPrompt(issue, codeContext);

    let completion: CompletionResult;
    try {
      completion = await llm.complete({
        systemPrompt: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        maxTokens: 4096,
      });
    } catch (error) {
      log.error({ error, attempt }, 'LLM completion failed during planning');
      throw error;
    }

    const rawJson = extractJson(completion.content);

    const parseResult = PlanSchema.safeParse((() => {
      try {
        return JSON.parse(rawJson);
      } catch {
        return null;
      }
    })());

    if (parseResult.success) {
      const plan: Plan = {
        summary: parseResult.data.summary,
        steps: parseResult.data.steps.map((s) => ({
          description: s.description,
          files: [...s.files],
          action: s.action,
        })),
        estimatedFiles: [...parseResult.data.estimatedFiles],
        approach: parseResult.data.approach,
      };

      log.info(
        { stepCount: plan.steps.length, files: plan.estimatedFiles.length },
        'Plan created successfully',
      );
      return plan;
    }

    lastError = parseResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    log.warn({ attempt, validationError: lastError }, 'Plan validation failed, retrying');
  }

  const finalError = `Failed to create valid plan after ${MAX_PLAN_RETRIES + 1} attempts: ${lastError}`;
  log.error(finalError);
  throw new PlannerError(finalError, 'validation_failed');
}

/** Custom error class for planner errors */
export class PlannerError extends Error {
  constructor(
    message: string,
    public readonly code: 'validation_failed' | 'llm_error',
  ) {
    super(message);
    this.name = 'PlannerError';
  }
}
