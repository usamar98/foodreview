import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { signToken, verifyToken, cookieNames } from "../lib/vercel/session.mjs";

const secret = randomBytes(32).toString("hex");
const user = { userId: "github:123", displayName: "Test diner", email: "diner@example.com", fullName: "Test diner" };
const token = signToken(user, secret, "session", 300);
assert.equal(verifyToken(token, secret, "session").userId, user.userId);
assert.equal(verifyToken(token, secret, "oauth-state"), null);
assert.equal(verifyToken(token, randomBytes(32).toString("hex"), "session"), null);
assert.equal(verifyToken(signToken(user, secret, "session", -1), secret, "session"), null);
const forged = `${Buffer.from(JSON.stringify({ ...user, userId: "github:456", exp: 9999999999, purpose: "session" })).toString("base64url")}.${token.split(".")[1]}`;
assert.equal(verifyToken(forged, secret, "session"), null);
assert.equal(verifyToken("invalid", secret, "session"), null);
assert.throws(() => signToken(user, "short", "session", 300));
process.env.AUTH_URL = "https://example.com";
assert.equal(cookieNames().session, "__Host-savour-session");
assert.equal(cookieNames().secure, true);

// Exercise transport contracts without contacting a real account or using keys.
async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
process.env.SAVOUR_RUNTIME = "vercel";
const { isModerator } = await loadTs("../lib/permissions.ts");
process.env.SAVOUR_MODERATOR_IDS = "";
assert.equal(isModerator(user), false);
process.env.SAVOUR_MODERATOR_IDS = "github:456, github:123";
assert.equal(isModerator(user), true);
assert.equal(isModerator({ ...user, userId: "github:12" }), false);
assert.equal(isModerator(null), false);
const { env } = await loadTs("../lib/vercel/bindings.ts");
for (const name of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_R2_BUCKET_NAME"]) process.env[name] = "test-placeholder";
const realFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  assert.equal(options.cache, "no-store");
  assert.equal(options.headers.get("Authorization"), "Bearer test-placeholder");
  if (url.endsWith("/query")) {
    const body = JSON.parse(options.body);
    return Response.json({ success: true, result: (body.batch ?? [body]).map(() => ({ success: true, results: [{ id: "visit-1" }], meta: { changes: 1 } })) });
  }
  if (options.method === "PUT") return Response.json({ success: true });
  if (options.method === "DELETE") return Response.json({ success: true });
  return new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } });
};
try {
  assert.equal((await env.DB.prepare("SELECT id WHERE user_id=?").bind(user.userId).first()).id, "visit-1");
  assert.deepEqual(JSON.parse(calls[0].options.body), { sql: "SELECT id WHERE user_id=?", params: [user.userId] });
  const batch = await env.DB.batch([env.DB.prepare("UPDATE reviews SET status=?").bind("verified"), env.DB.prepare("UPDATE restaurants SET listed=1")]);
  assert.equal(batch.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).batch.length, 2); // One atomic D1 batch request.
  await env.BUCKET.put("receipts/a b", new ArrayBuffer(3), { httpMetadata: { contentType: "application/pdf" } });
  assert.ok(calls.at(-1).url.endsWith("/objects/receipts/a%20b"));
  assert.equal(calls.at(-1).options.headers.get("Content-Type"), "application/pdf");
  const receipt = await env.BUCKET.get("receipts/a b");
  assert.equal(receipt.httpMetadata.contentType, "application/pdf");
  assert.equal(await new Response(receipt.body).text(), "%PDF-test");
  await env.BUCKET.delete("receipts/a b");
  globalThis.fetch = async () => new Response(null, { status: 404 });
  assert.equal(await env.BUCKET.get("missing"), null);
  globalThis.fetch = async () => Response.json({ success: false, errors: [{ message: "UNIQUE constraint failed" }] });
  await assert.rejects(env.DB.prepare("INSERT").run(), /UNIQUE/);
  await assert.rejects(env.BUCKET.put("receipt", new ArrayBuffer(0)), /upload failed/);
} finally { globalThis.fetch = realFetch; }
console.log("Session integrity, expiry, moderator permissions, and D1/R2 transport checks passed.");

if (process.argv.includes("--integration")) {
  // This starts only a loopback server with synthetic auth settings and no backend token.
  const origin = "http://127.0.0.1:3007";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3007"], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, AUTH_URL: origin, AUTH_SECRET: secret, AUTH_GITHUB_ID: "synthetic-test-client", AUTH_GITHUB_SECRET: "synthetic-test-secret", CLOUDFLARE_API_TOKEN: "", SAVOUR_MODERATOR_IDS: "" },
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode !== null) throw new Error(output);
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Production server starts");
    const root = await fetch(origin, { headers: { "oai-authenticated-user-id": "spoofed", "oai-authenticated-user-email": "attacker@example.com" } });
    assert.equal(root.status, 200);
    assert.ok((await root.text()).includes("/api/auth/github"));
    const mutation = { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "oai-authenticated-user-id": "spoofed", "oai-authenticated-user-email": "attacker@example.com" }, body: "{}" };
    assert.equal((await fetch(origin + "/api/saved", mutation)).status, 401);
    assert.equal((await fetch(origin + "/api/moderation", { ...mutation, headers: { ...mutation.headers, Cookie: `savour-session=${token}` } })).status, 403);
    assert.equal((await fetch(origin + "/api/saved", { ...mutation, headers: { ...mutation.headers, Origin: "https://attacker.example", Cookie: `savour-session=${token}` } })).status, 403);
    assert.equal((await fetch(origin + "/api/state")).status, 503);
    assert.equal((await fetch(origin + "/api/receipt?id=private")).status, 401);
    const login = await fetch(origin + "/api/auth/github", { redirect: "manual" });
    assert.equal(login.status, 302);
    const destination = new URL(login.headers.get("location"));
    assert.equal(destination.origin, "https://github.com");
    assert.equal(destination.searchParams.get("code_challenge_method"), "S256");
    assert.ok(login.headers.get("set-cookie").includes("HttpOnly"));
    assert.equal((await fetch(origin + "/api/auth/github/callback?code=fake&state=wrong")).status, 400);
    assert.equal((await fetch(origin + "/api/auth/signout", { method: "POST", headers: { Origin: "https://attacker.example" } })).status, 403);
    console.log("Next.js production HTTP checks passed: landing page, GitHub PKCE/state, identity spoofing, CSRF, and access control.");
  } finally { child.kill(); }
}
