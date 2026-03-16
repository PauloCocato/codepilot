import type { SafetyRule, SafetyViolation } from "../types.js";

function findLineNumber(
  patch: string,
  match: RegExpExecArray,
): number | undefined {
  const beforeMatch = patch.slice(0, match.index);
  const lines = beforeMatch.split("\n");
  return lines.length;
}

// Common packages that are targets for typosquatting
const KNOWN_PACKAGES = [
  "express",
  "lodash",
  "axios",
  "react",
  "webpack",
  "babel",
  "eslint",
  "prettier",
  "typescript",
  "mongoose",
  "sequelize",
  "fastify",
  "next",
  "jest",
  "vitest",
  "chalk",
  "commander",
  "inquirer",
  "moment",
  "dayjs",
];

function isSuspiciousName(name: string): boolean {
  for (const known of KNOWN_PACKAGES) {
    if (name === known) continue;
    // One character difference
    if (Math.abs(name.length - known.length) <= 1) {
      let diffs = 0;
      const maxLen = Math.max(name.length, known.length);
      for (let i = 0; i < maxLen; i++) {
        if (name[i] !== known[i]) diffs++;
      }
      if (diffs === 1) return true;
    }
    // Added/removed hyphen or underscore: "lodash" vs "lo-dash"
    if (
      name.replace(/[-_]/g, "") === known.replace(/[-_]/g, "") &&
      name !== known
    ) {
      return true;
    }
  }
  return false;
}

export const suspiciousDependency: SafetyRule = {
  id: "DEP-001",
  name: "Suspicious Dependency Name",
  severity: "high",
  category: "dependencies",
  check(patch: string): SafetyViolation | null {
    // Look for package.json dependency additions
    const depPattern = /"(@?[\w/-]+)"\s*:\s*"[^"]+"/g;
    let match: RegExpExecArray | null;

    while ((match = depPattern.exec(patch)) !== null) {
      const pkgName = match[1];
      if (pkgName && isSuspiciousName(pkgName)) {
        return {
          ruleId: suspiciousDependency.id,
          ruleName: suspiciousDependency.name,
          severity: suspiciousDependency.severity,
          category: suspiciousDependency.category,
          description: `Potentially typosquatted package name detected: "${pkgName}". Verify this is the intended package.`,
          line: findLineNumber(patch, match),
          suggestion:
            "Double-check the package name on npmjs.com. Typosquatting is a common supply chain attack vector.",
        };
      }
    }
    return null;
  },
};

export const wildcardVersion: SafetyRule = {
  id: "DEP-002",
  name: "Wildcard Dependency Version",
  severity: "medium",
  category: "dependencies",
  check(patch: string): SafetyViolation | null {
    const pattern = /"(@?[\w/-]+)"\s*:\s*"\*"/;
    const match = pattern.exec(patch);
    if (match) {
      return {
        ruleId: wildcardVersion.id,
        ruleName: wildcardVersion.name,
        severity: wildcardVersion.severity,
        category: wildcardVersion.category,
        description: `Wildcard version "*" used for package "${match[1]}". This accepts any version including potentially malicious ones.`,
        line: findLineNumber(patch, match),
        suggestion:
          'Pin dependency versions or use a range like "^1.0.0" to limit accepted versions.',
      };
    }
    return null;
  },
};

export const postInstallScript: SafetyRule = {
  id: "DEP-003",
  name: "Suspicious postinstall Script",
  severity: "high",
  category: "dependencies",
  check(patch: string): SafetyViolation | null {
    // Detect postinstall scripts that run suspicious commands
    const scriptPattern =
      /["'](?:postinstall|preinstall|install)["']\s*:\s*["']([^"']+)["']/;
    const match = scriptPattern.exec(patch);
    if (match) {
      const script = match[1];
      const suspiciousPatterns = [
        /curl\s/,
        /wget\s/,
        /\|\s*(?:bash|sh|zsh)/,
        /eval\s/,
        /base64/,
        /node\s+-e/,
      ];

      for (const suspicious of suspiciousPatterns) {
        if (suspicious.test(script)) {
          return {
            ruleId: postInstallScript.id,
            ruleName: postInstallScript.name,
            severity: postInstallScript.severity,
            category: postInstallScript.category,
            description: `Suspicious postinstall script detected: "${script}". This may download and run arbitrary code during installation.`,
            line: findLineNumber(patch, match),
            suggestion:
              "Review the postinstall script carefully. Avoid scripts that download and execute code.",
          };
        }
      }
    }
    return null;
  },
};

export const dependenciesRules: readonly SafetyRule[] = [
  suspiciousDependency,
  wildcardVersion,
  postInstallScript,
];
