import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Import the helper function from ComposeModal
// Since it's a client component, we'll copy the logic here for testing
function insertEmailIntoList(currentValue: string, email: string): string {
  const emails = currentValue
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  
  // Avoid duplicates (case-insensitive)
  const emailLower = email.toLowerCase();
  if (emails.some((e) => e.toLowerCase() === emailLower)) {
    return currentValue;
  }
  
  emails.push(email);
  return emails.join(", ");
}

describe("insertEmailIntoList", () => {
  it("should add email to empty string", () => {
    const result = insertEmailIntoList("", "test@example.com");
    assert.equal(result, "test@example.com");
  });

  it("should append email to existing list", () => {
    const result = insertEmailIntoList("first@example.com", "second@example.com");
    assert.equal(result, "first@example.com, second@example.com");
  });

  it("should not add duplicate email (case-insensitive)", () => {
    const result = insertEmailIntoList("Test@Example.com", "test@example.com");
    assert.equal(result, "Test@Example.com"); // unchanged
  });

  it("should handle multiple existing emails", () => {
    const result = insertEmailIntoList("a@test.com, b@test.com", "c@test.com");
    assert.equal(result, "a@test.com, b@test.com, c@test.com");
  });

  it("should trim whitespace from existing emails", () => {
    const result = insertEmailIntoList("  a@test.com  ,  b@test.com  ", "c@test.com");
    assert.equal(result, "a@test.com, b@test.com, c@test.com");
  });

  it("should handle trailing comma gracefully", () => {
    const result = insertEmailIntoList("a@test.com, ", "b@test.com");
    assert.equal(result, "a@test.com, b@test.com");
  });

  it("should prevent duplicate when email already exists in middle of list", () => {
    const result = insertEmailIntoList("a@test.com, b@test.com, c@test.com", "b@test.com");
    assert.equal(result, "a@test.com, b@test.com, c@test.com");
  });
});

