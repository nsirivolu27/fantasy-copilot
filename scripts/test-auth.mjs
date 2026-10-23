// Account rules. Run: node --experimental-strip-types scripts/test-auth.mjs
import assert from "node:assert/strict";
import {
  normalizeEmail, validateEmail, validatePassword, validateDisplayName,
  canSignUp, constantTimeEqual, sessionExpiry, isExpired, SESSION_DAYS,
} from "../src/lib/core/auth.ts";

let passed = 0;
const test = (n, fn) => { fn(); passed++; console.log(`  ok  ${n}`); };

console.log("\nAccounts\n");

test("emails are compared normalized", () => {
  assert.equal(normalizeEmail("  Nihal@Example.COM "), "nihal@example.com");
});

test("obvious non-emails are rejected, ordinary ones accepted", () => {
  assert.ok(validateEmail("a@b.co").ok);
  assert.ok(validateEmail("first.last+tag@sub.domain.org").ok);
  assert.ok(!validateEmail("").ok);
  assert.ok(!validateEmail("nihal").ok);
  assert.ok(!validateEmail("nihal@localhost").ok);
  assert.ok(!validateEmail("a b@c.com").ok);
});

test("passwords need length, not symbol theatre", () => {
  assert.ok(validatePassword("correct horse battery").ok, "a long passphrase is fine");
  assert.ok(!validatePassword("Sh0rt!").ok, "six characters is not enough");
  assert.ok(!validatePassword("").ok);
});

test("the most common passwords are refused", () => {
  // Short ones fail on length; the list catches anything that clears it.
  for (const bad of ["qwerty123", "password", "letmein", "iloveyou", "passw0rd"]) {
    assert.ok(!validatePassword(bad).ok, `${bad} must be rejected`);
  }
  // Case does not help.
  assert.ok(!validatePassword("PassWord").ok);
});

test("a single repeated character is not a password", () => {
  assert.ok(!validatePassword("aaaaaaaaaaaaaa").ok);
});

test("a password containing the email local part is refused", () => {
  const r = validatePassword("nihalnihalnihal", "nihal@example.com");
  assert.ok(!r.ok);
  assert.match(r.error, /email address in your password/i);
});

test("a short local part does not trigger the email check", () => {
  assert.ok(validatePassword("abquickbrownfox", "ab@example.com").ok);
});

test("display names are optional but bounded", () => {
  assert.ok(validateDisplayName("").ok);
  assert.ok(validateDisplayName("Nihal").ok);
  assert.ok(!validateDisplayName("x".repeat(61)).ok);
  assert.ok(!validateDisplayName("<script>").ok);
});

test("errors are written for a person, not a log", () => {
  const r = validatePassword("short");
  assert.ok(r.error.length > 15);
  assert.ok(!/regex|validation failed|invalid input/i.test(r.error));
});

// ── Who may sign up ──────────────────────────────────────────────────────────

test("the very first account always succeeds, so a deployment can be claimed", () => {
  assert.ok(canSignUp({ existingUsers: 0, signupsOpen: false }).ok);
});

test("signups are closed by default once an owner exists", () => {
  const r = canSignUp({ existingUsers: 1, signupsOpen: false });
  assert.ok(!r.ok, "an app hosted for a league must not accept strangers by default");
  assert.match(r.error, /closed/i);
});

test("an operator can open signups", () => {
  assert.ok(canSignUp({ existingUsers: 5, signupsOpen: true }).ok);
});

test("an invite code lets specific people in", () => {
  const base = { existingUsers: 3, signupsOpen: false, inviteCode: "league-2026" };
  assert.ok(canSignUp({ ...base, suppliedCode: "league-2026" }).ok);
  assert.ok(!canSignUp({ ...base, suppliedCode: "wrong" }).ok);
  assert.match(canSignUp({ ...base, suppliedCode: "" }).error, /invite code/i);
});

test("code comparison does not leak length by timing", () => {
  assert.ok(constantTimeEqual("abc", "abc"));
  assert.ok(!constantTimeEqual("abc", "abd"));
  assert.ok(!constantTimeEqual("abc", "abcdef"));
  assert.ok(!constantTimeEqual("", "a"));
  assert.ok(constantTimeEqual("", ""));
});

// ── Sessions ─────────────────────────────────────────────────────────────────

test("sessions expire, and the window is the documented one", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  const expiry = sessionExpiry(now);
  assert.equal(Math.round((expiry.getTime() - now.getTime()) / 86400000), SESSION_DAYS);
  assert.ok(!isExpired(expiry, now));
  assert.ok(isExpired(expiry, new Date(expiry.getTime() + 1)));
  assert.ok(isExpired(now, now), "an expiry exactly now counts as expired");
});

console.log(`\n${passed} passing\n`);
