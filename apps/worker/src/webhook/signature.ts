const encoder = new TextEncoder();

/**
 * Checks Meta's `X-Hub-Signature-256: sha256=<hex>` header against the raw body.
 * `crypto.subtle.verify` compares in constant time, so no timing leak.
 */
export async function verifySignature(
  appSecret: string,
  rawBody: ArrayBuffer,
  header: string | undefined,
): Promise<boolean> {
  const hex = header?.startsWith("sha256=") ? header.slice("sha256=".length) : null;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) return false;

  const signature = new Uint8Array(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, signature, rawBody);
}

/** Produces the header value Meta would send. Used by tests and local scripts. */
export async function sign(appSecret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `sha256=${Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
