import { mkdir, writeFile } from "node:fs/promises";
import { CITY_PLOTS, validateCityPlots } from "../public/js/city.mjs";
if (validateCityPlots().length) throw new Error(validateCityPlots().join(", "));
const resource = new URL("../unity-colony/Assets/Colony/Resources/", import.meta.url);
await mkdir(resource, { recursive: true });
await writeFile(new URL("colony-layout.json", resource), JSON.stringify({ plots: CITY_PLOTS.map(p => ({ id: p.id, name: p.short, size: p.size, x: p.x / 100, y: p.y / 100, outline: p.outline })) }, null, 2));
console.log(`Prepared ${CITY_PLOTS.length} Unity buildings from city.mjs`);
