/**
 * WhatsApp Integration Tests
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";

// Import the functions we want to test
import { normalizePhoneNumber, isWithinMessageWindow } from "../src/lib/whatsapp/client";
import { mapMessageType } from "../src/lib/whatsapp/webhook-types";

describe("WhatsApp Client", () => {
  describe("normalizePhoneNumber", () => {
    it("should normalize Swiss mobile number with +41", () => {
      const result = normalizePhoneNumber("+41 79 123 45 67");
      assert.strictEqual(result, "41791234567");
    });

    it("should normalize Swiss mobile number starting with 0", () => {
      const result = normalizePhoneNumber("079 123 45 67");
      assert.strictEqual(result, "41791234567");
    });

    it("should normalize number with country code", () => {
      const result = normalizePhoneNumber("41791234567");
      assert.strictEqual(result, "41791234567");
    });

    it("should remove all non-digit characters", () => {
      const result = normalizePhoneNumber("+41 (79) 123-45-67");
      assert.strictEqual(result, "41791234567");
    });

    it("should handle German number", () => {
      const result = normalizePhoneNumber("+49 171 1234567");
      assert.strictEqual(result, "491711234567");
    });
  });

  describe("isWithinMessageWindow", () => {
    it("should return false if no last customer message", () => {
      const result = isWithinMessageWindow(null);
      assert.strictEqual(result, false);
    });

    it("should return true if message is within 24 hours", () => {
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      const result = isWithinMessageWindow(recentDate);
      assert.strictEqual(result, true);
    });

    it("should return false if message is older than 24 hours", () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const result = isWithinMessageWindow(oldDate);
      assert.strictEqual(result, false);
    });

    it("should return true if message is exactly 23 hours ago", () => {
      const date = new Date(Date.now() - 23 * 60 * 60 * 1000);
      const result = isWithinMessageWindow(date);
      assert.strictEqual(result, true);
    });
  });
});

describe("WhatsApp Webhook Types", () => {
  describe("mapMessageType", () => {
    it("should map text to text", () => {
      assert.strictEqual(mapMessageType("text"), "text");
    });

    it("should map image to image", () => {
      assert.strictEqual(mapMessageType("image"), "image");
    });

    it("should map document to document", () => {
      assert.strictEqual(mapMessageType("document"), "document");
    });

    it("should map audio to audio", () => {
      assert.strictEqual(mapMessageType("audio"), "audio");
    });

    it("should map video to video", () => {
      assert.strictEqual(mapMessageType("video"), "video");
    });

    it("should map sticker to sticker", () => {
      assert.strictEqual(mapMessageType("sticker"), "sticker");
    });

    it("should map location to location", () => {
      assert.strictEqual(mapMessageType("location"), "location");
    });

    it("should map contacts to contacts", () => {
      assert.strictEqual(mapMessageType("contacts"), "contacts");
    });

    it("should map interactive to interactive", () => {
      assert.strictEqual(mapMessageType("interactive"), "interactive");
    });

    it("should map button to interactive", () => {
      assert.strictEqual(mapMessageType("button"), "interactive");
    });

    it("should map reaction to reaction", () => {
      assert.strictEqual(mapMessageType("reaction"), "reaction");
    });

    it("should map unknown types to unknown", () => {
      assert.strictEqual(mapMessageType("order"), "unknown");
      assert.strictEqual(mapMessageType("system"), "unknown");
      assert.strictEqual(mapMessageType("unknown"), "unknown");
    });
  });
});

// Webhook payload validation tests
describe("WhatsApp Webhook Payload", () => {
  const validPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+41791234567",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              contacts: [
                {
                  profile: { name: "Test User" },
                  wa_id: "41791234567",
                },
              ],
              messages: [
                {
                  from: "41791234567",
                  id: "wamid.test123",
                  timestamp: "1234567890",
                  type: "text",
                  text: { body: "Hello World" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  it("should have correct object type", () => {
    assert.strictEqual(validPayload.object, "whatsapp_business_account");
  });

  it("should have entry array", () => {
    assert.ok(Array.isArray(validPayload.entry));
    assert.strictEqual(validPayload.entry.length, 1);
  });

  it("should have changes array in entry", () => {
    const entry = validPayload.entry[0];
    assert.ok(Array.isArray(entry.changes));
    assert.strictEqual(entry.changes.length, 1);
  });

  it("should have value object with metadata", () => {
    const value = validPayload.entry[0].changes[0].value;
    assert.ok(value.metadata);
    assert.strictEqual(value.metadata.phone_number_id, "PHONE_NUMBER_ID");
  });

  it("should have contacts array", () => {
    const value = validPayload.entry[0].changes[0].value;
    assert.ok(Array.isArray(value.contacts));
    assert.strictEqual(value.contacts[0].wa_id, "41791234567");
  });

  it("should have messages array", () => {
    const value = validPayload.entry[0].changes[0].value;
    assert.ok(Array.isArray(value.messages));
    assert.strictEqual(value.messages[0].type, "text");
    assert.strictEqual(value.messages[0].text?.body, "Hello World");
  });
});

// Status webhook tests
describe("WhatsApp Status Webhook", () => {
  const statusPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+41791234567",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              statuses: [
                {
                  id: "wamid.test123",
                  status: "delivered",
                  timestamp: "1234567890",
                  recipient_id: "41791234567",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };

  it("should have statuses array", () => {
    const value = statusPayload.entry[0].changes[0].value;
    assert.ok(Array.isArray(value.statuses));
    assert.strictEqual(value.statuses.length, 1);
  });

  it("should have correct status structure", () => {
    const status = statusPayload.entry[0].changes[0].value.statuses[0];
    assert.strictEqual(status.id, "wamid.test123");
    assert.strictEqual(status.status, "delivered");
    assert.strictEqual(status.recipient_id, "41791234567");
  });
});

