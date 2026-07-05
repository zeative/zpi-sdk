import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	parseWebhook,
	verifyWebhook,
	WEBHOOK_EVENTS,
	ZpiWebhookVerifyError,
} from "../src/webhooks";

const SECRET = "whsec_test_123";
const EVENT = {
	id: "01J0000000000000000000ULID",
	event: "bulk.completed",
	data: { jobId: "j1", succeeded: 2, total: 2 },
	deliveredAt: "2026-07-05T00:00:00.000Z",
};
const PAYLOAD = JSON.stringify(EVENT);
// Reference vector computed with node:crypto — must match the Web Crypto path.
const SIG = createHmac("sha256", SECRET).update(PAYLOAD).digest("hex");

describe("verifyWebhook", () => {
	it("accepts a valid signature with the sha256= prefix", async () => {
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: `sha256=${SIG}`, secret: SECRET })
		).resolves.toBe(true);
	});

	it("accepts a bare hex signature and uppercase hex", async () => {
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: SIG, secret: SECRET })
		).resolves.toBe(true);
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: SIG.toUpperCase(), secret: SECRET })
		).resolves.toBe(true);
	});

	it("rejects wrong secret, tampered payload, missing signature", async () => {
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: SIG, secret: "other" })
		).resolves.toBe(false);
		await expect(
			verifyWebhook({ payload: PAYLOAD + " ", signature: SIG, secret: SECRET })
		).resolves.toBe(false);
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: null, secret: SECRET })
		).resolves.toBe(false);
		await expect(
			verifyWebhook({ payload: PAYLOAD, signature: "sha256=deadbeef", secret: SECRET })
		).resolves.toBe(false);
	});
});

describe("parseWebhook", () => {
	it("returns the typed envelope on a valid delivery", async () => {
		const ev = await parseWebhook<{ jobId: string }>(PAYLOAD, {
			signature: `sha256=${SIG}`,
			secret: SECRET,
		});
		expect(ev.event).toBe("bulk.completed");
		expect(ev.data.jobId).toBe("j1");
		expect(ev.id).toBe(EVENT.id);
	});

	it("throws ZpiWebhookVerifyError on a bad signature", async () => {
		await expect(
			parseWebhook(PAYLOAD, { signature: "sha256=00", secret: SECRET })
		).rejects.toBeInstanceOf(ZpiWebhookVerifyError);
	});

	it("throws on valid signature over a non-envelope body", async () => {
		const raw = `"just a string"`;
		const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
		await expect(
			parseWebhook(raw, { signature: sig, secret: SECRET })
		).rejects.toBeInstanceOf(ZpiWebhookVerifyError);
	});

	it("event list matches the backend's ALLOWED_EVENTS", () => {
		expect(WEBHOOK_EVENTS).toContain("bulk.completed");
		expect(WEBHOOK_EVENTS).toContain("webhook.test");
		expect(WEBHOOK_EVENTS).toHaveLength(10);
	});
});
