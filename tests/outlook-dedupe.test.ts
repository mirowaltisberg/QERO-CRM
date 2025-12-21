/**
 * Unit tests for Outlook contact sync deduplication logic
 * Run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePhoneDigits,
  extractEmailDomain,
  normalizeName,
  isPublicEmailDomain,
  checkDuplicate,
  PUBLIC_EMAIL_DOMAINS,
} from "../src/lib/utils/outlook-dedupe";

describe("normalizePhoneDigits", () => {
  it("extracts digits from phone with spaces", () => {
    const result = normalizePhoneDigits("+41 79 123 45 67");
    assert.equal(result, "41791234567");
  });

  it("extracts digits from phone with dashes", () => {
    const result = normalizePhoneDigits("+41-79-123-45-67");
    assert.equal(result, "41791234567");
  });

  it("handles Swiss local format", () => {
    const result = normalizePhoneDigits("079 123 45 67");
    assert.equal(result, "0791234567");
  });

  it("returns null for short phone (less than 6 digits)", () => {
    const result = normalizePhoneDigits("12345");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = normalizePhoneDigits(null);
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = normalizePhoneDigits("");
    assert.equal(result, null);
  });

  it("accepts exactly 6 digits", () => {
    const result = normalizePhoneDigits("123456");
    assert.equal(result, "123456");
  });
});

describe("extractEmailDomain", () => {
  it("extracts domain from standard email", () => {
    const result = extractEmailDomain("user@example.com");
    assert.equal(result, "example.com");
  });

  it("lowercases the domain", () => {
    const result = extractEmailDomain("USER@EXAMPLE.COM");
    assert.equal(result, "example.com");
  });

  it("handles email with subdomain", () => {
    const result = extractEmailDomain("user@mail.example.com");
    assert.equal(result, "mail.example.com");
  });

  it("returns null for email without @", () => {
    const result = extractEmailDomain("notanemail");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = extractEmailDomain(null);
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = extractEmailDomain("");
    assert.equal(result, null);
  });
});

describe("normalizeName", () => {
  it("lowercases and trims name", () => {
    const result = normalizeName("  ACME Corp  ");
    assert.equal(result, "acme corp");
  });

  it("collapses multiple spaces", () => {
    const result = normalizeName("ACME   Corp   AG");
    assert.equal(result, "acme corp ag");
  });

  it("returns null for single character name", () => {
    const result = normalizeName("X");
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    const result = normalizeName(null);
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = normalizeName("");
    assert.equal(result, null);
  });

  it("accepts 2-character name", () => {
    const result = normalizeName("AB");
    assert.equal(result, "ab");
  });
});

describe("isPublicEmailDomain", () => {
  it("identifies gmail.com as public", () => {
    assert.equal(isPublicEmailDomain("gmail.com"), true);
  });

  it("identifies outlook.com as public", () => {
    assert.equal(isPublicEmailDomain("outlook.com"), true);
  });

  it("identifies bluewin.ch as public (Swiss provider)", () => {
    assert.equal(isPublicEmailDomain("bluewin.ch"), true);
  });

  it("identifies protonmail.com as public", () => {
    assert.equal(isPublicEmailDomain("protonmail.com"), true);
  });

  it("returns false for corporate domain", () => {
    assert.equal(isPublicEmailDomain("acme.ch"), false);
  });

  it("returns false for null", () => {
    assert.equal(isPublicEmailDomain(null), false);
  });

  it("is case-insensitive", () => {
    assert.equal(isPublicEmailDomain("GMAIL.COM"), true);
  });

  it("includes all major consumer email providers", () => {
    const providers = [
      "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
      "yahoo.com", "icloud.com", "gmx.ch", "gmx.net", "gmx.de",
      "bluewin.ch", "sunrise.ch", "protonmail.com", "proton.me",
    ];
    for (const provider of providers) {
      assert.equal(PUBLIC_EMAIL_DOMAINS.has(provider), true, `Expected ${provider} to be in PUBLIC_EMAIL_DOMAINS`);
    }
  });
});

describe("checkDuplicate", () => {
  const emptyPhones = new Set<string>();
  const emptyNames = new Set<string>();
  const emptyDomains = new Set<string>();
  const emptyGraphIds = new Set<string>();

  it("returns false for completely new contact", () => {
    const result = checkDuplicate(
      {
        phone: "+41 79 123 45 67",
        email: "info@newcompany.ch",
        company_name: "New Company AG",
        source_graph_contact_id: "graph-id-123",
      },
      emptyPhones,
      emptyNames,
      emptyDomains,
      emptyGraphIds
    );
    assert.equal(result.isDuplicate, false);
    assert.equal(result.reason, null);
  });

  it("detects duplicate by phone", () => {
    const existingPhones = new Set(["41791234567"]);
    const result = checkDuplicate(
      {
        phone: "+41 79 123 45 67", // Same phone, different format
        email: "different@different.ch",
        company_name: "Different Company",
        source_graph_contact_id: "graph-id-456",
      },
      existingPhones,
      emptyNames,
      emptyDomains,
      emptyGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "phone");
  });

  it("detects duplicate by email domain", () => {
    const existingDomains = new Set(["acme.ch"]);
    const result = checkDuplicate(
      {
        phone: null,
        email: "different-person@acme.ch", // Same domain
        company_name: "Different Name",
        source_graph_contact_id: "graph-id-789",
      },
      emptyPhones,
      emptyNames,
      existingDomains,
      emptyGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "email_domain");
  });

  it("does NOT skip public email domains (like gmail)", () => {
    const existingDomains = new Set(["gmail.com"]);
    const result = checkDuplicate(
      {
        phone: null,
        email: "another-person@gmail.com", // Same public domain
        company_name: "Different Person",
        source_graph_contact_id: "graph-id-101",
      },
      emptyPhones,
      emptyNames,
      existingDomains,
      emptyGraphIds
    );
    // Should NOT be duplicate because gmail.com is a public domain
    assert.equal(result.isDuplicate, false);
    assert.equal(result.reason, null);
  });

  it("detects duplicate by name", () => {
    const existingNames = new Set(["acme corp ag"]);
    const result = checkDuplicate(
      {
        phone: null,
        email: null,
        company_name: "ACME Corp AG", // Same name, different case
        source_graph_contact_id: "graph-id-202",
      },
      emptyPhones,
      existingNames,
      emptyDomains,
      emptyGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "name");
  });

  it("detects duplicate by Graph ID (already imported)", () => {
    const existingGraphIds = new Set(["graph-id-existing"]);
    const result = checkDuplicate(
      {
        phone: "+41 79 999 99 99",
        email: "unique@unique.ch",
        company_name: "Unique Company",
        source_graph_contact_id: "graph-id-existing", // Same Graph ID
      },
      emptyPhones,
      emptyNames,
      emptyDomains,
      existingGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "graph_id");
  });

  it("handles name with extra whitespace", () => {
    const existingNames = new Set(["acme corp"]);
    const result = checkDuplicate(
      {
        phone: null,
        email: null,
        company_name: "  ACME   Corp  ", // Extra spaces
        source_graph_contact_id: "graph-id-303",
      },
      emptyPhones,
      existingNames,
      emptyDomains,
      emptyGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "name");
  });

  it("prioritizes graph_id check over other checks", () => {
    // If a contact has the same graph ID, it's a duplicate regardless of other fields
    const existingGraphIds = new Set(["graph-id-priority"]);
    const result = checkDuplicate(
      {
        phone: "+41 79 111 11 11", // Different phone
        email: "different@different.ch", // Different email
        company_name: "Different Company", // Different name
        source_graph_contact_id: "graph-id-priority", // Same Graph ID
      },
      emptyPhones,
      emptyNames,
      emptyDomains,
      existingGraphIds
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "graph_id");
  });
});

describe("integration scenarios", () => {
  it("allows multiple contacts from same public domain but different companies", () => {
    // Scenario: Two different companies where employees use gmail
    const existingDomains = new Set(["gmail.com"]);
    const existingNames = new Set(["company a"]);

    const result = checkDuplicate(
      {
        phone: null,
        email: "owner@gmail.com",
        company_name: "Company B", // Different company
        source_graph_contact_id: "graph-id-b",
      },
      new Set<string>(),
      existingNames,
      existingDomains,
      new Set<string>()
    );
    // Not duplicate: different name, and gmail is public domain
    assert.equal(result.isDuplicate, false);
  });

  it("blocks same company with different email but matching phone", () => {
    // Scenario: Same company added with different email but same phone
    // Note: normalizePhoneDigits extracts digits only, doesn't normalize to E.164
    const existingPhones = new Set(["0445551234"]);

    const result = checkDuplicate(
      {
        phone: "044 555 12 34", // Same phone, different format
        email: "sales@different.ch", // Different email
        company_name: "Different Name", // Different name
        source_graph_contact_id: "graph-id-new",
      },
      existingPhones,
      new Set<string>(),
      new Set<string>(),
      new Set<string>()
    );
    assert.equal(result.isDuplicate, true);
    assert.equal(result.reason, "phone");
  });
});

