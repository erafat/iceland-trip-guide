import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

async function loadJson(name) {
  return JSON.parse(await readFile(path.join(repoRoot, "data", name), "utf8"));
}

const [stops, stays, routes, weather] = await Promise.all([
  loadJson("stops.json"),
  loadJson("stays.json"),
  loadJson("routes.json"),
  loadJson("weather.json")
]);

const missingStopCoordinates = stops.filter((stop) => Number.isNaN(stop.lat) || Number.isNaN(stop.lng));
const missingStayCoordinates = stays.filter((stay) => Number.isNaN(stay.lat) || Number.isNaN(stay.lng));
const badRoutes = routes.filter((route) => typeof route.geometry !== "string" || route.geometry.length < 10);
const stayDays = new Set(stays.map((stay) => stay.day));
const weatherDays = new Set(Object.keys(weather.stays ?? {}).map(Number));

console.log(`Stops: ${stops.length}`);
console.log(`Stay markers: ${stays.length}`);
console.log(`Road-route legs: ${routes.length}`);
console.log(`Missing stop coordinates: ${missingStopCoordinates.length}`);
console.log(`Missing stay coordinates: ${missingStayCoordinates.length}`);
console.log(`Bad routes: ${badRoutes.length}`);
console.log(`Weather stay entries: ${weatherDays.size}`);

if (stops.length !== 38) {
  throw new Error(`Expected 38 stops, found ${stops.length}.`);
}

if (stays.length !== 7) {
  throw new Error(`Expected 7 stay markers, found ${stays.length}.`);
}

if (routes.length !== 6) {
  throw new Error(`Expected 6 routed legs, found ${routes.length}.`);
}

if (missingStopCoordinates.length > 0 || missingStayCoordinates.length > 0) {
  throw new Error("Found itinerary locations without coordinates.");
}

if (badRoutes.length > 0) {
  throw new Error("Found routed legs without usable road geometry.");
}

for (const day of weatherDays) {
  if (!stayDays.has(day)) {
    throw new Error(`Weather entry references missing stay day ${day}.`);
  }
}
