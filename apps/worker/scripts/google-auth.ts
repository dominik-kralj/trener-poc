// One-off: log in with the coach's Google account and store a refresh token in .dev.vars.
// Run: pnpm --filter @trener/worker google:auth   (then `wrangler secret put GOOGLE_REFRESH_TOKEN`)
// Uses the "Desktop app" OAuth client with a loopback redirect, so no public URL is needed.
// While the Google app is in testing mode the token expires after 7 days: rerun before the demo.
import { exec } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const DEV_VARS = join(import.meta.dirname, "..", ".dev.vars");
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

const vars = readFileSync(DEV_VARS, "utf8");
const read = (name: string) => vars.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
const clientId = read("GOOGLE_CLIENT_ID");
const clientSecret = read("GOOGLE_CLIENT_SECRET");
if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .dev.vars");

const state = crypto.randomUUID();
const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as { port: number };
const redirectUri = `http://127.0.0.1:${port}`;

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // → refresh token
    prompt: "consent", // always return a refresh token, even on a repeat login
    state,
  });

console.log(`Opening the browser. If it doesn't open, visit:\n${authUrl}\n`);
exec(process.platform === "win32" ? `start "" "${authUrl}"` : `open "${authUrl}"`);

const code = await new Promise<string>((resolve, reject) => {
  server.on("request", (req, res) => {
    const url = new URL(req.url ?? "/", redirectUri);
    const error = url.searchParams.get("error");
    const got = url.searchParams.get("code");
    if (error || !got || url.searchParams.get("state") !== state) {
      res.end("Login failed, check the terminal.");
      reject(new Error(`OAuth error: ${error ?? "missing code or wrong state"}`));
      return;
    }
    res.end("Done, you can close this tab.");
    resolve(got);
  });
});
server.close();

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }),
});
const token = (await res.json()) as { refresh_token?: string; scope?: string; error?: string };
if (!res.ok || !token.refresh_token) throw new Error(`Token exchange failed: ${token.error ?? res.status}`);
if (!token.scope?.includes(SCOPE)) throw new Error("The calendar.events permission wasn't granted. Tick it on the consent screen.");

// Written straight to .dev.vars, never printed.
const updated = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(vars)
  ? vars.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, `GOOGLE_REFRESH_TOKEN=${token.refresh_token}`)
  : `${vars.trimEnd()}\nGOOGLE_REFRESH_TOKEN=${token.refresh_token}\n`;
writeFileSync(DEV_VARS, updated);
console.log("Refresh token saved to .dev.vars. Now: npx wrangler secret put GOOGLE_REFRESH_TOKEN");
