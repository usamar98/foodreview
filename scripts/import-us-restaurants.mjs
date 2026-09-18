import {mkdir,readFile,writeFile} from "node:fs/promises";
import {states,cuisineLabels} from "../lib/cuisines.mjs";

const endpoint = process.argv.includes("--endpoint") ? process.argv[process.argv.indexOf("--endpoint")+1] : process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const limit = 3000; // Diverse, bounded snapshot, not a claim of complete coverage.
await mkdir("work/osm",{recursive:true});
await mkdir("public/data",{recursive:true});
const venues = [];
const snapshots = [];
const clean = v => String(v || "").replace(/\s+/g," ").trim();
async function extract(query,label) {
  const response = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json","User-Agent":"Savour-directory-import/1.0 (one-time open-data snapshot)"},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(180000)});
  if(!response.ok) throw new Error(`Overpass returned ${response.status} for ${label}`);
  const data=await response.json();
  if(data.remark || !Array.isArray(data.elements)) throw new Error(`Incomplete Overpass response for ${label}: ${data.remark ?? "no elements"}`);
  return data;
}
for(const state of states) {
  const query = `[out:json][timeout:150];area["ISO3166-2"="US-${state.code}"]["admin_level"="4"]->.state;(nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]["name"](area.state);nwr["shop"="bakery"]["name"](area.state););out center tags;`;
  const path = `work/osm/${state.code}.json`;
  let data;
  try { data = JSON.parse(await readFile(path,"utf8")); }
  catch {
    console.log(`Fetching named food venues in ${state.name}...`);
    if(state.code === "CA") {
      // Explicit state-address tags avoid traversing the large state polygon.
      const addressQuery='[out:json][timeout:120];(nwr["addr:state"="CA"]["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]["name"];nwr["addr:state"="CA"]["shop"="bakery"]["name"];);out center tags;';
      data=await extract(addressQuery,state.name);
      data.queries=[addressQuery];
      data.coverage=["California: venues explicitly tagged with addr:state=CA"];
    } else data = await extract(query,state.name);
    await writeFile(path,JSON.stringify(data));
  }
  const unique = new Map();
  for(const e of data.elements) {
    const t=e.tags || {},lat=e.lat ?? e.center?.lat,lon=e.lon ?? e.center?.lon;
    if(!clean(t.name) || !Number.isFinite(lat) || !Number.isFinite(lon) || t.disused === "yes" || t.abandoned === "yes" || t.closed === "yes" || t.opening_hours === "closed" || (t.amenity && (t["disused:amenity"]===t.amenity || t["abandoned:amenity"]===t.amenity))) continue;
    if(state.code==="CA" && (lat<32.4||lat>42.1||lon< -124.6||lon> -114))continue;
    const city=clean(t["addr:city"] || t["is_in:city"]);
    const street=clean(t["addr:street"]);
    // Keep listings with usable address metadata; no reverse-geocoding guesses.
    if(!city || !street) continue;
    const address=clean([t["addr:housenumber"],street].filter(Boolean).join(" "));
    const categories=cuisineLabels(t);
    const name=clean(t.name);
    const normalizedName=name.toLowerCase().replace(/^[\s"'“”‘’()]+|[\s"'“”‘’()]+$/g,"");
    if(/^(empty|for rent|vacant|closed|unnamed|unknown|no name|not known|tbd|unoccupied|space available|restaurant|cafe|café)$/.test(normalizedName))continue;
    const dedup=`${name.toLowerCase()}|${address.toLowerCase()}|${city.toLowerCase()}`;
    const v={id:`osm-${e.type}-${e.id}`,name,state:state.code,city,address,categories,lat,lon};
    if(t["addr:postcode"])v.postcode=clean(t["addr:postcode"]);
    if(t["addr:suburb"] || t["addr:neighbourhood"])v.neighborhood=clean(t["addr:suburb"] || t["addr:neighbourhood"]);
    const website=clean(t.website || t["contact:website"]);
    try {const u=new URL(website);if(["https:","http:"].includes(u.protocol) && !u.username && !u.password)v.website=u.href;} catch {}
    if(!unique.has(dedup)) unique.set(dedup,v);
  }
  // Round-robin city/cuisine groups so small cities and rarer cuisines survive.
  const groups = new Map();
  for(const v of [...unique.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id))) {
    const group=`${v.city.toLowerCase()}|${v.categories[0]}`;
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(v);
  }
  const selected=[];let index=0;
  while(selected.length < limit) {
    let added=false;
    for(const group of groups.values()) {if(group[index]){selected.push(group[index]);added=true;}if(selected.length===limit)break;}
    if(!added)break;
    index++;
  }
  venues.push(...selected);
  snapshots.push({state:state.code,name:state.name,imported:selected.length,eligible:unique.size,coverage:data.coverage??[state.name],osmTimestamp:data.osm3s?.timestamp_osm_base,queries:data.queries??[query]});
  console.log(`${state.name}: ${selected.length} address-bearing venues, ${new Set(selected.map(v=>v.city)).size} cities, ${new Set(selected.flatMap(v=>v.categories)).size} categories.`);
}
const output={version:1,importedAt:new Date().toISOString(),source:"OpenStreetMap contributors",sourceUrl:"https://www.openstreetmap.org/copyright",license:"ODbL-1.0",licenseUrl:"https://opendatacommons.org/licenses/odbl/1-0/",snapshots,venues};
await writeFile("public/data/restaurants-us.json",JSON.stringify(output)+"\n");
console.log(`Saved ${venues.length} real venue listings. No ratings, prices, photos or reviews were invented.`);
