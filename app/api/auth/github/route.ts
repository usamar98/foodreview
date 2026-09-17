import { login } from "@/lib/host-auth";
export const dynamic = "force-dynamic";
export async function GET() { return login(); }
