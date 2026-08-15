import { describe, expect, it } from "vitest";
import { timingSafeEqual } from "../../../src/lib/timingSafe.js";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("hello-world", "hello-world")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("hello-world", "hello-worlx")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqual("short", "a-lot-longer-string")).toBe(false);
  });

  it("returns false comparing against an empty string", () => {
    expect(timingSafeEqual("nonempty", "")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
