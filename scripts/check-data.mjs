import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const stopsPath = path.join(repoRoot, "data", "stops.json");

const stops = JSON.parse(await readFile(stopsPath, "utf8"));
const missingCoordinates = stops.filter((stop) => Number.isNaN(stop.lat) || Number.isNaN(stop.lng));
const dayCounts = new Map();

for (const stop of stops) {
  dayCounts.set(stop.day, (dayCounts.get(stop.day) ?? 0) + 1);
}

console.log(`Stops: ${stops.length}`);
console.log(`Days: ${Array.from(dayCounts.keys()).sort((a, b) => a - b).join(", ")}`);
console.log(`Missing coordinates: ${missingCoordinates.length}`);

if (stops.length !== 38) {
  throw new Error(`Expected 38 stops, found ${stops.length}.`);
}

if (missingCoordinates.length > 0) {
  throw new Error("Found stops without coordinates.");
}
