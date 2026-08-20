import fs from "node:fs";
import path from "node:path";

const file = path.resolve("client/src/lib/regions.data.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const cities = {
  Adrar: ["Adrar", "Reggane"], Chlef: ["Chlef", "Ténès"], Laghouat: ["Laghouat", "Aflou"],
  "Oum El Bouaghi": ["Oum El Bouaghi", "Aïn Beïda"], Batna: ["Batna", "Barika"], Béjaïa: ["Béjaïa", "Akbou"],
  Biskra: ["Biskra", "Tolga"], Béchar: ["Béchar", "Kenadsa"], Blida: ["Blida", "Boufarik"], Bouira: ["Bouira", "Sour El-Ghozlane"],
  Tamanrasset: ["Tamanrasset", "In Amguel"], Tébessa: ["Tébessa", "Bir El Ater"], Tlemcen: ["Tlemcen", "Maghnia"],
  Tiaret: ["Tiaret", "Frenda"], "Tizi Ouzou": ["Tizi Ouzou", "Azazga"], Algiers: ["Algiers", "Bab El Oued", "Hussein Dey"],
  Djelfa: ["Djelfa", "Aïn Oussera"], Jijel: ["Jijel", "Taher"], Sétif: ["Sétif", "El Eulma"], Saïda: ["Saïda", "Aïn El Hadjar"],
  Skikda: ["Skikda", "Collo"], "Sidi Bel Abbès": ["Sidi Bel Abbès", "Télagh"], Annaba: ["Annaba", "El Hadjar"],
  Guelma: ["Guelma", "Bouchegouf"], Constantine: ["Constantine", "El Khroub"], Médéa: ["Médéa", "Berrouaghia"],
  Mostaganem: ["Mostaganem", "Aïn Tédelès"], "M'Sila": ["M'Sila", "Bou Saâda"], Mascara: ["Mascara", "Mohammadia"],
  Ouargla: ["Ouargla", "Hassi Messaoud"], Oran: ["Oran", "Es Sénia"], "El Bayadh": ["El Bayadh", "Brezina"],
  Illizi: ["Illizi", "In Amenas"], "Bordj Bou Arréridj": ["Bordj Bou Arréridj", "Ras El Oued"], Boumerdès: ["Boumerdès", "Dellys"],
  "El Tarf": ["El Tarf", "El Kala"], Tindouf: ["Tindouf"], Tissemsilt: ["Tissemsilt", "Theniet El Had"],
  "El Oued": ["El Oued", "Guemar"], Khenchela: ["Khenchela", "Kais"], "Souk Ahras": ["Souk Ahras", "Sedrata"],
  Tipaza: ["Tipaza", "Cherchell"], Mila: ["Mila", "Ferdjioua"], "Aïn Defla": ["Aïn Defla", "Khemis Miliana"],
  Naâma: ["Naâma", "Mécheria"], "Aïn Témouchent": ["Aïn Témouchent", "Béni Saf"], Ghardaïa: ["Ghardaïa", "Berriane"],
  Relizane: ["Relizane", "Mazouna"], Timimoun: ["Timimoun", "Charouine"], "Bordj Badji Mokhtar": ["Bordj Badji Mokhtar"],
  "Ouled Djellal": ["Ouled Djellal", "Sidi Khaled"], "Béni Abbès": ["Béni Abbès", "Kerzaz"], "In Salah": ["In Salah", "Foggaret Ezzoua"],
  "In Guezzam": ["In Guezzam", "Tin Zaouatine"], Touggourt: ["Touggourt", "Temacine"], Djanet: ["Djanet", "Bordj El Haouasse"],
  "El M'Ghair": ["El M'Ghair", "Djamaa"], "El Meniaa": ["El Meniaa", "Hassi Gara"],
  Aflou: ["Aflou"], "El Abiodh Sidi Cheikh": ["El Abiodh Sidi Cheikh"], "El Aricha": ["El Aricha"], "El Kantara": ["El Kantara"],
  Barika: ["Barika"], "Bou Saâda": ["Bou Saâda"], "Bir El Ater": ["Bir El Ater"], "Ksar El Boukhari": ["Ksar El Boukhari"],
  "Ksar Chellala": ["Ksar Chellala"], "Aïn Oussera": ["Aïn Oussera"], Messaad: ["Messaad"],
};
const states = Object.fromEntries(Object.entries(cities).map(([state, values]) => [state, values]));
data.Algeria = { states };
fs.writeFileSync(file, `${JSON.stringify(data)}\n`);
console.log(`Algeria states: ${Object.keys(states).length}`);
