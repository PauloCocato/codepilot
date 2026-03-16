import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { InstallationRepository } from "./installations.js";
import type { InsertInstallation } from "../types.js";

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockClient() {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chainable.select.mockReturnValue(chainable);
  chainable.insert.mockReturnValue(chainable);
  chainable.update.mockReturnValue(chainable);
  chainable.upsert.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

const VALID_INSTALLATION: InsertInstallation = {
  id: 12345,
  account_login: "acme",
  account_type: "Organization",
  repository_selection: "all",
  status: "active",
};

const MOCK_ROW = {
  id: 12345,
  account_login: "acme",
  account_type: "Organization",
  repository_selection: "all",
  status: "active",
  created_at: "2026-03-16T00:00:00Z",
  updated_at: "2026-03-16T00:00:00Z",
};

describe("InstallationRepository", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let repo: InstallationRepository;

  beforeEach(() => {
    mockClient = createMockClient();
    repo = new InstallationRepository(mockClient as unknown as SupabaseClient);
  });

  describe("upsert", () => {
    it("should create a new installation", async () => {
      mockClient._chain.single.mockResolvedValue({
        data: MOCK_ROW,
        error: null,
      });

      const result = await repo.upsert(VALID_INSTALLATION);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(12345);
        expect(result.data.account_login).toBe("acme");
        expect(result.data.status).toBe("active");
      }
    });

    it("should update an existing installation on conflict", async () => {
      const updatedRow = { ...MOCK_ROW, repository_selection: "selected" };
      mockClient._chain.single.mockResolvedValue({
        data: updatedRow,
        error: null,
      });

      const result = await repo.upsert({
        ...VALID_INSTALLATION,
        repository_selection: "selected",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.repository_selection).toBe("selected");
      }
      expect(mockClient._chain.upsert).toHaveBeenCalled();
    });

    it("should return validation error for invalid data", async () => {
      const invalid = { ...VALID_INSTALLATION, id: -1 };

      const result = await repo.upsert(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should return validation error for empty accountLogin", async () => {
      const invalid = { ...VALID_INSTALLATION, account_login: "" };

      const result = await repo.upsert(invalid);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should return error when upsert fails", async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: "upsert failed" },
      });

      const result = await repo.upsert(VALID_INSTALLATION);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("UPSERT_FAILED");
      }
    });
  });

  describe("delete", () => {
    it("should soft-delete by setting status to deleted", async () => {
      const deletedRow = { ...MOCK_ROW, status: "deleted" };
      mockClient._chain.single.mockResolvedValue({
        data: deletedRow,
        error: null,
      });

      const result = await repo.delete(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe("deleted");
      }
    });

    it("should return error when delete fails", async () => {
      mockClient._chain.single.mockResolvedValue({
        data: null,
        error: { message: "not found" },
      });

      const result = await repo.delete(99999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("UPDATE_FAILED");
      }
    });
  });

  describe("getById", () => {
    it("should return installation by id", async () => {
      mockClient._chain.maybeSingle.mockResolvedValue({
        data: MOCK_ROW,
        error: null,
      });

      const result = await repo.getById(12345);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toBeNull();
        expect(result.data!.id).toBe(12345);
      }
    });

    it("should return null for non-existent installation", async () => {
      mockClient._chain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await repo.getById(99999);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe("listActive", () => {
    it("should return only active installations", async () => {
      mockClient._chain.order.mockResolvedValue({
        data: [MOCK_ROW],
        error: null,
      });

      const result = await repo.listActive();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(1);
        expect(result.data[0].status).toBe("active");
      }
      expect(mockClient._chain.eq).toHaveBeenCalledWith("status", "active");
    });
  });
});
