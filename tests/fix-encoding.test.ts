import { describe, it } from "node:test";
import assert from "node:assert";
import {
  fixEncodingString,
  hasEncodingIssues,
  fixContactEncoding,
  fixObjectEncoding,
  normalizeCompanyName,
  normalizePhone,
} from "../src/lib/utils/fix-encoding";

describe("fixEncodingString", () => {
  it("should return null for null/undefined input", () => {
    assert.strictEqual(fixEncodingString(null), null);
    assert.strictEqual(fixEncodingString(undefined), null);
  });

  it("should return empty string unchanged", () => {
    assert.strictEqual(fixEncodingString(""), "");
  });

  it("should not change clean strings", () => {
    const clean = "Hello World";
    assert.strictEqual(fixEncodingString(clean), clean);

    const germanClean = "M\u00FCller Elektro GmbH"; // Müller
    assert.strictEqual(fixEncodingString(germanClean), germanClean);

    const frenchClean = "Caf\u00E9 Ren\u00E9"; // Café René
    assert.strictEqual(fixEncodingString(frenchClean), frenchClean);
  });

  // ========== German umlauts ==========
  it("should fix lowercase German umlauts", () => {
    // Ã¤ → ä
    assert.strictEqual(fixEncodingString("\u00C3\u00A4"), "\u00E4");
    // Ã¶ → ö
    assert.strictEqual(fixEncodingString("\u00C3\u00B6"), "\u00F6");
    // Ã¼ → ü
    assert.strictEqual(fixEncodingString("\u00C3\u00BC"), "\u00FC");
    // MÃ¼ller → Müller
    assert.strictEqual(fixEncodingString("M\u00C3\u00BCller"), "M\u00FCller");
    // KÃ¶ln → Köln
    assert.strictEqual(fixEncodingString("K\u00C3\u00B6ln"), "K\u00F6ln");
    // BÃ¤ckerei → Bäckerei
    assert.strictEqual(fixEncodingString("B\u00C3\u00A4ckerei"), "B\u00E4ckerei");
  });

  it("should fix uppercase German umlauts", () => {
    // Ã„ → Ä
    assert.strictEqual(fixEncodingString("\u00C3\u201E"), "\u00C4");
    // Ã– → Ö
    assert.strictEqual(fixEncodingString("\u00C3\u2013"), "\u00D6");
    // Ãœ → Ü
    assert.strictEqual(fixEncodingString("\u00C3\u0153"), "\u00DC");
  });

  it("should fix eszett", () => {
    // ÃŸ → ß
    assert.strictEqual(fixEncodingString("\u00C3\u0178"), "\u00DF");
    // StraÃŸe → Straße
    assert.strictEqual(fixEncodingString("Stra\u00C3\u0178e"), "Stra\u00DFe");
  });

  // ========== French/Spanish/etc accents ==========
  it("should fix common accented characters", () => {
    // Ã© → é
    assert.strictEqual(fixEncodingString("\u00C3\u00A9"), "\u00E9");
    // Ã¨ → è
    assert.strictEqual(fixEncodingString("\u00C3\u00A8"), "\u00E8");
    // Ã  → à
    assert.strictEqual(fixEncodingString("\u00C3\u00A0"), "\u00E0");
    // Ã§ → ç
    assert.strictEqual(fixEncodingString("\u00C3\u00A7"), "\u00E7");
  });

  // ========== Symbols ==========
  it("should fix common symbols", () => {
    // Â© → ©
    assert.strictEqual(fixEncodingString("\u00C2\u00A9"), "\u00A9");
    // Â® → ®
    assert.strictEqual(fixEncodingString("\u00C2\u00AE"), "\u00AE");
    // Â° → °
    assert.strictEqual(fixEncodingString("\u00C2\u00B0"), "\u00B0");
    // Â§ → §
    assert.strictEqual(fixEncodingString("\u00C2\u00A7"), "\u00A7");
    // Â£ → £
    assert.strictEqual(fixEncodingString("\u00C2\u00A3"), "\u00A3");
  });

  it("should fix fractions", () => {
    // Â½ → ½
    assert.strictEqual(fixEncodingString("\u00C2\u00BD"), "\u00BD");
    // Â¼ → ¼
    assert.strictEqual(fixEncodingString("\u00C2\u00BC"), "\u00BC");
    // Â¾ → ¾
    assert.strictEqual(fixEncodingString("\u00C2\u00BE"), "\u00BE");
  });

  // ========== Real-world examples ==========
  it("should fix real company names", () => {
    // MÃ¼ller & SÃ¶hne GmbH → Müller & Söhne GmbH
    const input1 = "M\u00C3\u00BCller & S\u00C3\u00B6hne GmbH";
    const expected1 = "M\u00FCller & S\u00F6hne GmbH";
    assert.strictEqual(fixEncodingString(input1), expected1);

    // BÃ¤ckerei ZÃ¼rich → Bäckerei Zürich
    const input2 = "B\u00C3\u00A4ckerei Z\u00C3\u00BCrich";
    const expected2 = "B\u00E4ckerei Z\u00FCrich";
    assert.strictEqual(fixEncodingString(input2), expected2);
  });

  it("should fix addresses", () => {
    // BahnhofstraÃŸe 123 → Bahnhofstraße 123
    const input = "Bahnhofstra\u00C3\u0178e 123";
    const expected = "Bahnhofstra\u00DFe 123";
    assert.strictEqual(fixEncodingString(input), expected);
  });

  it("should handle multiple encoding issues in one string", () => {
    // MÃ¼ller BÃ¤ckerei ZÃ¼rich → Müller Bäckerei Zürich
    const input = "M\u00C3\u00BCller B\u00C3\u00A4ckerei Z\u00C3\u00BCrich";
    const expected = "M\u00FCller B\u00E4ckerei Z\u00FCrich";
    assert.strictEqual(fixEncodingString(input), expected);
  });
});

