import type { ChatAction } from "@sitebot/shared";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./locale.js";
import { WIDGET_STYLES } from "./styles.js";
import { getOrCreateSessionId } from "./session.js";
import { sendChatMessage } from "./api.js";

/**
 * Lucide's "message-circle" icon (https://lucide.dev, ISC license), inlined
 * as SVG rather than pulling in an icon font. `stroke="currentColor"` picks
 * up the launcher button's `color` (--sb-accent-fg), so no extra styling is
 * needed. This is the one deliberate `innerHTML` use in this file — safe
 * because it's a fixed, developer-authored constant with no interpolation,
 * unlike message text/labels below, which are always set via `textContent`
 * because they can carry server-supplied strings.
 */
const LAUNCHER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></svg>`;

export interface WidgetConfig {
  apiUrl: string;
  tenant?: string;
  lang?: SupportedLocale;
  botName?: string;
  placeholder?: string;
}

interface DisplayMessage {
  role: "user" | "assistant" | "error";
  text: string;
  /** Quick replies to offer under this message — see shared/src/api.ts#ChatAction. Rendered only while this is the last message (see renderMessages). */
  actions?: ChatAction[];
  /** True when this reply resulted in a captured lead — renders a confirmation banner under it. */
  leadCaptured?: boolean;
}

const UI_COPY: Record<
  SupportedLocale,
  { placeholder: string; send: string; title: string; leadCaptured: string }
> = {
  en: {
    placeholder: "Ask a question...",
    send: "Send",
    title: "Chat",
    leadCaptured: "Your details were shared.",
  },
  es: {
    placeholder: "Escribe tu pregunta...",
    send: "Enviar",
    title: "Chat",
    leadCaptured: "Tus datos fueron compartidos.",
  },
  zh: {
    placeholder: "输入你的问题...",
    send: "发送",
    title: "聊天",
    leadCaptured: "你的信息已发送。",
  },
};

/**
 * A shadow-DOM custom element rather than an iframe — see
 * docs/ARCHITECTURE.md §Web chat widget for why. Self-contained: no
 * framework, no external CSS, one script tag embeds it.
 */
export class SitebotChatElement extends HTMLElement {
  private config: WidgetConfig = { apiUrl: "" };
  private sessionId = "";
  private messages: DisplayMessage[] = [];
  private sending = false;
  private open = false;

  private root!: ShadowRoot;
  private panelEl!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLInputElement;
  private sendButtonEl!: HTMLButtonElement;
  private langObserver?: MutationObserver;

  connectedCallback(): void {
    this.root = this.attachShadow({ mode: "open" });
    this.sessionId = getOrCreateSessionId(window.localStorage);
    this.render();
    document.addEventListener("keydown", this.handleKeydown);
    this.observeDocumentLang();
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.handleKeydown);
    this.langObserver?.disconnect();
    window.visualViewport?.removeEventListener("resize", this.syncVisualViewport);
    window.visualViewport?.removeEventListener("scroll", this.syncVisualViewport);
  }

  /**
   * `data-lang` is a static fallback read once at embed time (see
   * index.ts) — a host page whose language changes without a reload (a
   * toggle, a client-read `?lang=` param) needs the widget to notice too,
   * so future messages carry the right hint and the composer's copy
   * updates without the visitor having to reopen the panel.
   */
  private observeDocumentLang(): void {
    this.langObserver = new MutationObserver(() => {
      const next = document.documentElement.lang;
      if (SUPPORTED_LOCALES.includes(next as SupportedLocale) && next !== this.config.lang) {
        this.config = { ...this.config, lang: next as SupportedLocale };
        this.updateLocaleText();
      }
    });
    this.langObserver.observe(document.documentElement, { attributeFilter: ["lang"] });
  }

  private updateLocaleText(): void {
    this.inputEl.placeholder = this.config.placeholder ?? this.copy.placeholder;
    this.sendButtonEl.textContent = this.copy.send;
    this.panelEl.setAttribute("aria-label", this.config.botName ?? this.copy.title);
  }

  configure(config: WidgetConfig): void {
    this.config = config;
  }

  private get copy() {
    return UI_COPY[this.config.lang ?? "en"] ?? UI_COPY.en;
  }

  private handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.open) this.togglePanel(false);
  };

  /**
   * Mobile Safari (and Chrome on Android to a lesser extent) doesn't shrink
   * the *layout* viewport when the on-screen keyboard opens — it shrinks the
   * *visual* one and scrolls the page underneath. A `position: fixed;
   * inset: 0` element stays sized to the old, bigger layout viewport, so the
   * header (and its close button) gets pushed off-screen above the visible
   * area. `window.visualViewport` reports the actually-visible region;
   * mirroring it onto custom properties lets the mobile full-screen CSS
   * (styles.ts) track the shrunk viewport instead of assuming inset: 0 is
   * always the whole screen.
   */
  private syncVisualViewport = (): void => {
    const vv = window.visualViewport;
    if (!vv) return;
    this.style.setProperty("--sb-vv-height", `${vv.height}px`);
    this.style.setProperty("--sb-vv-top", `${vv.offsetTop}px`);
  };

  private togglePanel(next: boolean): void {
    this.open = next;
    this.panelEl.hidden = !next;
    this.classList.toggle("open", next);
    if (next) {
      this.inputEl.focus();
      this.syncVisualViewport();
      window.visualViewport?.addEventListener("resize", this.syncVisualViewport);
      window.visualViewport?.addEventListener("scroll", this.syncVisualViewport);
    } else {
      window.visualViewport?.removeEventListener("resize", this.syncVisualViewport);
      window.visualViewport?.removeEventListener("scroll", this.syncVisualViewport);
    }
  }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = WIDGET_STYLES;

    const launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", this.config.botName ?? this.copy.title);
    launcher.innerHTML = LAUNCHER_ICON;
    launcher.addEventListener("click", () => this.togglePanel(!this.open));

    this.panelEl = document.createElement("div");
    this.panelEl.className = "panel";
    this.panelEl.hidden = true;
    this.panelEl.setAttribute("role", "dialog");
    this.panelEl.setAttribute("aria-label", this.config.botName ?? this.copy.title);

    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("span");
    title.textContent = this.config.botName ?? this.copy.title;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "✕";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.addEventListener("click", () => this.togglePanel(false));
    header.append(title, closeButton);

    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "messages";
    this.messagesEl.setAttribute("aria-live", "polite");

    const composer = document.createElement("form");
    composer.className = "composer";
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    this.inputEl.placeholder = this.config.placeholder ?? this.copy.placeholder;
    this.inputEl.maxLength = 1000;
    this.sendButtonEl = document.createElement("button");
    this.sendButtonEl.type = "submit";
    this.sendButtonEl.textContent = this.copy.send;
    composer.append(this.inputEl, this.sendButtonEl);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.send();
    });

    this.panelEl.append(header, this.messagesEl, composer);
    this.root.append(style, this.panelEl, launcher);
  }

  private renderMessages(): void {
    const lastIndex = this.messages.length - 1;
    const messageEls = this.messages.flatMap((message, index) => {
      const bubble = document.createElement("div");
      bubble.className = `message ${message.role}`;
      bubble.textContent = message.text;

      const els: HTMLElement[] = [bubble];
      if (message.leadCaptured) els.push(this.renderNotice());
      // Only on the last message, so "chip already clicked" needs no extra
      // bookkeeping — send() always appends a new message next, which makes
      // this one stop being last on the very next render and the row just
      // disappears. See also the click handler below, which clears
      // message.actions as a belt-and-suspenders measure.
      if (index === lastIndex && message.actions?.length) {
        els.push(this.renderActions(message));
      }
      return els;
    });
    if (this.sending) messageEls.push(this.renderTypingIndicator());
    this.messagesEl.replaceChildren(...messageEls);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private renderActions(message: DisplayMessage): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "actions";
    el.setAttribute("role", "group");
    for (const action of message.actions ?? []) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.disabled = this.sending;
      button.addEventListener("click", () => {
        if (this.sending) return;
        message.actions = undefined;
        void this.send(action.send);
      });
      el.append(button);
    }
    return el;
  }

  private renderNotice(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "notice";
    el.textContent = this.copy.leadCaptured;
    return el;
  }

  private renderTypingIndicator(): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "typing";
    el.setAttribute("aria-label", "Typing");
    el.append(
      document.createElement("span"),
      document.createElement("span"),
      document.createElement("span"),
    );
    return el;
  }

  private async send(overrideText?: string): Promise<void> {
    const text = (overrideText ?? this.inputEl.value).trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.sendButtonEl.disabled = true;
    // A chip click supplies its own text — clearing the input here would
    // wipe out anything the visitor had already half-typed themselves.
    if (overrideText === undefined) this.inputEl.value = "";
    this.messages.push({ role: "user", text });
    this.renderMessages();

    try {
      const response = await sendChatMessage(
        { apiUrl: this.config.apiUrl, tenant: this.config.tenant, sessionId: this.sessionId },
        { message: text, lang: this.config.lang },
      );
      if ("reply" in response) {
        this.messages.push({
          role: "assistant",
          text: response.reply,
          actions: response.actions,
          leadCaptured: response.leadCaptured,
        });
      } else {
        this.messages.push({
          role: "error",
          text: errorCopy(response.error, this.config.lang ?? "en"),
        });
      }
    } catch {
      this.messages.push({
        role: "error",
        text: errorCopy("server_error", this.config.lang ?? "en"),
      });
    } finally {
      this.sending = false;
      this.sendButtonEl.disabled = false;
      this.renderMessages();
    }
  }
}

function errorCopy(error: string, lang: SupportedLocale): string {
  const copy: Record<string, Partial<Record<SupportedLocale, string>>> = {
    rate_limited: {
      en: "You've reached today's limit — try again tomorrow.",
      es: "Límite alcanzado — intenta mañana.",
    },
    at_capacity: {
      en: "Busy right now — please try again shortly.",
      es: "Ocupado ahora — intenta en un momento.",
    },
  };
  return copy[error]?.[lang] ?? copy[error]?.en ?? "Something went wrong — please try again.";
}

export function defineSitebotChatElement(tagName = "sitebot-chat"): void {
  if (!customElements.get(tagName)) {
    customElements.define(tagName, SitebotChatElement);
  }
}
