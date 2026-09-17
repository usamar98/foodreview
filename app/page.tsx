import SavourApp from "@/components/savour-app";
import { getChatGPTUser, chatGPTSignInPath } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
const user = await getChatGPTUser();
return <SavourApp initialUser={user?{name:user.fullName??"You"}:null} signInPath={chatGPTSignInPath("/")} signInLabel={process.env.SAVOUR_RUNTIME === "vercel" ? "Sign in with GitHub" : "Sign in with ChatGPT"}/>;
}
