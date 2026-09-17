// Server-only HTTP adapters for the D1/R2 operations used by Savour.
// Build-time rendering never requires credentials. Nothing is stored on Vercel's disk.
type Row = Record<string, unknown>;
type QueryResult = { success: boolean; results: Row[]; meta: Record<string, unknown>; error?: string };
type Statement = { sql: string; params: unknown[] };

function config(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} in the Vercel environment.`);
  return value;
}

async function cloudflare(path: string, init: RequestInit = {}) {
  const account = encodeURIComponent(config("CLOUDFLARE_ACCOUNT_ID"));
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${config("CLOUDFLARE_API_TOKEN")}`);
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    ...init, headers, cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
}

async function query(statements: Statement | Statement[]) {
  const database = encodeURIComponent(config("CLOUDFLARE_D1_DATABASE_ID"));
  const response = await cloudflare(`d1/database/${database}/query`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Array.isArray(statements) ? { batch: statements } : statements),
  });
  const data = await response.json() as { success: boolean; result?: QueryResult[]; errors?: { message: string }[] };
  if (!response.ok || !data.success || !data.result || data.result.some(r => !r.success)) {
    throw new Error(data.errors?.map(e => e.message).join("; ") || data.result?.find(r => r.error)?.error || "D1 query failed");
  }
  return data.result;
}

class PreparedStatement {
  constructor(readonly sql: string, readonly params: unknown[] = []) {}
  bind(...params: unknown[]) { return new PreparedStatement(this.sql, params); }
  async all<T = Row>() { return (await query(this))[0] as unknown as D1Result<T>; }
  async run<T = Row>() { return this.all<T>(); }
  async first<T = Row>(column?: string): Promise<T | null> {
    const row = (await this.all<Row>()).results[0];
    return row ? (column ? row[column] as T : row as T) : null;
  }
  async raw<T = unknown[]>() {
    return (await this.all<Row>()).results.map(row => Object.values(row)) as T[];
  }
}

const database = {
  prepare(sql: string) { return new PreparedStatement(sql); },
  async batch(statements: PreparedStatement[]) { return query(statements.map(({ sql, params }) => ({ sql, params }))); },
};

function objectPath(key: string) {
  const bucket = encodeURIComponent(config("CLOUDFLARE_R2_BUCKET_NAME"));
  // Cloudflare requires literal slashes within object keys.
  return `r2/buckets/${bucket}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
}
const receiptBucket = {
  async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    const response = await cloudflare(objectPath(key), {
      method: "PUT", body: value, headers: { "Content-Type": options?.httpMetadata?.contentType ?? "application/octet-stream" },
    });
    if (!response.ok) throw new Error(`R2 upload failed (${response.status})`);
    const result = await response.json() as { success: boolean };
    if (!result.success) throw new Error("R2 upload failed");
  },
  async get(key: string) {
    const response = await cloudflare(objectPath(key));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`R2 receipt retrieval failed (${response.status})`);
    return { body: response.body, httpMetadata: { contentType: response.headers.get("content-type") ?? "application/octet-stream" } };
  },
  async delete(key: string) {
    const response = await cloudflare(objectPath(key), { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`R2 receipt deletion failed (${response.status})`);
  },
};

export const env = {
  // The existing app uses this subset of the Worker interfaces; the adapters are
  // deliberately not advertised as complete Cloudflare binding implementations.
  DB: database as unknown as D1Database,
  BUCKET: receiptBucket as unknown as R2Bucket,
};
