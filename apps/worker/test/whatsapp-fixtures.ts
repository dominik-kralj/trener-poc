/** Minimal Meta webhook payloads, shaped like the real ones. */

export function envelope(value: Record<string, unknown>) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550000000", phone_number_id: "PHONE_ID" },
              ...value,
            },
          },
        ],
      },
    ],
  };
}

export function textPayload(from: string, id: string, body: string) {
  return envelope({
    contacts: [{ profile: { name: "Marko" }, wa_id: from }],
    messages: [{ from, id, timestamp: "1790000000", type: "text", text: { body } }],
  });
}

export function buttonPayload(from: string, id: string, replyId: string) {
  return envelope({
    messages: [
      {
        from,
        id,
        timestamp: "1790000000",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: replyId, title: "Potvrdi" } },
      },
    ],
  });
}

export function listPayload(from: string, id: string, replyId: string) {
  return envelope({
    messages: [
      {
        from,
        id,
        timestamp: "1790000000",
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: replyId, title: "Sri 30.9. 16:00" } },
      },
    ],
  });
}

export function audioPayload(from: string, id: string) {
  return envelope({
    messages: [{ from, id, timestamp: "1790000000", type: "audio", audio: { id: "MEDIA_ID" } }],
  });
}

export function statusPayload() {
  return envelope({
    statuses: [{ id: "wamid.OUT", status: "delivered", timestamp: "1790000000", recipient_id: "385910000001" }],
  });
}
