import { VERSION } from "../dist/index.mjs";
import "../dist/mcp.mjs";
import "../dist/codegen.mjs";

if (typeof VERSION !== "string") {
	console.error("ESM smoke FAIL: VERSION is not a string");
	process.exit(1);
}

console.log("ESM smoke OK");
