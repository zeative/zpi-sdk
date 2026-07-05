// Incoming-webhook verification for Zapi webhooks. Web-standard only
// (crypto.subtle) so it runs on Node ≥20, Bun, Deno, browsers, and edge workers.
//
// The backend signs every delivery as
//   X-Zpi-Signature: sha256=<hex(hmac_sha256(secret, rawBody))>
// and names the event in X-Zpi-Event. The body envelope is
//   { id, event, data, deliveredAt }.
import { ZpiWebhookVerifyError } from "../core/errors";

export const WEBHOOK_EVENTS = [
  "bulk.completed",
  "bulk.failed",
  "bulk.item",
  "key.created",
  "key.deleted",
  "key.disabled",
  "quota.exceeded",
  "quota.warning",
  "request.error",
  "webhook.test",
] as const;

export type ZpiWebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export interface ZpiWebhookEvent<T = Record<string, unknown>> {
  id: string;
  // Known names autocomplete; unknown future events still parse.
  event: ZpiWebhookEventName | (string & {});
  data: T;
  deliveredAt: string;
}

export interface VerifyWebhookOpts {
  /** Raw request body EXACTLY as received — do not JSON.parse before verifying. */
  payload: string;
  /** Value of the X-Zpi-Signature header ("sha256=<hex>" or bare hex). */
  signature: string | null | undefined;
  /** The webhook's secret (shown once at creation in the dashboard). */
  secret: string;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  let hex = "";
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// Constant-time comparison — never early-exits on the first mismatching char.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the signature matches the payload. Never throws on bad input. */
export async function verifyWebhook(opts: VerifyWebhookOpts): Promise<boolean> {
  if (!opts.signature || !opts.secret) return false;
  const given = opts.signature.startsWith("sha256=")
    ? opts.signature.slice(7)
    : opts.signature;
  const expected = await hmacSha256Hex(opts.secret, opts.payload);
  return timingSafeEqual(given.toLowerCase(), expected);
}

/**
 * Verify AND parse in one step — the recommended entry point for handlers.
 * Throws ZpiWebhookVerifyError on a bad signature or malformed envelope.
 */
export async function parseWebhook<T = Record<string, unknown>>(
  payload: string,
  opts: { signature: string | null | undefined; secret: string }
): Promise<ZpiWebhookEvent<T>> {
  const valid = await verifyWebhook({
    payload,
    signature: opts.signature,
    secret: opts.secret,
  });
  if (!valid) throw new ZpiWebhookVerifyError("Invalid webhook signature");

  let body: unknown;
  try {
    body = JSON.parse(payload);
  } catch {
    throw new ZpiWebhookVerifyError("Webhook payload is not valid JSON");
  }
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { event?: unknown }).event !== "string"
  ) {
    throw new ZpiWebhookVerifyError("Webhook payload has no event field");
  }
  return body as ZpiWebhookEvent<T>;
}
