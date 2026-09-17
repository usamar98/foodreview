// Server routes only: secret keys bypass RLS, so every private query is scoped here.
import type { ReviewRepository, Row } from "@/lib/repository-types";

const diaryFields = "id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,status,decision_note,created_at";
const publicFields = "id,restaurant_id,visit_date,dish,return_visit,food,service,value,note,incentivized,relationship,status,created_at";
const quoted = (value: string) => JSON.stringify(value);

class SupabaseError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); this.name = "SupabaseError"; }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  if (typeof window !== "undefined") throw new Error("Supabase secrets are server-only");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure SUPABASE_URL and SUPABASE_SECRET_KEY in the server environment");
  if (!key.startsWith("sb_secret_") && !key.startsWith("eyJ")) throw new Error("Use a Supabase server secret key or legacy service-role JWT, never a publishable key");
  const base = new URL(url);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("SUPABASE_URL must be the HTTPS project origin");
  const headers = new Headers(init.headers);
  headers.set("apikey",key);
  // Modern sb_secret keys are API keys, not JWTs. Legacy service_role is a JWT.
  if (!key.startsWith("sb_secret_")) headers.set("Authorization",`Bearer ${key}`);
  const response = await fetch(new URL(path,base),{...init,headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)});
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => ({}));
    const error = result && typeof result === "object" ? result as Record<string,unknown> : {};
    // Avoid logging request headers or an upstream response that could contain keys.
    throw new SupabaseError(String(error.code ?? error.error ?? response.status),response.status,`Supabase request failed (${response.status}, ${String(error.code ?? "backend_error")})`);
  }
  return response;
}

async function rows(table: string, params: Record<string,string>): Promise<Row[]> {
  return (await request(`/rest/v1/${table}?${new URLSearchParams(params)}`)).json();
}
async function write(table: string, body: unknown, prefer = "return=minimal", params: Record<string,string> = {}) {
  await request(`/rest/v1/${table}?${new URLSearchParams(params)}`,{method:"POST",headers:{"Content-Type":"application/json",Prefer:prefer},body:JSON.stringify(body)});
}
async function rpc<T>(name: string, body: unknown): Promise<T> {
  return (await request(`/rest/v1/rpc/${name}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})).json();
}
function objectPath(key?: string) {
  const bucket = process.env.SUPABASE_RECEIPTS_BUCKET || "receipts";
  return `/storage/v1/object/${encodeURIComponent(bucket)}${key === undefined ? "" : "/" + key.split("/").map(encodeURIComponent).join("/")}`;
}

export const repository: ReviewRepository = {
  async state(userId, moderator) {
    const [restaurants,saved,profiles,diary,queue] = await Promise.all([
      rpc<Row[]>("savour_restaurants",{p_user_id:userId}),
      userId ? rows("saved",{select:"restaurant_id",user_id:`eq.${userId}`}) : Promise.resolve([]),
      userId ? rows("profiles",{select:"cuisine,budget,priority",user_id:`eq.${userId}`,limit:"1"}) : Promise.resolve([]),
      userId ? rows("reviews",{select:diaryFields,user_id:`eq.${userId}`,order:"created_at.desc",limit:"200"}) : Promise.resolve([]),
      moderator ? rows("reviews",{select:diaryFields,status:"eq.pending",order:"created_at.asc",limit:"100"}) : Promise.resolve([]),
    ]);
    return {restaurants,saved:saved.map(r=>String(r.restaurant_id)),profile:profiles[0] ?? null,diary,queue};
  },
  async restaurantVisible(id,userId) {
    return (await rows("restaurants",{select:"id",id:`eq.${id}`,or:`(listed.eq.1,creator.eq.${quoted(userId)})`,limit:"1"})).length > 0;
  },
  async findRestaurant(name,address,userId) {
    const result = await rpc<{id:string}[]>("savour_find_restaurant",{p_name:name,p_address:address,p_user_id:userId});
    return result[0]?.id ?? null;
  },
  async addRestaurant(row) { await write("restaurants",row); },
  async save(userId,restaurantId,saved) {
    if (saved) await write("saved",{user_id:userId,restaurant_id:restaurantId,created_at:new Date().toISOString()},"resolution=ignore-duplicates,return=minimal",{on_conflict:"user_id,restaurant_id"});
    else await request(`/rest/v1/saved?${new URLSearchParams({user_id:`eq.${userId}`,restaurant_id:`eq.${restaurantId}`})}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
  },
  async setProfile(userId,profile) {
    await write("profiles",{user_id:userId,...profile},"resolution=merge-duplicates,return=minimal",{on_conflict:"user_id"});
  },
  async duplicateReview(hash,userId,restaurantId,date) {
    return (await rows("reviews",{select:"id",or:`(receipt_hash.eq.${quoted(hash)},and(user_id.eq.${quoted(userId)},restaurant_id.eq.${quoted(restaurantId)},visit_date.eq.${quoted(date)}))`,limit:"1"})).length > 0;
  },
  async addReview(row) { await write("reviews",row); },
  async publicReviews(restaurantId) {
    return rows("reviews",{select:publicFields,restaurant_id:`eq.${restaurantId}`,status:"eq.verified",order:"visit_date.desc",limit:"100"});
  },
  async moderate(id,decision,reason,moderatorId) {
    return rpc<boolean>("savour_moderate_review",{p_id:id,p_decision:decision,p_reason:reason,p_moderator:moderatorId});
  },
  async receiptKey(id,userId,moderator) {
    const result = await rows("reviews",{select:"receipt_key",id:`eq.${id}`,...(moderator?{}:{user_id:`eq.${userId}`}),limit:"1"});
    return result[0] ? String(result[0].receipt_key) : null;
  },
  async putReceipt(key,bytes,contentType) {
    await request(objectPath(key),{method:"POST",headers:{"Content-Type":contentType,"x-upsert":"false","Cache-Control":"private, no-store"},body:bytes});
  },
  async getReceipt(key) {
    try {
      const response = await request(objectPath(key));
      return response.body ? {body:response.body,contentType:response.headers.get("Content-Type") ?? "application/octet-stream"} : null;
    } catch(error) {
      if (error instanceof SupabaseError && (error.status === 404 || ["not_found","NoSuchKey"].includes(error.code))) return null;
      throw error;
    }
  },
  async deleteReceipt(key) {
    await request(objectPath(),{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:[key]})});
  },
};
