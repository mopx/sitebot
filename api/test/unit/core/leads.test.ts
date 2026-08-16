import { describe, expect, it } from "vitest";
import { parseCapturedLead } from "../../../src/core/leads.js";

describe("parseCapturedLead", () => {
  it("accepts a lead with name, project description, and an email", () => {
    const lead = parseCapturedLead({
      name: "Maria",
      email: "maria@example.com",
      projectDescription: "Needs a marketing site.",
    });
    expect(lead).toEqual({
      name: "Maria",
      email: "maria@example.com",
      projectDescription: "Needs a marketing site.",
    });
  });

  it("accepts a lead with a phone instead of an email", () => {
    const lead = parseCapturedLead({
      name: "Maria",
      phone: "+1 555 0100",
      projectDescription: "Needs a marketing site.",
      budget: "$5k-10k",
    });
    expect(lead).toMatchObject({ phone: "+1 555 0100", budget: "$5k-10k" });
  });

  it("rejects a lead with neither email nor phone", () => {
    expect(
      parseCapturedLead({ name: "Maria", projectDescription: "Needs a marketing site." }),
    ).toBeNull();
  });

  it("rejects a lead missing a name", () => {
    expect(
      parseCapturedLead({ email: "maria@example.com", projectDescription: "Needs a site." }),
    ).toBeNull();
  });

  it("rejects a lead missing a project description", () => {
    expect(parseCapturedLead({ name: "Maria", email: "maria@example.com" })).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    expect(parseCapturedLead(null)).toBeNull();
    expect(parseCapturedLead("not an object")).toBeNull();
    expect(parseCapturedLead(undefined)).toBeNull();
  });
});
