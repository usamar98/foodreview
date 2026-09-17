import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real, isolated PostgreSQL engine. The storage bucket catalog is simulated;
// uploads/downloads are covered separately by check-vercel.mjs.
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  await db.exec(await readFile(new URL("../supabase/schema.sql",import.meta.url),"utf8"));
  const query = async (sql,params=[]) => (await db.query(sql,params)).rows;
  const scalar = async (sql,params=[]) => Object.values((await query(sql,params))[0])[0];

  assert.equal(await scalar("select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity"),4);
  for (const role of ["anon","authenticated"]) {
    for (const table of ["restaurants","profiles","saved","reviews"]) assert.equal(await scalar("select has_table_privilege($1,$2,'SELECT')",[role,`public.${table}`]),false);
    for (const fn of ["savour_restaurants(text)","savour_find_restaurant(text,text,text)","savour_moderate_review(text,text,text,text)"]) assert.equal(await scalar("select has_function_privilege($1,$2,'EXECUTE')",[role,`public.${fn}`]),false);
  }
  assert.equal(await scalar("select public from storage.buckets where id='receipts'"),false);
  await db.exec("set role service_role");
  await db.query("insert into public.restaurants(id,creator,name,cuisine,city,neighborhood,address,price) values ('place-1','github:123','Diner','Italian','London','Soho','10 Test Street',20),('private-1','github:456','Hidden','Italian','London','Soho','12 Test Street',30)");
  assert.equal((await query("select * from public.savour_restaurants(null)")).length,0);
  assert.deepEqual((await query("select id from public.savour_restaurants('github:123')")).map(r=>r.id),["place-1"]);
  assert.equal((await query("select id from public.savour_find_restaurant('DINER','10 TEST STREET','github:123')"))[0].id,"place-1");
  assert.equal((await query("select id from public.savour_find_restaurant('D%','10 TEST STREET','github:123')")).length,0);
  assert.equal((await query("select id from public.savour_find_restaurant('Hidden','12 Test Street','github:123')")).length,0);

  const insert = async (id,user,date,hash,status="pending",incentive=0,relationship=0,returns=1) => db.query(`
    insert into public.reviews (id,user_id,restaurant_id,visit_date,dish,spend,return_visit,food,service,value,note,incentivized,relationship,receipt_key,receipt_hash,status,decision_note,moderator,decided_at)
    values ($1,$2,'place-1',(now() at time zone 'UTC')::date - $3::int,'Pasta',20,$8,4,3,5,'A useful honest review',$6,$7,'receipts/'||$1,$4,$5,
      case when $5 <> 'pending' then 'Checked synthetic receipt' end,case when $5 <> 'pending' then 'github:999' end,case when $5 <> 'pending' then now() end)`,[id,user,date,hash,status,incentive,relationship,returns]);
  await insert("review-1","github:123",1,"hash-1");
  await assert.rejects(insert("duplicate-1","github:456",2,"hash-1"),e=>e.code==="23505");
  await assert.rejects(insert("duplicate-2","github:123",1,"other-hash"),e=>e.code==="23505");
  await insert("pending","github:2",2,"hash-2");
  await insert("rejected","github:3",3,"hash-3","rejected");
  await insert("incentive","github:4",4,"hash-4","verified",1);
  await insert("relationship","github:5",5,"hash-5","verified",0,1);
  await insert("old","github:6",181,"hash-6","verified");
  await insert("boundary","github:7",180,"hash-7","verified",0,0,0);
  assert.equal(await scalar("select public.savour_moderate_review('review-1','verified','Receipt checked and matched','github:999')"),true);
  assert.equal(await scalar("select public.savour_moderate_review('review-1','rejected','Attempted changed decision','github:999')"),false);
  assert.equal(await scalar("select public.savour_moderate_review('missing','verified','Receipt checked and matched','github:999')"),false);
  await assert.rejects(query("select public.savour_moderate_review('pending','verified','short','github:999')"),e=>e.code==="22023");
  const decision=(await query("select status,decision_note,moderator,decided_at from public.reviews where id='review-1'"))[0];
  assert.equal(decision.status,"verified");
  assert.equal(decision.decision_note,"Receipt checked and matched");
  assert.equal(decision.moderator,"github:999");
  assert.ok(decision.decided_at);
  const place=(await query("select * from public.savour_restaurants(null)"))[0];
  assert.equal(place.id,"place-1");
  assert.equal(place.listed,1);
  assert.equal(Number(place.count),2);
  assert.equal(Number(place.yes),1);
  assert.equal(Number(place.excluded),2);
  assert.equal(place.food,4);
  assert.equal(place.service,3);
  assert.equal(place.value,5);
  for(const field of ["creator","receipt_key","receipt_hash","user_id"]) assert.ok(!(field in place));

  await db.query("insert into public.saved(user_id,restaurant_id) values ('github:123','sample-casa') on conflict(user_id,restaurant_id) do nothing");
  await db.query("insert into public.saved(user_id,restaurant_id) values ('github:123','sample-casa') on conflict(user_id,restaurant_id) do nothing");
  assert.equal(await scalar("select count(*)::int from public.saved where user_id='github:123'"),1);
  await db.query("insert into public.profiles(user_id,cuisine,budget,priority) values ('github:123','Any',40,'food') on conflict(user_id) do update set cuisine=excluded.cuisine,budget=excluded.budget,priority=excluded.priority");
  await db.query("insert into public.profiles(user_id,cuisine,budget,priority) values ('github:123','Italian',25,'value') on conflict(user_id) do update set cuisine=excluded.cuisine,budget=excluded.budget,priority=excluded.priority");
  assert.equal(await scalar("select budget from public.profiles where user_id='github:123'"),25);
  console.log("PostgreSQL schema checks passed: RLS/grants, visibility, duplicate constraints, immutable decisions, atomic listing, score exclusions, saves and preferences.");
} finally { await db.close(); }