describe("hasEncodingIssues", () => {
  it("should return false for null/undefined", () => {
    assert.strictEqual(hasEncodingIssues(null), false);
    assert.strictEqual(hasEncodingIssues(undefined), false);
  });

  it("should return false for clean strings", () => {
    assert.strictEqual(hasEncodingIssues("Hello World"), false);
    assert.strictEqual(hasEncodingIssues("M\u00FCller"), false); // Müller
    assert.strictEqual(hasEncodingIssues("Z\u00FCrich"), false); // Zürich
  });

  it("should return true for mojibake strings", () => {
    // MÃ¼ller has mojibake
    assert.strictEqual(hasEncodingIssues("M\u00C3\u00BCller"), true);
    // ZÃ¼rich has mojibake
    assert.strictEqual(hasEncodingIssues("Z\u00C3\u00BCrich"), true);
    // Â© has mojibake
    assert.strictEqual(hasEncodingIssues("\u00C2\u00A9"), true);
    // Plain text "Ã¼" (as it appears in database)
    assert.strictEqual(hasEncodingIssues("ZÃ¼ger"), true);
    assert.strictEqual(hasEncodingIssues("wiwÃ¼ GmbH"), true);
  });
});

describe("fixContactEncoding", () => {
  it("should return null if no fixes needed", () => {
    const contact = {
      company_name: "M\u00FCller GmbH", // Müller
      contact_name: "Hans M\u00FCller",
      street: "Bahnhofstra\u00DFe 1", // ß
      city: "Z\u00FCrich", // ü
    };
    assert.strictEqual(fixContactEncoding(contact), null);
  });

  it("should fix all affected fields", () => {
    const contact = {
      company_name: "M\u00C3\u00BCller GmbH", // MÃ¼ller
      contact_name: "Hans M\u00C3\u00BCller",
      street: "Bahnhofstra\u00C3\u0178e 1", // ÃŸ
      city: "Z\u00C3\u00BCrich",
    };
    const result = fixContactEncoding(contact);
    assert.deepStrictEqual(result, {
      company_name: "M\u00FCller GmbH",
      contact_name: "Hans M\u00FCller",
      street: "Bahnhofstra\u00DFe 1",
      city: "Z\u00FCrich",
    });
  });

  it("should only return changed fields", () => {
    const contact = {
      company_name: "M\u00C3\u00BCller GmbH", // has mojibake
      contact_name: "Hans Schmidt", // no encoding issue
      street: null,
      city: "Z\u00FCrich", // already correct (clean ü)
    };
    const result = fixContactEncoding(contact);
    assert.deepStrictEqual(result, {
      company_name: "M\u00FCller GmbH",
    });
  });
});

