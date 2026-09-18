// Sites uses managed bindings. The Vercel build aliases this module to Supabase.
import { db, bucket } from "@/lib/store";
import type { ReviewRepository, Row } from "@/lib/repository-types";

const diaryFields = "id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,status,decision_note,created_at";

export const repository: ReviewRepository = {
  async catalogEvidence() {
    return (await db().prepare(`SELECT restaurant_id, SUM(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN return_visit ELSE 0 END) AS yes, SUM(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN 1 ELSE 0 END) AS count, COALESCE(AVG(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN food END),0) AS food, COALESCE(AVG(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN service END),0) AS service, COALESCE(AVG(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN value END),0) AS value, MAX(CASE WHEN incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') THEN visit_date END) AS lastVisit, SUM(CASE WHEN incentivized=1 OR relationship=1 THEN 1 ELSE 0 END) AS excluded FROM reviews WHERE status='verified' AND restaurant_id LIKE 'osm-%' GROUP BY restaurant_id`).all<Row>()).results;
  },
  async state(userId, moderator) {
    const store = db();
    const [places, saved, profile, diary, queue] = await Promise.all([
      store.prepare(`SELECT r.id,r.name,r.cuisine,r.city,r.neighborhood,r.address,r.price,r.listed,r.created_at, COALESCE(a.yes,0) AS yes, COALESCE(a.count,0) AS count, COALESCE(a.food,0) AS food, COALESCE(a.service,0) AS service, COALESCE(a.value,0) AS value, a.lastVisit, COALESCE(x.excluded,0) AS excluded FROM restaurants r LEFT JOIN (SELECT restaurant_id, SUM(return_visit) AS yes, COUNT(*) AS count, AVG(food) AS food, AVG(service) AS service, AVG(value) AS value, MAX(visit_date) AS lastVisit FROM reviews WHERE status='verified' AND incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') GROUP BY restaurant_id) a ON a.restaurant_id=r.id LEFT JOIN (SELECT restaurant_id,COUNT(*) AS excluded FROM reviews WHERE status='verified' AND (incentivized=1 OR relationship=1) GROUP BY restaurant_id) x ON x.restaurant_id=r.id WHERE r.listed=1 OR r.creator=? ORDER BY r.created_at DESC`).bind(userId ?? "").all<Row>(),
      userId ? store.prepare("SELECT restaurant_id FROM saved WHERE user_id=?").bind(userId).all<{restaurant_id:string}>() : Promise.resolve({results: []}),
      userId ? store.prepare("SELECT cuisine,budget,priority FROM profiles WHERE user_id=?").bind(userId).first<Row>() : Promise.resolve(null),
      userId ? store.prepare(`SELECT ${diaryFields} FROM reviews WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).bind(userId).all<Row>() : Promise.resolve({results: []}),
      moderator ? store.prepare(`SELECT ${diaryFields} FROM reviews WHERE status='pending' ORDER BY created_at LIMIT 100`).all<Row>() : Promise.resolve({results: []}),
    ]);
    return {restaurants: places.results, saved: saved.results.map(r => r.restaurant_id), profile, diary: diary.results, queue: queue.results};
  },
  async restaurantVisible(id, userId) {
    return !!await db().prepare("SELECT id FROM restaurants WHERE id=? AND (listed=1 OR creator=?)").bind(id,userId).first();
  },
  async findRestaurant(name, address, userId) {
    const row = await db().prepare("SELECT id FROM restaurants WHERE lower(name)=lower(?) AND lower(address)=lower(?) AND (listed=1 OR creator=?)").bind(name,address,userId).first<{id:string}>();
    return row?.id ?? null;
  },
  async addRestaurant(r) {
    await db().prepare("INSERT INTO restaurants(id,creator,name,cuisine,city,neighborhood,address,price,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(r.id,r.creator,r.name,r.cuisine,r.city,r.neighborhood,r.address,r.price,r.created_at).run();
  },
  async save(userId, restaurantId, saved) {
    if(saved) await db().prepare("INSERT OR IGNORE INTO saved(user_id,restaurant_id,created_at) VALUES(?,?,?)").bind(userId,restaurantId,new Date().toISOString()).run();
    else await db().prepare("DELETE FROM saved WHERE user_id=? AND restaurant_id=?").bind(userId,restaurantId).run();
  },
  async setProfile(userId,p) {
    await db().prepare("INSERT INTO profiles(user_id,cuisine,budget,priority) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET cuisine=excluded.cuisine,budget=excluded.budget,priority=excluded.priority").bind(userId,p.cuisine,p.budget,p.priority).run();
  },
  async duplicateReview(hash,userId,restaurantId,date) {
    return !!await db().prepare("SELECT id FROM reviews WHERE receipt_hash=? OR (user_id=? AND restaurant_id=? AND visit_date=?)").bind(hash,userId,restaurantId,date).first();
  },
  async addReview(r) {
    await db().prepare("INSERT INTO reviews(id,user_id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,receipt_key,receipt_hash,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id,r.user_id,r.restaurant_id,r.visit_date,r.dish,r.spend,r.return_visit,r.food,r.service,r.value,r.note,r.incentivized,r.relationship,r.receipt_key,r.receipt_hash,r.status,r.created_at).run();
  },
  async publicReviews(id) {
    return (await db().prepare("SELECT id,restaurant_id,visit_date,dish,return_visit,food,service,value,note,incentivized,relationship,status,created_at FROM reviews WHERE restaurant_id=? AND status='verified' ORDER BY visit_date DESC LIMIT 100").bind(id).all<Row>()).results;
  },
  async moderate(id,decision,reason,moderatorId) {
    const store = db();
    const results = await store.batch([
      store.prepare("UPDATE reviews SET status=?,decision_note=?,moderator=?,decided_at=? WHERE id=? AND status='pending'").bind(decision,reason,moderatorId,new Date().toISOString(),id),
      ...(decision === "verified" ? [store.prepare("UPDATE restaurants SET listed=1 WHERE id=(SELECT restaurant_id FROM reviews WHERE id=? AND status='verified')").bind(id)] : []),
    ]);
    return results[0].meta.changes > 0;
  },
  async receiptKey(id,userId,moderator) {
    const row = await db().prepare("SELECT receipt_key FROM reviews WHERE id=? AND (user_id=? OR ?=1)").bind(id,userId,moderator?1:0).first<{receipt_key:string}>();
    return row?.receipt_key ?? null;
  },
  async putReceipt(key,bytes,contentType) { await bucket().put(key,bytes,{httpMetadata:{contentType}}); },
  async getReceipt(key) {
    const object = await bucket().get(key);
    return object ? {body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream"} : null;
  },
  async deleteReceipt(key) { await bucket().delete(key); },
};
