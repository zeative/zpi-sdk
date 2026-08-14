import { describe, expectTypeOf, it } from "vitest";
import { ZpiClient } from "../src/index";

// Stands in for what `zpi codegen` merges into the SDK once output schemas exist.
declare module "../src/resources/exec" {
  interface ScraperMap {
    "temp-mail:mail-gw": {
      create: {
        params: Record<string, unknown>;
        result: { address: string; durationMinutes: number };
      };
      inbox: {
        params: { address: string };
        result: { address: string; count: number };
      };
    };
  }
}

const client = new ZpiClient({ apiKey: "zpi_test" });

describe("run() result typing", () => {
  it("narrows the result from a merged ScraperMap entry", async () => {
    const mail = await client.run("temp-mail:mail-gw", "create");
    expectTypeOf(mail).toEqualTypeOf<{ address: string; durationMinutes: number }>();
  });

  it("narrows a second endpoint of the same scraper independently", async () => {
    const inbox = await client.run("temp-mail:mail-gw", "inbox", {
      address: "a@b.com",
    });
    expectTypeOf(inbox).toEqualTypeOf<{ address: string; count: number }>();
  });

  it("still narrows params from the same entry", async () => {
    expectTypeOf(client.run<"temp-mail:mail-gw", "inbox">)
      .parameter(2)
      .toEqualTypeOf<{ address: string } | undefined>();
  });

  it("falls back to unknown for a scraper with no merged entry", async () => {
    const other = await client.run("finance:goldprice", "latest");
    expectTypeOf(other).toEqualTypeOf<unknown>();
  });

  it("lets an explicit annotation still win, for endpoints codegen cannot describe", async () => {
    const typed: { custom: boolean } = await client.run("finance:goldprice", "latest");
    expectTypeOf(typed).toEqualTypeOf<{ custom: boolean }>();
  });
});
