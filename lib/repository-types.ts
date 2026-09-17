export type Row = Record<string, unknown>;
export type Profile = { cuisine: string; budget: number; priority: string };
export type RestaurantInput = { id: string; creator: string; name: string; cuisine: string; city: string; neighborhood: string; address: string; price: number; created_at: string };
export type ReviewInput = { id: string; user_id: string; restaurant_id: string; visit_date: string; dish: string; spend: number; return_visit: number; food: number; service: number; value: number; note: string; incentivized: number; relationship: number; receipt_key: string; receipt_hash: string; status: "pending"; created_at: string };
export interface ReviewRepository {
  state(userId: string | null, moderator: boolean): Promise<{ restaurants: Row[]; saved: string[]; profile: Row | null; diary: Row[]; queue: Row[] }>;
  restaurantVisible(id: string, userId: string): Promise<boolean>;
  findRestaurant(name: string, address: string, userId: string): Promise<string | null>;
  addRestaurant(row: RestaurantInput): Promise<void>;
  save(userId: string, restaurantId: string, saved: boolean): Promise<void>;
  setProfile(userId: string, profile: Profile): Promise<void>;
  duplicateReview(hash: string, userId: string, restaurantId: string, date: string): Promise<boolean>;
  addReview(row: ReviewInput): Promise<void>;
  publicReviews(restaurantId: string): Promise<Row[]>;
  moderate(id: string, decision: "verified" | "rejected", reason: string, moderatorId: string): Promise<boolean>;
  receiptKey(id: string, userId: string, moderator: boolean): Promise<string | null>;
  putReceipt(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  getReceipt(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  deleteReceipt(key: string): Promise<void>;
}

export function isDuplicateError(error: unknown): boolean {
  return (error instanceof Error && "code" in error && error.code === "23505") || String(error).includes("UNIQUE");
}
