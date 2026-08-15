import type { SupportedLocale } from "@sitebot/shared";
import { WIDGET_STYLES } from "./styles.js";
import { getOrCreateSessionId } from "./session.js";
import { sendChatMessage } from "./api.js";

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
}

const UI_COPY: Record<SupportedLocale, { placeholder: string; send: string; title: string }> = {
  en: { placeholder: "Ask a question...", send: "Send", title: "Chat" },
  es: { placeholder: "Escribe tu pregunta...", send: "Enviar", title: "Chat" },
  zh: { placeholder: "输入你的问题...", send: "发送", title: "聊天" },
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

  connectedCallback(): void {
    this.root = this.attachShadow({ mode: "open" });
    this.sessionId = getOrCreateSessionId(window.localStorage);
    this.render();
    document.addEventListener("keydown", this.handleKeydown);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.handleKeydown);
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

  private togglePanel(next: boolean): void {
    this.open = next;
    this.panelEl.hidden = !next;
    if (next) this.inputEl.focus();
  }

  private render(): void {
    const style = document.createElement("style");
    style.textContent = WIDGET_STYLES;

    const launcher = document.createElement("button");
    launcher.className = "launcher";
    launcher.type = "button";
    launcher.setAttribute("aria-label", this.config.botName ?? this.copy.title);
    launcher.textContent = "💬";
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
    const messageEls = this.messages.map((message) => {
      const el = document.createElement("div");
      el.className = `message ${message.role}`;
      el.textContent = message.text;
      return el;
    });
    if (this.sending) messageEls.push(this.renderTypingIndicator());
    this.messagesEl.replaceChildren(...messageEls);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
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

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.sendButtonEl.disabled = true;
    this.inputEl.value = "";
    this.messages.push({ role: "user", text });
    this.renderMessages();

    try {
      const response = await sendChatMessage(
        { apiUrl: this.config.apiUrl, tenant: this.config.tenant, sessionId: this.sessionId },
        { message: text, lang: this.config.lang },
      );
      if ("reply" in response) {
        this.messages.push({ role: "assistant", text: response.reply });
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
