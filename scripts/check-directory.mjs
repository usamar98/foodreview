import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {directoryEvidence} from "../lib/evidence.mjs";
import {cuisines,states} from "../lib/cuisines.mjs";
const data=JSON.parse(await readFile(new URL("../public/data/restaurants-us.json",import.meta.url),"utf8"));
const source=await readFile(new URL("../lib/catalog.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {directoryRestaurants,mergeRestaurants,tasteFit,mealPrice,restaurantSearchText}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
assert.equal(data.license,"ODbL-1.0");
assert.ok(data.sourceUrl.startsWith("https://www.openstreetmap.org/"));
assert.ok(data.venues.length>=6000,"A substantial real directory was imported");
const ids=new Set();
for(const v of data.venues){
  assert.ok(!ids.has(v.id),"No duplicate source IDs");ids.add(v.id);
  assert.match(v.id,/^osm-(node|way|relation)-\d+$/);
  assert.ok(v.name && v.city && v.address && v.categories.length);
  assert.ok(!/^(empty|for rent|vacant|closed|unnamed|unknown|no name|tbd)$/.test(v.name.toLowerCase().replace(/^[\s"'“”‘’()]+|[\s"'“”‘’()]+$/g,"")),"Placeholder venues are excluded");
  assert.ok(states.some(s=>s.code===v.state));
  assert.ok(v.categories.every(c=>cuisines.includes(c)));
  const bounds={NJ:[38.8,41.5,-75.7,-73.8],NY:[40.3,45.1,-80,-71.7],CA:[32.4,42.1,-124.6,-114]}[v.state];
  assert.ok(v.lat>=bounds[0]&&v.lat<=bounds[1]&&v.lon>=bounds[2]&&v.lon<=bounds[3],`${v.name} is within the imported state bounds`);
  for(const field of ["price","rating","count","yes","reviews"])assert.ok(!(field in v),"No invented review evidence or price");
  if(v.website)assert.match(v.website,/^https?:\/\//);
}
for(const state of states){const venues=data.venues.filter(v=>v.state===state.code);assert.ok(venues.length>=2000);assert.equal(data.snapshots.find(s=>s.state===state.code).imported,venues.length);assert.ok(new Set(venues.map(v=>v.city)).size>100);}
const restaurants=directoryRestaurants(data);
for(const r of restaurants){assert.equal(r.count,0);assert.equal(r.price,null);assert.equal(r.demo,false);assert.equal(r.currency,"USD");assert.equal(mealPrice(r),"Price not reported");assert.equal(tasteFit(r,{cuisine:"Any",budget:40,priority:"food"}).reasons.includes("Within your $40 budget"),false);}
const sushi=restaurants.find(r=>r.categories.includes("Sushi"));assert.ok(sushi);assert.ok(restaurantSearchText(sushi).includes("sushi"));assert.ok(tasteFit(sushi,{cuisine:"Sushi",budget:40,priority:"food"}).reasons.includes("Sushi is your kind of food"));
const v=restaurants[0];
const merged=mergeRestaurants(restaurants,[{...v,count:2,yes:1}],false);
assert.equal(merged.length,restaurants.length);assert.equal(merged.find(r=>r.id===v.id).count,2);assert.ok(merged.find(r=>r.id===v.id).sourceUrl);
const reviewed=(days,extra={})=>({restaurant_id:v.id,visit_date:new Date(Date.UTC(2026,8,18)-days*86400000).toISOString().slice(0,10),status:"verified",return_visit:1,food:4,service:3,value:5,incentivized:0,relationship:0,...extra});
const evidence=directoryEvidence([reviewed(1),reviewed(180,{return_visit:0}),reviewed(181),reviewed(2,{status:"pending"}),reviewed(3,{status:"rejected"}),reviewed(4,{incentivized:1}),reviewed(5,{relationship:1})],new Date("2026-09-18T12:00:00Z"))[0];
assert.equal(evidence.count,2);assert.equal(evidence.yes,1);assert.equal(evidence.excluded,2);assert.equal(evidence.food,4);
console.log(`Directory checks passed: ${restaurants.length.toLocaleString()} real listings, ${new Set(data.venues.flatMap(v=>v.categories)).size} categories, 3 states, deduplication, honest prices, source attribution and checked-review aggregation.`);
