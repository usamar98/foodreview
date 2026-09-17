import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cookieNames, signToken, verifyToken } from "./session.mjs";

function configuration() {
  const { AUTH_URL, AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET } = process.env;
  if (!AUTH_URL || !AUTH_SECRET || AUTH_SECRET.length < 32 || !AUTH_GITHUB_ID || !AUTH_GITHUB_SECRET) {
    throw new Error("Configure AUTH_URL, AUTH_SECRET (at least 32 characters), AUTH_GITHUB_ID, and AUTH_GITHUB_SECRET in Vercel before signing in.");
  }
  const url = new URL(AUTH_URL);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("AUTH_URL must use HTTPS (HTTP is supported only for local development).");
  }
  return { origin: url.origin, secret: AUTH_SECRET, clientId: AUTH_GITHUB_ID, clientSecret: AUTH_GITHUB_SECRET };
}

function cookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieNames().secure ? "; Secure" : ""}`;
}
function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function login() {
  let config: ReturnType<typeof configuration>;
  try { config = configuration(); } catch (error) { return errorResponse((error as Error).message, 503); }
  const nonce = randomBytes(32).toString("base64url"), verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/github/callback`, scope: "read:user user:email", state: nonce, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  return new Response(null, { status: 302, headers: { Location: url.href, "Cache-Control": "no-store", "Set-Cookie": cookie(cookieNames().state, signToken({ nonce, verifier }, config.secret, "oauth-state", 600), 600) } });
}

export async function callback(request: Request) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append("Set-Cookie", cookie(cookieNames().state, "", 0));
  try {
    const config = configuration(), url = new URL(request.url);
    const state = verifyToken((await cookies()).get(cookieNames().state)?.value, config.secret, "oauth-state");
    const code = url.searchParams.get("code");
    if (!state || typeof state.nonce !== "string" || typeof state.verifier !== "string" || state.nonce !== url.searchParams.get("state") || !code || url.searchParams.has("error")) {
      return new Response("GitHub sign-in expired or was cancelled. Return to Savour and try again.", { status: 400, headers });
    }
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: `${config.origin}/api/auth/github/callback`, code_verifier: state.verifier }), cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    const token = await tokenResponse.json() as { access_token?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error("GitHub token exchange failed.");
    const options = { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Savour" }, cache: "no-store" as const, signal: AbortSignal.timeout(15_000) };
    const [userResponse, emailsResponse] = await Promise.all([fetch("https://api.github.com/user", options), fetch("https://api.github.com/user/emails", options)]);
    if (!userResponse.ok || !emailsResponse.ok) throw new Error("GitHub identity lookup failed.");
    const user = await userResponse.json() as { id: number; login: string; name: string | null };
    const emails = await emailsResponse.json() as { email: string; verified: boolean; primary: boolean }[];
    const email = emails.find(e => e.verified && e.primary)?.email ?? emails.find(e => e.verified)?.email;
    if (!Number.isSafeInteger(user.id) || user.id <= 0 || !email || typeof user.login !== "string") throw new Error("A verified GitHub email is required.");
    const identity = { userId: `github:${user.id}`, displayName: (user.name || user.login).slice(0, 200), email, fullName: user.name ? user.name.slice(0, 200) : null };
    headers.append("Set-Cookie", cookie(cookieNames().session, signToken(identity, config.secret, "session", 7 * 86400), 7 * 86400));
    headers.set("Location", `${config.origin}/`);
    return new Response(null, { status: 302, headers });
  } catch {
    return new Response("GitHub sign-in could not be completed. Return to Savour and try again.", { status: 502, headers });
  }
}

export async function logout(request: Request) {
  const config = configuration();
  if (request.headers.get("origin") !== config.origin) return errorResponse("Submit from Savour.", 403);
  return new Response(null, { status: 303, headers: { Location: `${config.origin}/`, "Cache-Control": "no-store", "Set-Cookie": cookie(cookieNames().session, "", 0) } });
}
