const { VERSION } = require("../dist/index.cjs");
require("../dist/mcp.cjs");
require("../dist/codegen.cjs");

if (typeof VERSION !== "string") {
	console.error("CJS smoke FAIL: VERSION is not a string");
	process.exit(1);
}

console.log("CJS smoke OK");
