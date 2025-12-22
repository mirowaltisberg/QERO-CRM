/**
 * Tests for Outlook folder → specialization mapping
 */

import { describe, it, expect } from "vitest";
import { deriveSpecializationFromFolderName } from "../src/lib/utils/outlook-specialization";

describe("deriveSpecializationFromFolderName", () => {
  describe("Holzbau detection", () => {
    it("detects 'Holzbau' folder", () => {
      expect(deriveSpecializationFromFolderName("Holzbau")).toBe("holzbau");
    });

    it("detects 'holz' in folder name (case insensitive)", () => {
      expect(deriveSpecializationFromFolderName("Holz-Kontakte")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("HOLZ")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("Kontakte Holz")).toBe("holzbau");
    });

    it("detects 'Schreinerei' folder", () => {
      expect(deriveSpecializationFromFolderName("Schreinerei")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("Schreinereien Zürich")).toBe("holzbau");
    });

    it("detects 'Zimmerer' folder", () => {
      expect(deriveSpecializationFromFolderName("Zimmerer")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("Zimmerei Kontakte")).toBe("holzbau");
    });
  });

  describe("Dachdecker detection", () => {
    it("detects 'Dachdecker' folder", () => {
      expect(deriveSpecializationFromFolderName("Dachdecker")).toBe("dachdecker");
    });

    it("detects 'dach' in folder name (case insensitive)", () => {
      expect(deriveSpecializationFromFolderName("Dach-Kontakte")).toBe("dachdecker");
      expect(deriveSpecializationFromFolderName("DACHDECKER")).toBe("dachdecker");
      expect(deriveSpecializationFromFolderName("Kontakte Dach")).toBe("dachdecker");
    });

    it("detects 'Spengler' folder", () => {
      expect(deriveSpecializationFromFolderName("Spengler")).toBe("dachdecker");
      expect(deriveSpecializationFromFolderName("Spenglerei Bern")).toBe("dachdecker");
    });
  });

  describe("No match", () => {
    it("returns null for unrelated folder names", () => {
      expect(deriveSpecializationFromFolderName("Kontakte")).toBeNull();
      expect(deriveSpecializationFromFolderName("Firma ABC")).toBeNull();
      expect(deriveSpecializationFromFolderName("Elektro")).toBeNull();
      expect(deriveSpecializationFromFolderName("Sanitär")).toBeNull();
      expect(deriveSpecializationFromFolderName("")).toBeNull();
    });

    it("returns null for generic folder names", () => {
      expect(deriveSpecializationFromFolderName("Default Contacts")).toBeNull();
      expect(deriveSpecializationFromFolderName("Alle Kontakte")).toBeNull();
    });
  });

  describe("Edge cases", () => {
    it("handles mixed case", () => {
      expect(deriveSpecializationFromFolderName("HoLzBaU")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("DACHDECKER")).toBe("dachdecker");
    });

    it("handles folders with special characters", () => {
      expect(deriveSpecializationFromFolderName("Holz (alt)")).toBe("holzbau");
      expect(deriveSpecializationFromFolderName("Dach/Spengler")).toBe("dachdecker");
    });

    it("prioritizes 'dach' when both keywords present", () => {
      // Dach check comes first in the function, so it should return dachdecker
      expect(deriveSpecializationFromFolderName("Holz und Dach")).toBe("dachdecker");
    });
  });
});

