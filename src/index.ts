// Universal core entry. Feature code (run(), typed errors, retry, streaming) lands in Phase 2.
export const VERSION = "0.0.0" as const;

export interface ZpiClientOptions {
	apiKey: string;
	baseURL?: string;
}
