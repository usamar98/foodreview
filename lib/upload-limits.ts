// Leave room for multipart fields under Vercel's 4.5 MB request limit.
export const receiptMaxMb = typeof process !== "undefined" && process.env.SAVOUR_RUNTIME === "vercel" ? 4 : 5;
export const receiptMaxBytes = receiptMaxMb * 1024 * 1024;
