import fs from "node:fs";
const path = "client/src/lib/regions.data.json";
const backup = `${path}.bak`;
const regions = JSON.parse(fs.readFileSync(path, "utf8"));
if (Object.prototype.hasOwnProperty.call(regions, "")) delete regions[""];
fs.copyFileSync(path, backup);
fs.writeFileSync(path, `${JSON.stringify(regions)}\n`);
console.log(`Cleaned ${path}; countries=${Object.keys(regions).length}; backup=${backup}`);
