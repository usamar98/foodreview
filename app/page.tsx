import SavourApp from "@/components/savour-app";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
const user = await getChatGPTUser();
return <SavourApp initialUser={user?{name:user.fullName??"You"}:null}/>;
}
