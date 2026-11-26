import { afterEach, describe, expect, it, vi } from "vitest";

import { pey } from "./client";

const ORIGINAL_ENV = {
  PEY_MODE: process.env.PEY_MODE,
  PEY_API_KEY: process.env.PEY_API_KEY,
  SITE_URL: process.env.SITE_URL,
  PEY_RETURN_ORIGIN: process.env.PEY_RETURN_ORIGIN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
});

describe("pey payment link return URLs", () => {
  it("preserves local HTTP SITE_URL for mock payment links", async () => {
    process.env.PEY_MODE = "mock";
    process.env.SITE_URL = "http://localhost:3001/some/path?ignored=1#frag";

    const created = await pey.createPaymentLink({
      amountCents: 10_000,
      currency: "MXN",
      description: "Cozi P2P",
      reference: "ord_123",
      bankAccountId: "ba_1",
      expiresInMinutes: 30,
    });

    expect(created.url).toMatch(/^http:\/\/localhost:3001\/pay\/ord_123\?mock=mock_pl_/);

    const fetched = await pey.getPaymentLink("mock_pl_abc");
    expect(fetched.url).toBe("http://localhost:3001/pay/mock_pl_abc");
  });

  it("uses strict HTTPS origin for live Pey payment links and falls back from HTTP or malformed values", async () => {
    process.env.PEY_MODE = "live";
    process.env.PEY_API_KEY = "test_key";

    const bodies: Array<{ successUrl: string; backUrl: string }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const parsed: unknown = JSON.parse(String(init?.body ?? "{}"));

        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "successUrl" in parsed &&
          "backUrl" in parsed &&
          typeof parsed.successUrl === "string" &&
          typeof parsed.backUrl === "string"
        ) {
          bodies.push({ successUrl: parsed.successUrl, backUrl: parsed.backUrl });
        }

        return new Response(
          JSON.stringify({
            id: "01TESTLINK",
            url: "https://app.mipey.mx/payment-link/01TESTLINK",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const cases: Array<{ siteUrl?: string; peyReturnOrigin?: string; expected: string }> = [
      { siteUrl: "http://localhost:3001", expected: "https://cozi.app/order/ord_1" },
      { siteUrl: "https://", expected: "https://cozi.app/order/ord_1" },
      { siteUrl: "https:cozi.example", expected: "https://cozi.app/order/ord_1" },
      { siteUrl: "https://user:pass@cozi.mx", expected: "https://cozi.app/order/ord_1" },
      { siteUrl: "https://cozi.mx///", expected: "https://cozi.mx/order/ord_1" },
      { siteUrl: "https://cozi.mx/sub?a=1#hash", expected: "https://cozi.mx/order/ord_1" },
      {
        siteUrl: "http://localhost:3001",
        peyReturnOrigin: "https://pay.cozi.mx/",
        expected: "https://pay.cozi.mx/order/ord_1",
      },
      {
        siteUrl: "https://cozi.mx",
        peyReturnOrigin: "https:malformed.example",
        expected: "https://cozi.mx/order/ord_1",
      },
    ];

    for (const testCase of cases) {
      if (testCase.siteUrl === undefined) {
        delete process.env.SITE_URL;
      } else {
        process.env.SITE_URL = testCase.siteUrl;
      }

      if (testCase.peyReturnOrigin === undefined) {
        delete process.env.PEY_RETURN_ORIGIN;
      } else {
        process.env.PEY_RETURN_ORIGIN = testCase.peyReturnOrigin;
      }

      bodies.length = 0;

      await pey.createPaymentLink({
        amountCents: 10_000,
        currency: "MXN",
        description: "Cozi P2P",
        reference: "ord_1",
        bankAccountId: "ba_1",
      });

      expect(bodies).toEqual([{ successUrl: testCase.expected, backUrl: testCase.expected }]);
    }
  });
});
