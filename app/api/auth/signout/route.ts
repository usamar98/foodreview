import { logout } from "@/lib/host-auth";
export async function POST(request: Request) { return logout(request); }
