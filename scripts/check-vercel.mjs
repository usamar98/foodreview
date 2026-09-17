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
const { repository } = await loadTs("../lib/supabase/repository.ts");
const { isDuplicateError } = await loadTs("../lib/repository-types.ts");
process.env.SUPABASE_URL = "https://test-project.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_synthetic_test_key";
process.env.SUPABASE_RECEIPTS_BUCKET = "receipts";
const realFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, options) => {
  url = new URL(url);
  calls.push({ url, options });
  assert.equal(options.cache, "no-store");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.get("apikey"), "sb_secret_synthetic_test_key");
  assert.equal(options.headers.has("Authorization"), false);
  if (url.pathname.endsWith("savour_moderate_review")) return Response.json(true);
  if (url.pathname.startsWith("/rest/v1/")) return options.method && options.method !== "GET" && !url.pathname.includes("/rpc/") ? new Response(null,{status:201}) : Response.json([{id:"visit-1",receipt_key:"receipts/visit-1"}]);
  if (options.method === "POST" || options.method === "DELETE") return Response.json({ success: true });
  return new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } });
};
try {
  const anonymous = await repository.state(null,false);
  assert.equal(anonymous.profile,null);
  assert.deepEqual(anonymous.diary,[]);
  assert.deepEqual(anonymous.queue,[]);
  assert.equal(calls.length,1); // An anonymous request never fetches private rows.
  calls=[];
  await repository.state(user.userId,false);
  assert.equal(calls.length,4);
  for (const call of calls.filter(c=>!c.url.pathname.includes("/rpc/"))) assert.equal(call.url.searchParams.get("user_id"),`eq.${user.userId}`);
  await repository.receiptKey("visit-1",user.userId,false);
  assert.equal(calls.at(-1).url.searchParams.get("user_id"),`eq.${user.userId}`);
  await repository.receiptKey("visit-1",user.userId,true);
  assert.equal(calls.at(-1).url.searchParams.has("user_id"),false);
  await repository.save(user.userId,"sample-casa",true);
  assert.ok(calls.at(-1).options.headers.get("Prefer").includes("ignore-duplicates"));
  await repository.save(user.userId,"sample-casa",false);
  assert.equal(calls.at(-1).url.searchParams.get("user_id"),`eq.${user.userId}`);
  const hostileId = 'place,or(user_id.eq.other)';
  await repository.duplicateReview("hash",user.userId,hostileId,"2026-01-01");
  assert.ok(calls.at(-1).url.searchParams.get("or").includes(`restaurant_id.eq.${JSON.stringify(hostileId)}`));
  await repository.publicReviews("place-1");
  assert.equal(calls.at(-1).url.searchParams.get("status"),"eq.verified");
  for (const field of ["receipt_key","receipt_hash","user_id","spend","moderator"]) assert.ok(!calls.at(-1).url.searchParams.get("select").split(",").includes(field));
  assert.equal(await repository.moderate("visit-1","verified","Receipt checked by reviewer",user.userId),true);
  assert.equal(calls.at(-1).url.pathname,"/rest/v1/rpc/savour_moderate_review");
  await repository.putReceipt("receipts/a b", new ArrayBuffer(3), "application/pdf");
  assert.ok(calls.at(-1).url.pathname.endsWith("/object/receipts/receipts/a%20b"));
  assert.equal(calls.at(-1).options.headers.get("Content-Type"), "application/pdf");
  assert.equal(calls.at(-1).options.headers.get("x-upsert"),"false");
  const receipt = await repository.getReceipt("receipts/a b");
  assert.equal(receipt.contentType, "application/pdf");
  assert.equal(await new Response(receipt.body).text(), "%PDF-test");
  await repository.deleteReceipt("receipts/a b");
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{prefixes:["receipts/a b"]});
  globalThis.fetch = async () => Response.json({code:"NoSuchKey"},{status:400});
  assert.equal(await repository.getReceipt("missing"), null);
  globalThis.fetch = async () => Response.json({code:"23505"},{status:409});
  await assert.rejects(repository.addReview({}),error=>isDuplicateError(error));
  await assert.rejects(repository.putReceipt("receipt",new ArrayBuffer(0),"application/pdf"),/Supabase request failed/);
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(repository.state(null,false),/Configure SUPABASE/);
} finally { globalThis.fetch = realFetch; }
console.log("Session integrity, moderator permissions, Supabase transport, ownership, and private storage checks passed.");

if (process.argv.includes("--integration")) {
  // This starts only a loopback server with synthetic auth settings and no backend token.
  const origin = "http://127.0.0.1:3007";
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3007"], {
    stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, AUTH_URL: origin, AUTH_SECRET: secret, AUTH_GITHUB_ID: "synthetic-test-client", AUTH_GITHUB_SECRET: "synthetic-test-secret", SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SAVOUR_MODERATOR_IDS: "" },
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
