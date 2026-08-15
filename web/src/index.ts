import { defineSitebotChatElement, SitebotChatElement, type WidgetConfig } from "./element.js";
import { SUPPORTED_LOCALES, type SupportedLocale } from "./locale.js";

function asSupportedLocale(value: string | undefined): SupportedLocale | undefined {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? (value as SupportedLocale)
    : undefined;
}

/**
 * Entry point loaded via <script defer src=".../widget.js" data-api="..." ...>.
 * Reads its own config from the script tag's data-* attributes and
 * self-mounts — see docs/SETUP.md for the embed snippet.
 *
 * `data-lang` is a fallback, not the source of truth: it's a static value
 * baked in at embed time, so on any site whose language can change without a
 * reload (a toggle, a `?lang=` query param read client-side, etc.) it goes
 * stale immediately. `document.documentElement.lang` is the live signal —
 * the standard way a page declares its current language — so it wins
 * whenever it resolves to one of our supported locales. The element also
 * watches this attribute for later changes — see element.ts.
 */
function readConfigFromScriptTag(): WidgetConfig | null {
  const currentScript = document.currentScript as HTMLScriptElement | null;
  const apiUrl = currentScript?.dataset["api"];
  if (!apiUrl) {
    console.error("[sitebot] widget.js loaded without a data-api attribute — see docs/SETUP.md");
    return null;
  }
  const lang =
    asSupportedLocale(document.documentElement.lang) ??
    asSupportedLocale(currentScript?.dataset["lang"]);
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
