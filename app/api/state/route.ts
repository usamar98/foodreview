import { getChatGPTUser } from "@/app/chatgpt-auth";
import { repository } from "@/lib/repository";
import { defaultProfile } from "@/lib/catalog";
import { isModerator } from "@/lib/permissions";
import { failure } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET() {
  try {
    const user = await getChatGPTUser();
    const moderator = isModerator(user);
    const state = await repository.state(user?.userId ?? null, moderator);
    return Response.json({
      ...state,
      restaurants: state.restaurants.map(r => ({...r,demo:false,image:"",description:"A diner-submitted restaurant. Explore checked visits before deciding.",dish:""})),
      profile: state.profile ?? defaultProfile,
      signedIn: !!user,
      moderator,
    }, {headers:{"Cache-Control":"no-store"}});
  } catch(error) { return failure(error); }
}
