import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + database check for platform health probes.
 * Deliberately exempt from the APP_PASSWORD gate (see src/middleware.ts).
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const leagues = await prisma.league.count();
    return NextResponse.json({
      ok: true,
      database: "connected",
      leagues,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    // Report the failure without leaking the connection string.
    const message = err instanceof Error ? err.message.split("\n")[0] : "unknown";
    console.error("[health] database check failed:", message);
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}
