import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkUnique } from "../src/lib/utils/chunk";

test("chunkUnique deduplicates, trims, and filters falsy", () => {
  const batches = chunkUnique(["a", " a ", "b", "", undefined, null, "b"]);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ["a", "b"]);
});

test("chunkUnique honors batch size and preserves order of first occurrences", () => {
  const input = ["c1", "c2", "c3", "c4", "c5"];
  const batches = chunkUnique(input, 2);
  assert.deepEqual(batches, [
    ["c1", "c2"],
    ["c3", "c4"],
    ["c5"],
  ]);
});

test("chunkUnique enforces minimum batch size of 1", () => {
  const batches = chunkUnique(["x", "y"], 0);
  assert.deepEqual(batches, [["x"], ["y"]]);
});
