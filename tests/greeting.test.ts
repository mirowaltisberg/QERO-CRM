/**
 * Unit tests for email greeting generation
 * Run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateEmailGreeting, GreetingPerson } from "../src/lib/email/greeting";

describe("generateEmailGreeting", () => {
  describe("male contact person", () => {
    it("returns 'Sehr geehrter Herr <Nachname>,' for male gender", () => {
      const person: GreetingPerson = { first_name: "Hans", last_name: "Müller", gender: "male" };
      const result = generateEmailGreeting(person, "ACME GmbH");
      assert.equal(result, "Sehr geehrter Herr Müller,");
    });

    it("works without first_name", () => {
      const person: GreetingPerson = { last_name: "Schmidt", gender: "male" };
      const result = generateEmailGreeting(person, "Test AG");
      assert.equal(result, "Sehr geehrter Herr Schmidt,");
    });
  });

  describe("female contact person", () => {
    it("returns 'Sehr geehrte Frau <Nachname>,' for female gender", () => {
      const person: GreetingPerson = { first_name: "Anna", last_name: "Weber", gender: "female" };
      const result = generateEmailGreeting(person, "ACME GmbH");
      assert.equal(result, "Sehr geehrte Frau Weber,");
    });

    it("works without first_name", () => {
      const person: GreetingPerson = { last_name: "Fischer", gender: "female" };
      const result = generateEmailGreeting(person, "Test AG");
      assert.equal(result, "Sehr geehrte Frau Fischer,");
    });
  });

  describe("unknown gender fallback", () => {
    it("returns company team greeting when gender is null", () => {
      const person: GreetingPerson = { first_name: "Alex", last_name: "Bauer", gender: null };
      const result = generateEmailGreeting(person, "Elektro AG");
      assert.equal(result, "Sehr geehrtes Elektro AG Team,");
    });

    it("returns company team greeting when gender is undefined", () => {
      const person: GreetingPerson = { last_name: "Bauer" };
      const result = generateEmailGreeting(person, "Elektro AG");
      assert.equal(result, "Sehr geehrtes Elektro AG Team,");
    });

    it("returns company team greeting for unknown gender string", () => {
      const person: GreetingPerson = { first_name: "Alex", last_name: "Bauer", gender: "unknown" };
      const result = generateEmailGreeting(person, "Holz GmbH");
      assert.equal(result, "Sehr geehrtes Holz GmbH Team,");
    });
  });

  describe("no contact person", () => {
    it("returns company team greeting when person is null", () => {
      const result = generateEmailGreeting(null, "Gartenbau AG");
      assert.equal(result, "Sehr geehrtes Gartenbau AG Team,");
    });

    it("returns company team greeting when person is undefined", () => {
      const result = generateEmailGreeting(undefined, "Metallbau GmbH");
      assert.equal(result, "Sehr geehrtes Metallbau GmbH Team,");
    });
  });

  describe("no company name fallback", () => {
    it("returns generic team greeting when both person and company are null", () => {
      const result = generateEmailGreeting(null, null);
      assert.equal(result, "Sehr geehrtes Team,");
    });

    it("returns generic team greeting when company is undefined and person has no gender", () => {
      const person: GreetingPerson = { last_name: "Test" };
      const result = generateEmailGreeting(person, undefined);
      assert.equal(result, "Sehr geehrtes Team,");
    });
  });
});
