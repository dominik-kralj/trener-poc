import type { Choice, OutgoingMessage } from "@trener/core";

const GRAPH_URL = "https://graph.facebook.com/v23.0";

// WhatsApp Cloud API limits for interactive messages.
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE = 20;
export const MAX_LIST_ROWS = 10;
export const MAX_ROW_TITLE = 24;
const LIST_BUTTON_LABEL = "Odaberi";

export type SendResult = { ok: true; messageId: string } | { ok: false; status: number; error: string };

export type WhatsAppConfig = {
  token: string;
  phoneNumberId: string;
  /** Injected so tests can capture requests. */
  fetch?: typeof fetch;
};

export function createWhatsApp(config: WhatsAppConfig) {
  const doFetch = config.fetch ?? fetch;

  /** Never throws on an API error: logs it and returns `ok: false`, so one failed recipient doesn't stop the rest. */
  async function post(to: string, message: Record<string, unknown>): Promise<SendResult> {
    const res = await doFetch(`${GRAPH_URL}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      // Graph expects the number without the leading `+`.
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), ...message }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`whatsapp: send to ${to} failed (${res.status})`, body);
      return { ok: false, status: res.status, error: body };
    }
    const parsed = JSON.parse(body) as { messages?: { id: string }[] };
    return { ok: true, messageId: parsed.messages?.[0]?.id ?? "" };
  }

  function sendText(to: string, body: string) {
    return post(to, { type: "text", text: { body } });
  }

  function sendButtons(to: string, body: string, buttons: Choice[]) {
    assert(buttons.length >= 1 && buttons.length <= MAX_BUTTONS, `buttons: 1-${MAX_BUTTONS}, got ${buttons.length}`);
    for (const b of buttons) {
      assert(b.title.length <= MAX_BUTTON_TITLE, `button title over ${MAX_BUTTON_TITLE} chars: "${b.title}"`);
    }
    return post(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: buttons.map((b) => ({ type: "reply", reply: { id: b.id, title: b.title } })) },
      },
    });
  }

  function sendList(to: string, body: string, rows: Choice[]) {
    assert(rows.length >= 1 && rows.length <= MAX_LIST_ROWS, `list rows: 1-${MAX_LIST_ROWS}, got ${rows.length}`);
    for (const r of rows) {
      assert(r.title.length <= MAX_ROW_TITLE, `row title over ${MAX_ROW_TITLE} chars: "${r.title}"`);
    }
    return post(to, {
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: { button: LIST_BUTTON_LABEL, sections: [{ rows: rows.map((r) => ({ id: r.id, title: r.title })) }] },
      },
    });
  }

  /** Maps a core `sendMessage` decision to the right call: ≤3 choices are buttons, more become a list. */
  function send(to: string, message: OutgoingMessage) {
    if (message.kind === "text") return sendText(to, message.body);
    return message.choices.length <= MAX_BUTTONS
      ? sendButtons(to, message.body, message.choices)
      : sendList(to, message.body, message.choices);
  }

  return { sendText, sendButtons, sendList, send };
}

export type WhatsApp = ReturnType<typeof createWhatsApp>;

/** Limit violations are bugs in core, not runtime conditions: fail loudly. */
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`whatsapp: ${message}`);
}
