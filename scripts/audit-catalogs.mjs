import fs from "node:fs";
const regions = JSON.parse(fs.readFileSync("client/src/lib/regions.data.json", "utf8"));
const countryNames = Object.keys(regions);
let states = 0;
let cities = 0;
const stateNames = new Set();
for (const value of Object.values(regions)) {
  const map = value?.states ?? {};
  states += Object.keys(map).length;
  for (const [state, cityList] of Object.entries(map)) {
    stateNames.add(state);
    cities += Array.isArray(cityList) ? cityList.length : 0;
  }
}
const regionsSource = fs.readFileSync("client/src/lib/regions.ts", "utf8");
const languageCodes = [...regionsSource.matchAll(/^  ([A-Za-z0-9_]+): \{/gm)].map(m => m[1]);
console.log(JSON.stringify({countries: countryNames.length, states, cities, languages: languageCodes.length, duplicateLanguageCodes: languageCodes.length - new Set(languageCodes).size, firstCountries: countryNames.slice(0, 5), lastCountries: countryNames.slice(-5)}, null, 2));
if (countryNames.length < 195) process.exitCode = 2;
if (languageCodes.length < 180) process.exitCode = 3;
