export const cuisines = ["American","Italian","Pizza","Mexican","Chinese","Japanese","Sushi","Indian","Thai","Korean","Vietnamese","Mediterranean","Greek","Middle Eastern","Turkish","Lebanese","Caribbean","Jamaican","Cuban","Latin American","Peruvian","Brazilian","French","Spanish","Seafood","Steakhouse","Barbecue","Burgers","Sandwiches","Deli","Breakfast & brunch","Diner","Café","Bakery","Desserts","Ice cream","Vegetarian","Vegan","Ethiopian","African","Filipino","Pakistani","Nepalese","Halal","Kosher","Other"];
export const states = [{code:"NJ",name:"New Jersey"},{code:"NY",name:"New York"},{code:"CA",name:"California"}];
const tags = {american:"American",italian:"Italian",pizza:"Pizza",mexican:"Mexican",tex_mex:"Mexican",chinese:"Chinese",japanese:"Japanese",sushi:["Sushi","Japanese"],indian:"Indian",thai:"Thai",korean:"Korean",vietnamese:"Vietnamese",mediterranean:"Mediterranean",greek:"Greek",middle_eastern:"Middle Eastern",arab:"Middle Eastern",turkish:"Turkish",lebanese:"Lebanese",caribbean:"Caribbean",jamaican:["Jamaican","Caribbean"],cuban:"Cuban",latin_american:"Latin American",peruvian:"Peruvian",brazilian:"Brazilian",french:"French",spanish:"Spanish",tapas:"Spanish",seafood:"Seafood",fish:"Seafood",steak_house:"Steakhouse",steak:"Steakhouse",bbq:"Barbecue",barbecue:"Barbecue",burger:"Burgers",burgers:"Burgers",sandwich:"Sandwiches",sandwiches:"Sandwiches",deli:"Deli",breakfast:"Breakfast & brunch",brunch:"Breakfast & brunch",diner:"Diner",coffee_shop:"Café",coffee:"Café",bakery:"Bakery",dessert:"Desserts",desserts:"Desserts",ice_cream:"Ice cream",vegetarian:"Vegetarian",vegan:"Vegan",ethiopian:"Ethiopian",african:"African",filipino:"Filipino",pakistani:"Pakistani",nepalese:"Nepalese",halal:"Halal",kosher:"Kosher"};
export function cuisineLabels(t) {
  const result = String(t.cuisine || "").toLowerCase().split(/[;,]/).flatMap(tag => tags[tag.trim()] || []).filter(Boolean);
  if(t.amenity === "cafe") result.push("Café");
  if(t.shop === "bakery") result.push("Bakery");
  if(t.amenity === "ice_cream") result.push("Ice cream");
  if(["yes","only"].includes(t["diet:vegan"])) result.push("Vegan");
  if(["yes","only"].includes(t["diet:vegetarian"])) result.push("Vegetarian");
  if(["yes","only"].includes(t["diet:halal"])) result.push("Halal");
  if(["yes","only"].includes(t["diet:kosher"])) result.push("Kosher");
  return [...new Set(result.length ? result : ["Other"])];
}
