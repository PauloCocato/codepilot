import type { SafetyReport, SafetyViolation, SafetyCategory } from './types.js';

function groupByCategory(
  violations: readonly SafetyViolation[],
): ReadonlyMap<SafetyCategory, readonly SafetyViolation[]> {
  const groups = new Map<SafetyCategory, SafetyViolation[]>();

  for (const violation of violations) {
    const existing = groups.get(violation.category);
    if (existing) {
      groups.set(violation.category, [...existing, violation]);
    } else {
      groups.set(violation.category, [violation]);
    }
  }

  return groups;
}

function severityEmoji(severity: SafetyViolation['severity']): string {
  switch (severity) {
    case 'critical': return '[CRITICAL]';
    case 'high': return '[HIGH]';
    case 'medium': return '[MEDIUM]';
    case 'low': return '[LOW]';
  }
}

function categoryLabel(category: SafetyCategory): string {
  switch (category) {
    case 'injection': return 'Injection';
    case 'secrets': return 'Secrets';
    case 'filesystem': return 'Filesystem';
    case 'network': return 'Network';
    case 'crypto': return 'Cryptography';
    case 'dependencies': return 'Dependencies';
    case 'general': return 'General';
  }
}

function formatViolation(violation: SafetyViolation): string {
  const parts: string[] = [];
  parts.push(`  ${severityEmoji(violation.severity)} **${violation.ruleName}** (${violation.ruleId})`);
  parts.push(`    ${violation.description}`);

  if (violation.file) {
    const location = violation.line ? `${violation.file}:${violation.line}` : violation.file;
    parts.push(`    Location: ${location}`);
  } else if (violation.line) {
    parts.push(`    Line: ${violation.line}`);
  }

  if (violation.suggestion) {
    parts.push(`    Suggestion: ${violation.suggestion}`);
  }

  return parts.join('\n');
}

export function formatSafetyReport(report: SafetyReport): string {
  const lines: string[] = [];

  const statusIcon = report.passed ? 'PASS' : 'FAIL';
  lines.push(`# Safety Report [${statusIcon}]`);
  lines.push('');
  lines.push(`**Score:** ${report.score}/100 (threshold: ${report.threshold})`);
  lines.push(`**Rules checked:** ${report.ruleCount}`);
  lines.push(`**Violations found:** ${report.violations.length}`);
  lines.push(`**Checked at:** ${report.checkedAt.toISOString()}`);
  lines.push('');

  if (report.violations.length === 0) {
    lines.push('No security violations detected.');
    return lines.join('\n');
  }

  lines.push('## Violations');
  lines.push('');

  const grouped = groupByCategory(report.violations);

  for (const [category, violations] of grouped) {
    lines.push(`### ${categoryLabel(category)}`);
    lines.push('');
    for (const violation of violations) {
      lines.push(formatViolation(violation));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push(report.summary);

  return lines.join('\n');
}

export function formatSafetyReportForPR(report: SafetyReport): string {
  const lines: string[] = [];

  const statusIcon = report.passed ? 'PASS' : 'FAIL';
  lines.push(`## Safety Check [${statusIcon}]`);
  lines.push('');
  lines.push(`Score: **${report.score}/100** | Threshold: ${report.threshold} | Rules: ${report.ruleCount}`);
  lines.push('');

  if (report.violations.length === 0) {
    lines.push('No security issues found.');
    return lines.join('\n');
  }

  const critical = report.violations.filter((v) => v.severity === 'critical');
  const high = report.violations.filter((v) => v.severity === 'high');
  const medium = report.violations.filter((v) => v.severity === 'medium');
  const low = report.violations.filter((v) => v.severity === 'low');

  if (critical.length > 0) {
    lines.push(`**Critical (${critical.length}):**`);
    for (const v of critical) {
      lines.push(`- ${v.ruleName}: ${v.description}`);
    }
    lines.push('');
  }

  if (high.length > 0) {
    lines.push(`**High (${high.length}):**`);
    for (const v of high) {
      lines.push(`- ${v.ruleName}: ${v.description}`);
    }
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push(`**Medium (${medium.length}):**`);
    for (const v of medium) {
      lines.push(`- ${v.ruleName}: ${v.description}`);
    }
    lines.push('');
  }

  if (low.length > 0) {
    lines.push(`**Low (${low.length}):**`);
    for (const v of low) {
      lines.push(`- ${v.ruleName}: ${v.description}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
