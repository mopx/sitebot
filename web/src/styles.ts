/**
 * Injected into the custom element's shadow root — full style isolation from
 * the host page's CSS, which is the actual reason people reach for an
 * iframe. See docs/ARCHITECTURE.md §Web chat widget for why a shadow-DOM
 * custom element was chosen over an iframe instead.
 */
export const WIDGET_STYLES = `
  :host {
    all: initial;
    position: fixed;
    inset: auto 1.25rem 1.25rem auto;
    z-index: 2147483000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --sb-accent: #111827;
    --sb-accent-fg: #ffffff;
    --sb-bg: #ffffff;
    --sb-fg: #111827;
    --sb-border: #e5e7eb;
    --sb-muted: #6b7280;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --sb-bg: #1f2937;
      --sb-fg: #f9fafb;
      --sb-border: #374151;
      --sb-muted: #9ca3af;
    }
  }
  .launcher {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 999px;
    border: none;
    background: var(--sb-accent);
    color: var(--sb-accent-fg);
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    font-size: 1.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panel {
    position: absolute;
    bottom: 4rem;
    right: 0;
    width: 22rem;
    max-width: calc(100vw - 2.5rem);
    height: 32rem;
    max-height: calc(100vh - 6rem);
    background: var(--sb-bg);
    color: var(--sb-fg);
    border: 1px solid var(--sb-border);
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel[hidden] { display: none; }
  .header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--sb-border);
    font-weight: 600;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header button {
    background: none;
    border: none;
    color: var(--sb-muted);
    cursor: pointer;
    font-size: 1rem;
  }
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .message {
    max-width: 85%;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    line-height: 1.4;
    white-space: pre-wrap;
  }
  .message.user {
    align-self: flex-end;
    background: var(--sb-accent);
    color: var(--sb-accent-fg);
  }
  .message.assistant {
    align-self: flex-start;
    background: var(--sb-border);
  }
  .message.error {
    align-self: center;
    color: #b91c1c;
    font-size: 0.8rem;
  }
  .typing {
    align-self: flex-start;
    background: var(--sb-border);
    padding: 0.6rem 0.75rem;
    border-radius: 0.75rem;
    display: flex;
    gap: 0.25rem;
  }
  .typing span {
    width: 0.4rem;
    height: 0.4rem;
    border-radius: 999px;
    background: var(--sb-muted);
    animation: sb-typing 1.2s infinite ease-in-out;
  }
  .typing span:nth-child(2) { animation-delay: 0.15s; }
  .typing span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes sb-typing {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-0.15rem); }
  }
  .composer {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    border-top: 1px solid var(--sb-border);
  }
  .composer input {
    flex: 1;
    border: 1px solid var(--sb-border);
    border-radius: 0.5rem;
    padding: 0.5rem 0.6rem;
    /* Deliberately 16px, not rem: iOS Safari auto-zooms the page on focus for
       any input under 16px, and rem here would resolve against the host
       page's root font-size (outside this widget's control), not ours. */
    font-size: 16px;
    background: var(--sb-bg);
    color: var(--sb-fg);
  }
  .composer button {
    border: none;
    background: var(--sb-accent);
    color: var(--sb-accent-fg);
    border-radius: 0.5rem;
    padding: 0 0.9rem;
    cursor: pointer;
    font-size: 0.875rem;
  }
  .composer button:disabled { opacity: 0.5; cursor: default; }
`;
