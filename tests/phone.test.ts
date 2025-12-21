/**
 * Unit tests for phone number normalization and WhatsApp link generation
 * Run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhoneToE164,
  getWhatsAppDigits,
  getWhatsAppLink,
} from "../src/lib/utils/phone";

describe("normalizePhoneToE164", () => {
  describe("Swiss phone formats with +41", () => {
    it("normalizes +41 79 123 45 67 (with spaces)", () => {
      const result = normalizePhoneToE164("+41 79 123 45 67");
      assert.equal(result, "+41791234567");
    });

    it("normalizes +41791234567 (already E.164)", () => {
      const result = normalizePhoneToE164("+41791234567");
      assert.equal(result, "+41791234567");
    });

    it("normalizes +41 79 123 4567 (mixed spacing)", () => {
      const result = normalizePhoneToE164("+41 79 123 4567");
      assert.equal(result, "+41791234567");
    });
  });

  describe("Swiss phone formats with 0 prefix", () => {
    it("normalizes 079 123 45 67 to +41", () => {
      const result = normalizePhoneToE164("079 123 45 67");
      assert.equal(result, "+41791234567");
    });

    it("normalizes 0791234567 (no spaces)", () => {
      const result = normalizePhoneToE164("0791234567");
      assert.equal(result, "+41791234567");
    });

    it("normalizes 044 123 45 67 (landline)", () => {
      const result = normalizePhoneToE164("044 123 45 67");
      assert.equal(result, "+41441234567");
    });
  });

  describe("International format with 00", () => {
    it("normalizes 0041 79 123 45 67 to +41", () => {
      const result = normalizePhoneToE164("0041 79 123 45 67");
      assert.equal(result, "+41791234567");
    });

    it("normalizes 0041791234567 (no spaces)", () => {
      const result = normalizePhoneToE164("0041791234567");
      assert.equal(result, "+41791234567");
    });
  });

  describe("Edge cases", () => {
    it("returns null for null input", () => {
      const result = normalizePhoneToE164(null);
      assert.equal(result, null);
    });

    it("returns null for undefined input", () => {
      const result = normalizePhoneToE164(undefined);
      assert.equal(result, null);
    });

    it("returns null for empty string", () => {
      const result = normalizePhoneToE164("");
      assert.equal(result, null);
    });

    it("returns null for too short number", () => {
      const result = normalizePhoneToE164("123");
      assert.equal(result, null);
    });

    it("handles numbers with dashes", () => {
      const result = normalizePhoneToE164("+41-79-123-45-67");
      assert.equal(result, "+41791234567");
    });

    it("handles numbers with parentheses", () => {
      const result = normalizePhoneToE164("+41 (0) 79 123 45 67");
      assert.equal(result, "+41791234567");
    });
  });
});

describe("getWhatsAppDigits", () => {
  it("returns digits without + prefix", () => {
    const result = getWhatsAppDigits("+41 79 123 45 67");
    assert.equal(result, "41791234567");
  });

  it("works with Swiss 0-prefix format", () => {
    const result = getWhatsAppDigits("079 123 45 67");
    assert.equal(result, "41791234567");
  });

  it("returns null for invalid phone", () => {
    const result = getWhatsAppDigits("invalid");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = getWhatsAppDigits(null);
    assert.equal(result, null);
  });
});

describe("getWhatsAppLink", () => {
  it("generates correct wa.me link for Swiss mobile", () => {
    const result = getWhatsAppLink("+41 79 123 45 67");
    assert.equal(result, "https://wa.me/41791234567");
  });

  it("generates correct wa.me link for 0-prefix format", () => {
    const result = getWhatsAppLink("079 123 45 67");
    assert.equal(result, "https://wa.me/41791234567");
  });

  it("returns null for invalid phone", () => {
    const result = getWhatsAppLink("not a phone");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = getWhatsAppLink(null);
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = getWhatsAppLink("");
    assert.equal(result, null);
  });
});

