import { defineSitebotChatElement, SitebotChatElement, type WidgetConfig } from "./element.js";
import type { SupportedLocale } from "@sitebot/shared";

/**
 * Entry point loaded via <script defer src=".../widget.js" data-api="..." ...>.
 * Reads its own config from the script tag's data-* attributes and
 * self-mounts — see docs/SETUP.md for the embed snippet.
 */
function readConfigFromScriptTag(): WidgetConfig | null {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const apiUrl = currentScript?.dataset["api"];
  if (!apiUrl) {
    console.error("[sitebot] widget.js loaded without a data-api attribute — see docs/SETUP.md");
    return null;
  }
  const lang = currentScript?.dataset["lang"] as SupportedLocale | undefined;
  return {
    apiUrl,
    tenant: currentScript?.dataset["tenant"],
    lang,
    botName: currentScript?.dataset["botName"],
    placeholder: currentScript?.dataset["placeholder"],
  };
}

function mount(): void {
  const config = readConfigFromScriptTag();
  if (!config) return;

  defineSitebotChatElement();
  const el = document.createElement("sitebot-chat") as SitebotChatElement;
  // Configure BEFORE appending: connectedCallback (which reads this.config
  // to render) fires synchronously on append, so configuring after would
  // render once with defaults and never re-render.
  el.configure(config);
  document.body.appendChild(el);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}

export { defineSitebotChatElement, SitebotChatElement };
export type { WidgetConfig };
