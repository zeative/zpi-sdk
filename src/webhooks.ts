// Public `./webhooks` subpath entry — incoming-webhook verification helpers.
// Web-standard crypto only; the lean `.` root never imports this.
export { parseWebhook, verifyWebhook, WEBHOOK_EVENTS } from "./webhooks/verify";
export type {
	VerifyWebhookOpts,
	ZpiWebhookEvent,
	ZpiWebhookEventName,
} from "./webhooks/verify";
export { ZpiWebhookVerifyError } from "./core/errors";
