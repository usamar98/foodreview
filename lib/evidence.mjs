// Only checked visits contribute. Directory listings never carry invented scores.
export function directoryEvidence(reviews, now = new Date()) {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()) - 180 * 86400000).toISOString().slice(0,10);
  const scores = new Map();
  for(const r of reviews) {
    if(r.status !== "verified" || !String(r.restaurant_id).startsWith("osm-"))continue;
    if(!scores.has(r.restaurant_id))scores.set(r.restaurant_id,{restaurant_id:r.restaurant_id,yes:0,count:0,food:0,service:0,value:0,lastVisit:null,excluded:0});
    const score=scores.get(r.restaurant_id);
    if(r.incentivized || r.relationship){score.excluded++;continue;}
    if(r.visit_date < cutoff)continue;
    score.count++;score.yes+=r.return_visit;score.food+=r.food;score.service+=r.service;score.value+=r.value;
    if(!score.lastVisit || r.visit_date > score.lastVisit)score.lastVisit=r.visit_date;
  }
  return [...scores.values()].map(s=>({...s,food:s.count?s.food/s.count:0,service:s.count?s.service/s.count:0,value:s.count?s.value/s.count:0}));
}
