import { env } from "@/lib/bindings";
export function db() { if(!env.DB)throw new Error("Review database unavailable");return env.DB; }
export function bucket() { if(!env.BUCKET)throw new Error("Private receipt storage unavailable");return env.BUCKET; }