describe("fixObjectEncoding", () => {
  it("should fix specified fields in any object", () => {
    const obj = {
      first_name: "Ren\u00C3\u00A9", // RenÃ©
      last_name: "M\u00C3\u00BCller", // MÃ¼ller
      role: "Gesch\u00C3\u00A4ftsf\u00C3\u00BChrer", // GeschÃ¤ftsfÃ¼hrer
      id: 123,
    };
    const result = fixObjectEncoding(obj, ["first_name", "last_name", "role"]);
    assert.deepStrictEqual(result, {
      first_name: "Ren\u00E9", // René
      last_name: "M\u00FCller", // Müller
      role: "Gesch\u00E4ftsf\u00FChrer", // Geschäftsführer
    });
  });

  it("should return null if no fixes needed", () => {
    const obj = {
      first_name: "Ren\u00E9", // clean René
      last_name: "M\u00FCller", // clean Müller
    };
    const result = fixObjectEncoding(obj, ["first_name", "last_name"]);
    assert.strictEqual(result, null);
  });
});

describe("normalizeCompanyName", () => {
  it("should return empty string for null/undefined", () => {
    assert.strictEqual(normalizeCompanyName(null), "");
    assert.strictEqual(normalizeCompanyName(undefined), "");
  });

  it("should fix encoding and normalize", () => {
    // MÃ¼ller GmbH → müller gmbh
    assert.strictEqual(
      normalizeCompanyName("M\u00C3\u00BCller GmbH"),
      "m\u00FCller gmbh"
    );
    // MÜLLER GMBH → müller gmbh
    assert.strictEqual(
      normalizeCompanyName("M\u00DCLLER GMBH"),
      "m\u00FCller gmbh"
    );
    // Extra whitespace
    assert.strictEqual(
      normalizeCompanyName("  M\u00FCller   GmbH  "),
      "m\u00FCller gmbh"
    );
  });

  it("should produce same result for equivalent names", () => {
    const name1 = normalizeCompanyName("M\u00C3\u00BCller GmbH"); // mojibake
    const name2 = normalizeCompanyName("M\u00FCller GmbH"); // clean
    const name3 = normalizeCompanyName("  m\u00FCller  gmbh  "); // whitespace
    assert.strictEqual(name1, name2);
    assert.strictEqual(name2, name3);
  });
});

describe("normalizePhone", () => {
  it("should return empty string for null/undefined", () => {
    assert.strictEqual(normalizePhone(null), "");
    assert.strictEqual(normalizePhone(undefined), "");
  });

  it("should strip formatting and keep digits", () => {
    assert.strictEqual(normalizePhone("+41 79 123 45 67"), "41791234567");
    assert.strictEqual(normalizePhone("079 123 45 67"), "0791234567");
    assert.strictEqual(normalizePhone("0041-79-123-45-67"), "41791234567"); // 00 prefix stripped
    assert.strictEqual(normalizePhone("(079) 123-4567"), "0791234567");
  });

  it("should produce same result for equivalent phones", () => {
    const phone1 = normalizePhone("+41 79 123 45 67");
    const phone2 = normalizePhone("0041791234567");
    // Now both should produce the same result
    assert.strictEqual(phone1, phone2);
  });
});
