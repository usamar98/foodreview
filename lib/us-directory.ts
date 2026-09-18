// Server-side ID lookup from the same public snapshot the discovery page loads.
import snapshot from "@/public/data/restaurants-us.json";
import {directoryRestaurants,type DirectoryData} from "@/lib/catalog";
const venues = new Map(directoryRestaurants(snapshot as DirectoryData).map(v=>[v.id,v]));
export function directoryRestaurant(id:string) {return venues.get(id);}
const normalize=(v:string)=>v.toLowerCase().replace(/\s+/g," ").trim();
const addresses=new Map((snapshot as DirectoryData).venues.map(v=>[normalize(`${v.name}|${v.address}|${v.city}, ${v.state}`),v.id]));
export function directoryMatch(name:string,address:string,city:string) {return addresses.get(normalize(`${name}|${address}|${city}`));}
