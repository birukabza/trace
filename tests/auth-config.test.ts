import test from "node:test";
import assert from "node:assert/strict";
import { authSiteOrigin, safeNextPath } from "../src/lib/supabase/config";

test("auth return paths remain inside the research workspace", () => {
  assert.equal(safeNextPath("/?run=paper-123"), "/?run=paper-123");
  assert.equal(safeNextPath("/research?query=some%20paper#code"), "/research?query=some%20paper#code");
  for (const input of [null, undefined, 123, "", "https://attacker.example/", "//attacker.example/", "/\\attacker.example/", "/path\r\nLocation: https://attacker.example", "/pa\tth", "/auth/callback", "/auth/update-password", "/auth", "/login", "/signup", "/a/../login"]) {
    assert.equal(safeNextPath(input), "/", String(input));
  }
});

test("email links use the configured HTTPS frontend instead of a supplied request origin", () => {
  assert.equal(authSiteOrigin("https://trace.example/research", "https://attacker.example"), "https://trace.example");
  assert.equal(authSiteOrigin("https://trace.example:8443", null), "https://trace.example:8443");
  for (const configured of ["http://trace.example", "javascript:alert(1)", "https://user:password@trace.example", "not-a-url"]) {
    assert.throws(() => authSiteOrigin(configured, "http://localhost:3000"));
  }
});

test("only local development may infer the email redirect origin", () => {
  assert.equal(authSiteOrigin(undefined, "http://localhost:3000"), "http://localhost:3000");
  assert.equal(authSiteOrigin(undefined, "http://127.0.0.1:3000"), "http://127.0.0.1:3000");
  assert.equal(authSiteOrigin(undefined, "http://[::1]:3000"), "http://[::1]:3000");
  for (const origin of [null, "https://attacker.example", "http://localhost.attacker.example", "https://localhost@attacker.example", "file:///localhost", "null"]) {
    assert.throws(() => authSiteOrigin(undefined, origin));
  }
});
