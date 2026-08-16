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

  it("mirrors window.visualViewport onto CSS custom properties while open, so the mobile panel can track the on-screen keyboard", () => {
    const listeners: Record<string, () => void> = {};
    vi.stubGlobal("visualViewport", {
      height: 500,
      offsetTop: 20,
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn;
      },
      removeEventListener: vi.fn(),
    });

    const el = mount();
    const shadow = el.shadowRoot!;
    expect(el.style.getPropertyValue("--sb-vv-height")).toBe("");

    (shadow.querySelector(".launcher") as HTMLButtonElement).click();
    expect(el.style.getPropertyValue("--sb-vv-height")).toBe("500px");
    expect(el.style.getPropertyValue("--sb-vv-top")).toBe("20px");

    // Simulate the keyboard opening: the visual viewport shrinks, and the
    // resize listener registered on open should pick up the new value.
    (window.visualViewport as unknown as { height: number }).height = 300;
    listeners["resize"]?.();
    expect(el.style.getPropertyValue("--sb-vv-height")).toBe("300px");
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

  it("renders a chip row for the actions returned with a reply, separate from the bubble", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              reply: "I don't have anything on that.",
              sources: [],
              conversationId: "c1",
              actions: [{ label: "Book a meeting", send: "I'd like to set up a meeting" }],
            }),
          ),
      ),
    );

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "some unrelated question";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".actions button")).toHaveLength(1);
    });
    expect(shadow.querySelector(".actions button")?.textContent).toBe("Book a meeting");
    expect(shadow.querySelector(".message.assistant .actions")).toBeNull();
  });

  it("sends the chip's send-text, not its label, when clicked, and clears the chip row afterward", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            reply: "I don't have anything on that.",
            sources: [],
            conversationId: "c1",
            actions: [{ label: "Book a meeting", send: "I'd like to set up a meeting" }],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "some unrelated question";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".actions button")).toHaveLength(1);
    });

    (shadow.querySelector(".actions button") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".message.user")).toHaveLength(2);
    });
    expect(shadow.querySelectorAll(".message.user")[1]?.textContent).toBe(
      "I'd like to set up a meeting",
    );
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string) as {
      message: string;
    };
    expect(secondCallBody.message).toBe("I'd like to set up a meeting");
    expect(shadow.querySelectorAll(".actions button")).toHaveLength(0);
  });

  it("clears the chip row when the visitor types their own message instead of clicking a chip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              reply: "I don't have anything on that.",
              sources: [],
              conversationId: "c1",
              actions: [{ label: "Book a meeting", send: "I'd like to set up a meeting" }],
            }),
          ),
      ),
    );

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "some unrelated question";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".actions button")).toHaveLength(1);
    });

    input.value = "a follow-up question";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".message.user")).toHaveLength(2);
    });
    expect(shadow.querySelectorAll(".actions button")).toHaveLength(0);
  });

  it("preserves a typed draft in the input when a chip is clicked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              reply: "I don't have anything on that.",
              sources: [],
              conversationId: "c1",
              actions: [{ label: "Book a meeting", send: "I'd like to set up a meeting" }],
            }),
          ),
      ),
    );

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "some unrelated question";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();
    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".actions button")).toHaveLength(1);
    });

    input.value = "draft I was typing";
    (shadow.querySelector(".actions button") as HTMLButtonElement).click();
    expect(input.value).toBe("draft I was typing");
  });

  it("renders a confirmation banner when the reply sets leadCaptured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              reply: "Got it, I'll pass this along.",
              sources: [],
              conversationId: "c1",
              leadCaptured: true,
            }),
          ),
      ),
    );

    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "I'm Maria, my email is maria@example.com, I need a website";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelector(".notice")).not.toBeNull();
    });
    expect(shadow.querySelector(".notice")?.textContent).toBe("Your details were shared.");
  });

  it("renders neither chips nor a banner for a plain reply", async () => {
    const el = mount();
    const shadow = el.shadowRoot!;
    const input = shadow.querySelector("input") as HTMLInputElement;
    input.value = "What does Jorge do?";
    (shadow.querySelector("form") as HTMLFormElement).requestSubmit();

    await vi.waitFor(() => {
      expect(shadow.querySelectorAll(".message.assistant")).toHaveLength(1);
    });
    expect(shadow.querySelector(".actions")).toBeNull();
    expect(shadow.querySelector(".notice")).toBeNull();
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
