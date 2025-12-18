import { describe, it } from "node:test";
import assert from "node:assert";
import {
  findDuplicateGroups,
  mergeContactFields,
  type ContactForDedupe,
} from "../src/lib/utils/contact-dedupe";

describe("findDuplicateGroups", () => {
  it("should return empty array for no contacts", () => {
    const result = findDuplicateGroups([]);
    assert.deepStrictEqual(result, []);
  });

  it("should return empty array for unique contacts", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "1",
        company_name: "Company A",
        contact_name: null,
        phone: "+41 79 111 11 11",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-01",
        team_id: null,
      },
      {
        id: "2",
        company_name: "Company B",
        contact_name: null,
        phone: "+41 79 222 22 22",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-02",
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.deepStrictEqual(result, []);
  });

  it("should detect duplicates by same phone number", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "1",
        company_name: "Company A",
        contact_name: "John",
        phone: "+41 79 123 45 67",
        email: "a@test.com",
        street: "Street 1",
        city: "Zurich",
        canton: "ZH",
        postal_code: "8000",
        created_at: "2024-01-01",
        team_id: null,
      },
      {
        id: "2",
        company_name: "Company A copy",
        contact_name: null,
        phone: "0041791234567", // Same phone, different format
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-02",
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].primaryId, "1"); // Has more filled fields
    assert.deepStrictEqual(result[0].duplicateIds, ["2"]);
    assert.strictEqual(result[0].matchReason, "phone");
  });

  it("should detect duplicates by same company name (after normalization)", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "1",
        company_name: "M\u00FCller GmbH", // Müller (clean)
        contact_name: null,
        phone: "+41 79 111 11 11",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-01",
        team_id: null,
      },
      {
        id: "2",
        company_name: "  MÜLLER GMBH  ", // Same name, different case/whitespace
        contact_name: null,
        phone: "+41 79 222 22 22", // Different phone
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-02",
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].matchReason, "name");
  });

  it("should pick primary with more filled fields", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "sparse",
        company_name: "Test Company",
        contact_name: null,
        phone: "+41 79 123 45 67",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-01", // Older
        team_id: null,
      },
      {
        id: "rich",
        company_name: "Test Company",
        contact_name: "John Doe",
        phone: "+41 79 123 45 67",
        email: "test@test.com",
        street: "Main St",
        city: "Zurich",
        canton: "ZH",
        postal_code: "8000",
        created_at: "2024-01-02", // Newer
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].primaryId, "rich"); // More filled fields wins
    assert.deepStrictEqual(result[0].duplicateIds, ["sparse"]);
  });

  it("should use oldest as tiebreaker when same filled fields", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "older",
        company_name: "Test Company",
        contact_name: null,
        phone: "+41 79 123 45 67",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-01",
        team_id: null,
      },
      {
        id: "newer",
        company_name: "Test Company",
        contact_name: null,
        phone: "+41 79 123 45 67",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-02",
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].primaryId, "older"); // Oldest wins
  });

  it("should group multiple duplicates together", () => {
    const contacts: ContactForDedupe[] = [
      {
        id: "1",
        company_name: "Test Company",
        contact_name: null,
        phone: "+41 79 123 45 67",
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-01",
        team_id: null,
      },
      {
        id: "2",
        company_name: "Test Company",
        contact_name: null,
        phone: null,
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-02",
        team_id: null,
      },
      {
        id: "3",
        company_name: "Different Name",
        contact_name: null,
        phone: "+41 79 123 45 67", // Same phone as 1
        email: null,
        street: null,
        city: null,
        canton: null,
        postal_code: null,
        created_at: "2024-01-03",
        team_id: null,
      },
    ];

    const result = findDuplicateGroups(contacts);
    assert.strictEqual(result.length, 1); // All in one group via union-find
    assert.strictEqual(result[0].duplicateIds.length, 2); // 2 duplicates
  });
});

describe("mergeContactFields", () => {
  it("should fill empty fields from duplicate", () => {
    const primary: ContactForDedupe = {
      id: "1",
      company_name: "Test Company",
      contact_name: null,
      phone: "+41 79 111 11 11",
      email: null,
      street: null,
      city: null,
      canton: null,
      postal_code: null,
      created_at: null,
      team_id: null,
    };

    const duplicate: ContactForDedupe = {
      id: "2",
      company_name: "Test Company Copy",
      contact_name: "John Doe",
      phone: "+41 79 222 22 22",
      email: "john@test.com",
      street: "Main St",
      city: "Zurich",
      canton: "ZH",
      postal_code: "8000",
      created_at: null,
      team_id: null,
    };

    const result = mergeContactFields(primary, duplicate);

    // Should fill empty fields
    assert.strictEqual(result.contact_name, "John Doe");
    assert.strictEqual(result.email, "john@test.com");
    assert.strictEqual(result.street, "Main St");
    assert.strictEqual(result.city, "Zurich");
    assert.strictEqual(result.canton, "ZH");
    assert.strictEqual(result.postal_code, "8000");

    // Should NOT overwrite existing phone
    assert.strictEqual(result.phone, undefined);
  });

  it("should not overwrite existing fields", () => {
    const primary: ContactForDedupe = {
      id: "1",
      company_name: "Test Company",
      contact_name: "Jane Doe",
      phone: "+41 79 111 11 11",
      email: "jane@test.com",
      street: "Other St",
      city: "Bern",
      canton: "BE",
      postal_code: "3000",
      created_at: null,
      team_id: null,
    };

    const duplicate: ContactForDedupe = {
      id: "2",
      company_name: "Different",
      contact_name: "John Doe",
      phone: "+41 79 222 22 22",
      email: "john@test.com",
      street: "Main St",
      city: "Zurich",
      canton: "ZH",
      postal_code: "8000",
      created_at: null,
      team_id: null,
    };

    const result = mergeContactFields(primary, duplicate);

    // Should return empty object - nothing to fill
    assert.deepStrictEqual(result, {});
  });
});
