import fs from "node:fs";
import path from "node:path";

const roots = ["client", "server", "shared", "vite.config.ts", "package.json"];
const forbidden = [
  "WebDevAuth" + "PublicService",
  "BUILT_IN_" + "FORGE_API_URL",
  "BUILT_IN_" + "FORGE_API_KEY",
  "OAUTH_" + "SERVER_URL",
  "VITE_" + "APP_ID",
  "vite-plugin-" + "manus-runtime",
  "/" + "manus-storage/",
  "__" + "manus__",
];

function filesUnder(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const result = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (["node_modules", "dist", ".git"].includes(entry.name)) continue;
    result.push(...filesUnder(path.join(target, entry.name)));
  }
  return result;
}

const hits = [];
for (const root of roots) {
  for (const file of filesUnder(path.resolve(root))) {
    const text = fs.readFileSync(file, "utf8");
    for (const token of forbidden) {
      if (text.includes(token)) hits.push(`${file}: ${token}`);
    }
  }
}

if (hits.length) {
  console.error("Manus dependency scan failed:");
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}

console.log("No forbidden Manus runtime references found.");
