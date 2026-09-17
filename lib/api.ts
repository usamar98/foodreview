import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isModerator } from "@/lib/permissions";
export class ApiError extends Error { constructor(public status:number,message:string) {super(message);} }
export async function identity() { const user=await getChatGPTUser();if(!user)throw new ApiError(401,"Sign in to save places or contribute a visit.");return user; }
export async function moderator() { const user=await identity();if(!isModerator(user))throw new ApiError(403,"A moderator account is required.");return user; }
export function mutationOrigin(request:Request) { const origin=request.headers.get("origin");const expected=process.env.SAVOUR_RUNTIME==="vercel"&&process.env.AUTH_URL?new URL(process.env.AUTH_URL).origin:new URL(request.url).origin;if(!origin||origin!==expected)throw new ApiError(403,"Please submit from Savour."); }
export function failure(error:unknown) { if(error instanceof ApiError)return Response.json({error:error.message},{status:error.status});console.error("Savour request failed",error);return Response.json({error:"We couldn’t reach the review store. Your input is still here. Please try again."},{status:503}); }
