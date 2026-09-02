import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Outbound webhooks, so the trading app learns about changes instead of
 * polling. Payloads are signed with each subscription's secret, so a receiver
 * can verify the call really came from this app.
 *
 * Delivery is best effort and never blocks the request that triggered it: an
 * unreachable subscriber must not fail a sync.
 */

export type WebhookEvent =
  | "league.synced"
  | "projections.updated"
  | "trade.proposed"
  | "trade.status_changed"
  | "trade_block.updated";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "league.synced",
  "projections.updated",
  "trade.proposed",
  "trade.status_changed",
  "trade_block.updated",
];

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export async function emit(event: WebhookEvent, payload: unknown): Promise<void> {
  let subscriptions;
  try {
    subscriptions = await prisma.webhookSubscription.findMany({ where: { active: true } });
  } catch {
    return; // no table yet, or the DB is down — never break the caller
  }

  const body = JSON.stringify({
    event,
    sentAt: new Date().toISOString(),
    data: payload,
  });

  await Promise.allSettled(
    subscriptions
      .filter((s) => matches(s.eventsJson, event))
      .map(async (sub) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        let status: number | null = null;
        try {
          const res = await fetch(sub.url, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              "x-fantasy-copilot-event": event,
              "x-fantasy-copilot-signature": `sha256=${signPayload(sub.secret, body)}`,
            },
            body,
          });
          status = res.status;
        } catch {
          status = 0;
        } finally {
          clearTimeout(timer);
        }

        const failed = status === null || status === 0 || status >= 400;
        await prisma.webhookSubscription
          .update({
            where: { id: sub.id },
            data: {
              lastStatus: status ?? 0,
              lastAttemptAt: new Date(),
              failureCount: failed ? { increment: 1 } : 0,
              // Stop hammering an endpoint that has been dead for a while.
              active: failed && sub.failureCount >= 19 ? false : sub.active,
            },
          })
          .catch(() => {});
      }),
  );
}

function matches(eventsJson: string, event: WebhookEvent): boolean {
  try {
    const list = JSON.parse(eventsJson);
    return Array.isArray(list) && (list.includes("*") || list.includes(event));
  } catch {
    return false;
  }
}
