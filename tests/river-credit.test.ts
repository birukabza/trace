import test from "node:test";
import assert from "node:assert/strict";
import { isRiverCreditResponse } from "../src/lib/server/river";

test("River 402 is treated as exhausted credit", () => {
  assert.equal(isRiverCreditResponse(402, ""), true);
});

test("billing messages on other statuses are treated as exhausted credit", () => {
  assert.equal(isRiverCreditResponse(403, '{"error":{"message":"Insufficient credit balance"}}'), true);
  assert.equal(isRiverCreditResponse(429, '{"error":"You are out of credits. Please top up."}'), true);
});

test("ordinary rate limits and server errors are not credit errors", () => {
  assert.equal(isRiverCreditResponse(429, '{"error":"Rate limit exceeded, retry later"}'), false);
  assert.equal(isRiverCreditResponse(503, "Service unavailable"), false);
  assert.equal(isRiverCreditResponse(500, ""), false);
});
