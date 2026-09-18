import { getChatGPTUser } from "@/app/chatgpt-auth";
import { repository } from "@/lib/repository";
import { defaultProfile } from "@/lib/catalog";
import { isModerator } from "@/lib/permissions";
import { failure } from "@/lib/api";
import {directoryRestaurant} from "@/lib/us-directory";
export const dynamic="force-dynamic";
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const moderator = isModerator(user);
    const [state,evidence] = await Promise.all([repository.state(user?.userId ?? null, moderator),repository.catalogEvidence()]);
    return Response.json({
      ...state,
      restaurants: [...state.restaurants.map(r => {
        const match=String(r.city).match(/^(.*), (NJ|NY|CA)$/);
        return {...r,city:match?.[1]??r.city,state:match?.[2],currency:match?"USD":"GBP",demo:false,image:"",description:"A diner-submitted restaurant. Explore checked visits before deciding.",dish:""};
      }),...evidence.flatMap(score=>{
        const venue=directoryRestaurant(String(score.restaurant_id));
        return venue?[{...venue,...score}]:[];
      })],
      profile: state.profile ?? defaultProfile,
      signedIn: !!user,
      moderator,
    }, {headers:{"Cache-Control":"no-store"}});
  } catch(error) { return failure(error); }
}
