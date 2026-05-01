require("dotenv").config();
const fs = require("fs");
const path = require("path");

const backendUrl = String(
  process.env.EXTENSION_BACKEND_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3001"
).trim();

const targetPath = path.join(__dirname, "..", "extension", "config.js");
const content = `window.PUMPCAST_CONFIG = Object.assign({}, window.PUMPCAST_CONFIG, {
  BACKEND_URL: ${JSON.stringify(backendUrl)}
});
`;

fs.writeFileSync(targetPath, content, "utf8");
console.log(`Wrote ${targetPath} with BACKEND_URL=${backendUrl}`);
