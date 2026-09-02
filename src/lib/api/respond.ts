import { NextResponse } from "next/server";
import type { AuthResult } from "./auth";

/**
 * One response shape for the whole public API, so clients can write a single
 * error handler. Every error names what went wrong and what to do about it.
 */
export const API_VERSION = "v1";

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, version: API_VERSION, data, ...(meta ? { meta } : {}) });
}

export function fail(error: string, status = 400, hint?: string) {
  return NextResponse.json({ ok: false, version: API_VERSION, error, ...(hint ? { hint } : {}) }, { status });
}

export function unauthorized(auth: AuthResult) {
  return fail(
    auth.error ?? "Unauthorized.",
    auth.status ?? 401,
    "Send Authorization: Bearer <key>. Create a key in Settings → Integrations.",
  );
}
