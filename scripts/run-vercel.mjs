import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command)) throw new Error("Expected dev, build, or start.");
// Mark only this process and its children; Sites keeps its existing runtime.
process.env.SAVOUR_RUNTIME = "vercel";
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command, ...args];
await import(cli.href);
