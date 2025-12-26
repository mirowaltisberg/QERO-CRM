import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getCoreRoleName,
  rolesMatch,
  findBestMatchingRole,
} from "../src/lib/tma/role-match";

describe("getCoreRoleName", () => {
  it("removes EFZ suffix", () => {
    assert.strictEqual(getCoreRoleName("Elektriker EFZ"), "elektriker");
  });

  it("removes multiple suffixes", () => {
    // Note: "Ing." has a period so it's not matched; BSc HF are removed
    assert.strictEqual(getCoreRoleName("Ing BSc Elektriker HF"), "elektriker");
  });

  it("handles words with periods (keeps them)", () => {
    // Period attached to word means it doesn't match IGNORE_WORDS
    assert.strictEqual(getCoreRoleName("Ing. Elektriker"), "ing. elektriker");
  });

  it("handles empty string", () => {
    assert.strictEqual(getCoreRoleName(""), "");
  });

  it("lowercases role name", () => {
    assert.strictEqual(getCoreRoleName("SCHREINER"), "schreiner");
  });

  it("handles multiple words", () => {
    assert.strictEqual(
      getCoreRoleName("Elektro Installateur EFZ"),
      "elektro installateur"
    );
  });
});

describe("rolesMatch", () => {
  it("matches exact same role", () => {
    assert.strictEqual(rolesMatch("Elektriker EFZ", "Elektriker"), true);
  });

  it("matches when position contains role", () => {
    assert.strictEqual(
      rolesMatch("Elektro Installateur EFZ", "Installateur"),
      true
    );
  });

  it("matches when role contains position core name", () => {
    assert.strictEqual(rolesMatch("Schreiner", "Schreiner EFZ"), true);
  });

  it("does not match different roles", () => {
    assert.strictEqual(rolesMatch("Elektriker EFZ", "Schreiner"), false);
  });

  it("returns false for empty strings", () => {
    assert.strictEqual(rolesMatch("", "Elektriker"), false);
    assert.strictEqual(rolesMatch("Elektriker", ""), false);
  });

  it("is case insensitive", () => {
    assert.strictEqual(rolesMatch("ELEKTRIKER", "elektriker"), true);
  });
});

describe("findBestMatchingRole", () => {
  const roles = [
    { id: "1", name: "Elektriker", color: "#FF0000" },
    { id: "2", name: "Elektro Installateur", color: "#00FF00" },
    { id: "3", name: "Schreiner", color: "#0000FF" },
  ];

  it("returns null for null position title", () => {
    assert.strictEqual(findBestMatchingRole(null, roles), null);
  });

  it("returns null when no role matches", () => {
    assert.strictEqual(findBestMatchingRole("Maler EFZ", roles), null);
  });

  it("finds exact match", () => {
    const result = findBestMatchingRole("Schreiner EFZ", roles);
    assert.strictEqual(result?.id, "3");
  });

  it("prefers longer (more specific) role match", () => {
    // "Elektro Installateur EFZ" should match "Elektro Installateur" over "Elektriker"
    const result = findBestMatchingRole("Elektro Installateur EFZ", roles);
    assert.strictEqual(result?.id, "2");
    assert.strictEqual(result?.name, "Elektro Installateur");
  });

  it("returns first matching role when lengths are equal", () => {
    // "Elektriker" matches "Elektriker" role
    const result = findBestMatchingRole("Elektriker EFZ", roles);
    assert.strictEqual(result?.id, "1");
  });

  it("handles empty roles array", () => {
    assert.strictEqual(findBestMatchingRole("Elektriker", []), null);
  });
});

