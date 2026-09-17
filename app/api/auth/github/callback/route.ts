import { callback } from "@/lib/host-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return callback(request); }
