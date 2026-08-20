import fs from "node:fs";

const regionsPath = "client/src/lib/regions.data.json";
const sourcePath = "client/src/lib/algeria_communes.source.json";
const regions = JSON.parse(fs.readFileSync(regionsPath, "utf8"));
const communes = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const algeria = regions.Algeria;
if (!algeria) throw new Error("Algeria record not found");

const aliases = {
  Alger: "Algiers",
  "Bordj Bou Arreridj": "Bordj Bou Arréridj",
  "Ain Salah": "In Salah",
  "Ain Guezzam": "In Guezzam",
  "El Meghaier": "El M'Ghair",
  "El Menia": "El Meniaa",
  "Ain Oussera": "Aïn Oussera",
  "Boussaâda": "Bou Saâda",
};

const grouped = new Map();
for (const commune of communes) {
  const sourceName = commune.wilaya_name_fr;
  const targetName = aliases[sourceName] ?? sourceName;
  if (!grouped.has(targetName)) grouped.set(targetName, []);
  const arabic = String(commune.commune_name ?? "").trim();
  const latin = String(commune.commune_name_fr ?? "").trim();
  const label = arabic && latin && arabic !== latin ? `${latin} — ${arabic}` : latin || arabic;
  if (label) grouped.get(targetName).push(label);
}

const missing = Object.keys(algeria.states).filter((state) => !grouped.has(state));
const extra = [...grouped.keys()].filter((state) => !(state in algeria.states));
if (missing.length || extra.length) {
  throw new Error(`Wilaya mapping mismatch. Missing: ${missing.join(", ")}; Extra: ${extra.join(", ")}`);
}

for (const state of Object.keys(algeria.states)) {
  const unique = [...new Set(grouped.get(state))].sort((a, b) => a.localeCompare(b, "ar"));
  algeria.states[state] = unique;
}

fs.writeFileSync(regionsPath, `${JSON.stringify(regions, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  wilayas: Object.keys(algeria.states).length,
  communes: Object.values(algeria.states).reduce((sum, values) => sum + values.length, 0),
}, null, 2));
