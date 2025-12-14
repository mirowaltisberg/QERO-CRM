/**
 * Unit tests for travel-related helpers
 * Run with: npm test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleMapsDirectionsUrl,
  parseTransportApiDuration,
  formatDurationMinutes,
} from "../src/lib/geo/travel";

describe("parseTransportApiDuration", () => {
  it("parses 47 minutes correctly", () => {
    const result = parseTransportApiDuration("00d00:47:00");
    assert.equal(result, 47 * 60); // 2820 seconds
  });

  it("parses 1 hour 30 minutes correctly", () => {
    const result = parseTransportApiDuration("00d01:30:00");
    assert.equal(result, 90 * 60); // 5400 seconds
  });

  it("parses 1 day 2 hours 15 minutes 30 seconds correctly", () => {
    const result = parseTransportApiDuration("01d02:15:30");
    assert.equal(result, 86400 + 2 * 3600 + 15 * 60 + 30); // 94530 seconds
  });

  it("parses zero duration correctly", () => {
    const result = parseTransportApiDuration("00d00:00:00");
    assert.equal(result, 0);
  });

  it("returns 0 for invalid format", () => {
    const result = parseTransportApiDuration("invalid");
    assert.equal(result, 0);
  });

  it("returns 0 for empty string", () => {
    const result = parseTransportApiDuration("");
    assert.equal(result, 0);
  });
});

describe("buildGoogleMapsDirectionsUrl", () => {
  it("builds driving URL correctly", () => {
    const url = buildGoogleMapsDirectionsUrl({
      fromLat: 47.3769,
      fromLng: 8.5417,
      toLat: 47.0502,
      toLng: 8.3093,
      mode: "driving",
    });
    assert.equal(
      url,
      "https://www.google.com/maps/dir/?api=1&origin=47.3769,8.5417&destination=47.0502,8.3093&travelmode=driving"
    );
  });

  it("builds transit URL correctly", () => {
    const url = buildGoogleMapsDirectionsUrl({
      fromLat: 46.9481,
      fromLng: 7.4474,
      toLat: 47.3769,
      toLng: 8.5417,
      mode: "transit",
    });
    assert.equal(
      url,
      "https://www.google.com/maps/dir/?api=1&origin=46.9481,7.4474&destination=47.3769,8.5417&travelmode=transit"
    );
  });
});

describe("formatDurationMinutes", () => {
  it("formats minutes under 60", () => {
    assert.equal(formatDurationMinutes(45), "45 min");
    assert.equal(formatDurationMinutes(5), "5 min");
    assert.equal(formatDurationMinutes(59), "59 min");
  });

  it("formats exactly 1 hour", () => {
    assert.equal(formatDurationMinutes(60), "1h");
  });

  it("formats hours and minutes", () => {
    assert.equal(formatDurationMinutes(90), "1h 30min");
    assert.equal(formatDurationMinutes(125), "2h 5min");
  });

  it("formats exactly 2 hours", () => {
    assert.equal(formatDurationMinutes(120), "2h");
  });

  it("formats 0 minutes", () => {
    assert.equal(formatDurationMinutes(0), "0 min");
  });
});
