import { createHmac, timingSafeEqual } from "node:crypto";

// OAuth tokens never enter these cookies. They contain only the user's identity
// or the short-lived state/PKCE challenge, authenticated with a server secret.
export function signToken(payload, secret, purpose, lifetimeSeconds) {
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  const body = Buffer.from(JSON.stringify({ ...payload, purpose, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token, secret, purpose) {
  try {
    if (!token || token.length > 6000 || !secret || secret.length < 32) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const expected = createHmac("sha256", secret).update(parts[0]).digest();
    const received = Buffer.from(parts[1], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (payload.purpose !== purpose || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

export function cookieNames() {
  const secure = process.env.AUTH_URL?.startsWith("https://") ?? false;
  return { secure, session: secure ? "__Host-savour-session" : "savour-session", state: secure ? "__Host-savour-oauth" : "savour-oauth" };
}
