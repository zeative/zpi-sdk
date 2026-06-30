// catalog.* — no-auth public discovery over the SAME core/http seam. All routes
// live OUTSIDE /v1 and use the {content,message,errors} envelope (unwrapped via
// requestContent). Web-standard only (no node built-ins — dist-scan enforces it).
import type { ResolvedConfig } from "../core/config";
import { requestContent } from "../core/http";

// --- FROZEN codegen data source (CAT-03) — Phase-6 codegen reads these. ---
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  example?: unknown;
  enumValues?: unknown[];
  in?: string;
}

export interface EndpointSchema {
  fields: SchemaField[];
}

// --- Catalog response shapes (structural mirror of BE; no invented fields). ---
export interface CatalogListItem {
  id: string;
  slug: string;
  category: string;
  displayName: string;
  description: string | null;
  tags: string[];
  iconUrl: string | null;
  endpointCount: number;
  totalRequests: number;
  maxCacheTtl: number;
  minPlan: string | null;
  hasBulk: boolean;
  hasGatedEndpoint: boolean;
}

export interface CatalogList {
  items: CatalogListItem[];
  nextCursor: string | null;
  total: number;
}

export interface ScraperEndpoint {
  id: string;
  slug: string;
  displayName: string | null;
  description: string | null;
  method: string;
  paramsSchema: unknown;
  cacheTtl: number | null;
  pathTemplate: string | null;
  exampleResponse: unknown;
  requestCount: number | null;
  lastRequestAt: string | null;
  enabled: boolean;
  minPlan: string | null;
  bulkEnabled: boolean;
}

export interface ScraperDetail {
  id: string;
  slug: string;
  category: string;
  displayName: string;
  description: string | null;
  tags: string[];
  iconUrl: string | null;
  iconUrlPng: string | null;
  enabled: boolean;
  minPlan: string | null;
  createdAt?: string;
  updatedAt?: string;
  endpoints: ScraperEndpoint[];
}

export interface Category {
  slug: string;
  displayName: string;
  iconUrl: string | null;
  color: string | null;
  description: string | null;
}

export interface CatalogListOpts {
  q?: string;
  cat?: string;
  cursor?: string;
  limit?: number;
}

export interface Catalog {
  list(opts?: CatalogListOpts): Promise<CatalogList>;
  get(slug: string): Promise<ScraperDetail>;
  categories(): Promise<Category[]>;
  schema(slug: string, endpoint: string): Promise<EndpointSchema>;
  stats(slug: string): Promise<{ requests: number; successRate: number }>;
}

export function createCatalog(config: ResolvedConfig): Catalog {
  const base = config.baseURL.replace(/\/+$/, "");
  const enc = encodeURIComponent;

  return {
    list(opts) {
      return requestContent<CatalogList>(config, {
        url: `${base}/api/scrapers/list`,
        params: opts as Record<string, unknown> | undefined,
      });
    },
    get(slug) {
      return requestContent<ScraperDetail>(config, {
        url: `${base}/api/scrapers/${enc(slug)}`,
      });
    },
    categories() {
      return requestContent<Category[]>(config, {
        url: `${base}/api/public/categories`,
      });
    },
    schema(slug, endpoint) {
      return requestContent<EndpointSchema>(config, {
        url: `${base}/api/public/scrapers/${enc(slug)}/endpoints/${enc(endpoint)}/schema`,
      });
    },
    stats(slug) {
      return requestContent<{ requests: number; successRate: number }>(config, {
        url: `${base}/api/public/scrapers/${enc(slug)}/stats`,
      });
    },
  };
}
