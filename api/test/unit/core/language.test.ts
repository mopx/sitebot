import { describe, expect, it } from "vitest";
import { resolveLocale } from "../../../src/core/language.js";

const supportedLocales = ["en", "es", "zh"] as const;

describe("resolveLocale", () => {
  it("prefers the explicit hint over everything else", () => {
    expect(
      resolveLocale({
        hint: "es",
        persisted: "zh",
        supportedLocales: [...supportedLocales],
        defaultLocale: "en",
      }),
    ).toBe("es");
  });

  it("falls back to the persisted locale when no hint is given", () => {
    expect(
      resolveLocale({
        persisted: "zh",
        supportedLocales: [...supportedLocales],
        defaultLocale: "en",
      }),
    ).toBe("zh");
  });

  it("falls back to the tenant default when neither hint nor persisted locale is set", () => {
    expect(resolveLocale({ supportedLocales: [...supportedLocales], defaultLocale: "en" })).toBe(
      "en",
    );
  });

  it("ignores a hint that isn't in the tenant's supported locales", () => {
    expect(
      resolveLocale({
        hint: "zh",
        supportedLocales: ["en", "es"],
        defaultLocale: "en",
      }),
    ).toBe("en");
  });

  it("ignores a persisted locale that isn't in the tenant's supported locales (e.g. after a config change)", () => {
    expect(
      resolveLocale({ persisted: "zh", supportedLocales: ["en", "es"], defaultLocale: "en" }),
    ).toBe("en");
  });
});
