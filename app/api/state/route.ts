import { getChatGPTUser } from "@/app/chatgpt-auth";
import { db } from "@/lib/store";
import { defaultProfile } from "@/lib/catalog";
import { failure } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET() {try {const user=await getChatGPTUser(), store=db();const [places,bookmarks,profile,diary,queue]=await Promise.all([
store.prepare(`SELECT r.*, COALESCE(a.yes,0) AS yes, COALESCE(a.count,0) AS count, COALESCE(a.food,0) AS food, COALESCE(a.service,0) AS service, COALESCE(a.value,0) AS value, a.lastVisit, COALESCE(x.excluded,0) AS excluded FROM restaurants r LEFT JOIN (SELECT restaurant_id, SUM(return_visit) AS yes, COUNT(*) AS count, AVG(food) AS food, AVG(service) AS service, AVG(value) AS value, MAX(visit_date) AS lastVisit FROM reviews WHERE status='verified' AND incentivized=0 AND relationship=0 AND visit_date>=date('now','-180 days') GROUP BY restaurant_id) a ON a.restaurant_id=r.id LEFT JOIN (SELECT restaurant_id,COUNT(*) AS excluded FROM reviews WHERE status='verified' AND (incentivized=1 OR relationship=1) GROUP BY restaurant_id) x ON x.restaurant_id=r.id WHERE r.listed=1 OR r.creator=? ORDER BY r.created_at DESC`).bind(user?.userId??"").all(),
user?store.prepare("SELECT restaurant_id FROM saved WHERE user_id=?").bind(user.userId).all():Promise.resolve({results:[]}),
user?store.prepare("SELECT cuisine,budget,priority FROM profiles WHERE user_id=?").bind(user.userId).first():Promise.resolve(null),
user?store.prepare("SELECT id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,status,decision_note,created_at FROM reviews WHERE user_id=? ORDER BY created_at DESC LIMIT 200").bind(user.userId).all():Promise.resolve({results:[]}),
// This initial owner-private pilot uses the Sites access policy for reviewer authorization.
// Before inviting other diners, replace this with a moderator allowlist.
user?store.prepare("SELECT id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,status,decision_note,created_at FROM reviews WHERE status='pending' ORDER BY created_at LIMIT 100").all():Promise.resolve({results:[]}),
]);return Response.json({restaurants:places.results.map(r=>({...r,demo:false,image:"",description:"A diner-submitted restaurant. Explore checked visits before deciding.",dish:""})),saved:bookmarks.results.map((r:Record<string,unknown>)=>r.restaurant_id),profile:profile??defaultProfile,diary:diary.results,queue:queue.results,signedIn:!!user},{headers:{"Cache-Control":"no-store"}});}catch(e){return failure(e);}}
