"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

test("quiz helper accepts only safe six-character codes", () => {
  assert.match("ABC234", /^[A-Z0-9]{6}$/);
  assert.doesNotMatch("abc234!", /^[A-Z0-9]{6}$/);
});
