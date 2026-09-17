// The Sites dispatcher handles ChatGPT auth. GitHub OAuth exists only in Next.js.
export async function login() { return new Response("Not found", { status: 404 }); }
export async function callback(_request: Request) { return new Response("Not found", { status: 404 }); }
export async function logout(_request: Request) { return new Response("Not found", { status: 404 }); }
