import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineSitebotChatElement, SitebotChatElement } from "../src/element.js";

beforeEach(() => {
  defineSitebotChatElement("sitebot-chat-test");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ reply: "Jorge builds apps.", sources: [], conversationId: "c1" }),
        ),
    ),
  );
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function mount(): SitebotChatElement {
  const el = document.createElement("sitebot-chat-test") as SitebotChatElement;
  el.configure({ apiUrl: "https://bot.example.com" });
  document.body.appendChild(el);
  return el;
}

describe("SitebotChatElement", () => {
  it("renders a launcher button and a hidden panel by default", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".launcher")).not.toBeNull();
    expect((shadow.querySelector(".panel") as HTMLElement).hidden).toBe(true);
  });

  it("opens the panel when the launcher is clicked", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    (shadow.querySelector(".launcher") as HTMLButtonElement).click();
    expect((shadow.querySelector(".panel") as HTMLElement).hidden).toBe(false);
  });

  it("toggles an 'open' class on the host element so mobile full-screen styling can key off it", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    expect(el.classList.contains("open")).toBe(false);
    (shadow.querySelector(".launcher") as HTMLButtonElement).click();
    expect(el.classList.contains("open")).toBe(true);
    (shadow.querySelector(".header button") as HTMLButtonElement).click();
    expect(el.classList.contains("open")).toBe(false);
  });

  it("sends a message on submit and renders the reply", async () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "What does Jorge do?";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".message.assistant")).toHaveLength(1);
    });

    const userMsg = shadow.querySelector(".message.user");
    const assistantMsg = shadow.querySelector(".message.assistant");
    expect(userMsg?.textContent).toBe("What does Jorge do?");
    expect(assistantMsg?.textContent).toBe("Jorge builds apps.");
  });

  it("clears the input after sending", () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "hello";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();
    expect(input.value).toBe("");
  });

  it("updates the composer text when the host page's document.documentElement.lang changes", async () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    expect((shadow.querySelector("input") as HTMLInputElement).placeholder).toBe(
      "Ask a question...",
    );

    document.documentElement.lang = "es";
    // MutationObserver callbacks run as a microtask, not synchronously.
    await vi.waitFor(() => {
      expect((shadow.querySelector("input") as HTMLInputElement).placeholder).toBe(
        "Escribe tu pregunta...",
      );
    });

    document.documentElement.lang = "";
  });

  it("shows a typing indicator while a reply is pending, and removes it once it arrives", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "hello";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelector(".typing")).not.toBeNull();
    });

    resolveFetch(
      new Response(JSON.stringify({ reply: "hi there", sources: [], conversationId: "c1" })),
    );

    await vi.waitFor(() => {
      expect(shadow.querySelector(".typing")).toBeNull();
      expect(shadow.querySelector(".message.assistant")?.textContent).toBe("hi there");
    });
  });
});
