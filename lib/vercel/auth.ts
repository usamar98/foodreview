import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cookieNames, verifyToken } from "./session.mjs";

export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };
const userSchema = z.object({ userId: z.string().regex(/^github:\d+$/), displayName: z.string().max(200), email: z.string().email(), fullName: z.string().max(200).nullable() });

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  // Public Vercel requests must never trust the original host's identity headers.
  if (!process.env.AUTH_SECRET) return null;
  const value = (await cookies()).get(cookieNames().session)?.value;
  const parsed = userSchema.safeParse(verifyToken(value, process.env.AUTH_SECRET, "session"));
  return parsed.success ? parsed.data : null;
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

// Preserve the shared helper interface; OAuth always returns to the home page.
export function chatGPTSignInPath(_returnTo: string) { return "/api/auth/github"; }
export function chatGPTSignOutPath(_returnTo = "/") { return "/api/auth/signout"; }
