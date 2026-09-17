import type { ChatGPTUser } from "@/app/chatgpt-auth";
export function isModerator(user: ChatGPTUser | null) {
  if (!user) return false;
  if (process.env.SAVOUR_RUNTIME !== "vercel") return true; // Existing owner-private Sites pilot.
  const ids = (process.env.SAVOUR_MODERATOR_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
  return ids.includes(user.userId);
}
