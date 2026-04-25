import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const defaultCsvPath = "/Users/er/Library/Mobile Documents/iCloud~md~obsidian/Documents/BaseCamp/Projects/Iceland Trip Guide/source/itinerary.csv";
const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsvPath;
const dataDir = path.join(repoRoot, "data");
const cachePath = path.join(dataDir, "geocode-cache.json");
const routeCachePath = path.join(dataDir, "route-cache.json");
const stopsPath = path.join(dataDir, "stops.json");
const staysPath = path.join(dataDir, "stays.json");
const routesPath = path.join(dataDir, "routes.json");

const geocoderEndpoint = process.env.GEOCODER_ENDPOINT ?? "https://nominatim.openstreetmap.org/search";
const routerEndpoint = process.env.ROUTER_ENDPOINT ?? "https://router.project-osrm.org/route/v1/driving";
const userAgent = process.env.GEOCODER_USER_AGENT ?? "iceland-trip-guide-build/1.0 (+https://github.com/erafat/iceland-trip-guide)";
const requestDelayMs = Number(process.env.GEOCODER_DELAY_MS ?? "1200");
const routeDelayMs = Number(process.env.ROUTER_DELAY_MS ?? "700");

const fieldMap = {
  Day: "day",
  Date: "dateLabel",
  "Overnight Stay": "overnightStay",
  Hotel: "hotel",
  Stop: "stopName",
  Type: "type",
  "Google Maps Link": "mapsUrl",
  "Time Needed": "timeNeeded",
  "Drive From Previous": "driveFromPrevious",
  Notes: "notes"
};

const preferredStopQueries = {
  "KEF Airport - Car Pickup": ["Keflavik International Airport, Iceland"],
  "Hallgrimskirkja": ["Hallgrímskirkja, Reykjavík, Iceland"],
  "Sun Voyager Sculpture": ["Sun Voyager, Reykjavik, Iceland", "Sólfar, Reykjavík, Iceland"],
  "Harpa Concert Hall": ["Harpa, Reykjavik, Iceland"],
  "Tjornin Lake": ["Tjörnin, Reykjavík, Iceland"],
  "Laugavegur Shopping Street": ["Laugavegur, Reykjavík, Iceland"],
  "Icelandic Phallological Museum": ["Icelandic Phallological Museum, Reykjavík, Iceland", "Hið Íslenzka Reðasafn, Reykjavík, Iceland"],
  "Thingvellir National Park": ["Thingvellir National Park, Iceland"],
  "Kerid Crater": ["Kerið, Iceland"],
  "Geysir / Strokkur": ["Strokkur, Iceland", "Geysir, Iceland"],
  "Gullfoss Waterfall": ["Gullfoss, Iceland"],
  "Reykjadalur Hot Spring River": ["Reykjadalur, Hveragerði, Iceland"],
  "Seljalandsfoss": ["Seljalandsfoss, Iceland"],
  "Gljufrabui": ["Gljúfrabúi, Iceland"],
  "Skogafoss": ["Skógafoss, Iceland"],
  "Dyrholaey": ["Dyrhólaey, Iceland"],
  "Reynisfjara Black Sand Beach": ["Reynisfjara, Iceland"],
  "Fjadrargljufur Canyon": ["Fjaðrárgljúfur, Iceland"],
  "Svartifoss (Skaftafell)": ["Svartifoss, Iceland", "Skaftafell Visitor Centre, Iceland"],
  "Jokulsarlon Glacier Lagoon": ["Jökulsárlón, Iceland"],
  "Diamond Beach": ["Diamond Beach, Iceland", "Breiðamerkursandur, Iceland"],
  "Vestrahorn / Stokksnes": ["Stokksnes, Iceland", "Vestrahorn, Iceland"],
  "Djupivogur": ["Djúpivogur, Iceland"],
  "Vok Baths": ["Vök Baths, Iceland"],
  "Egilsstadir town": ["Egilsstaðir, Iceland"],
  "Studlagil Canyon": ["Stuðlagil, Iceland"],
  "Dettifoss": ["Dettifoss, Iceland"],
  "Selfoss waterfall (near Dettifoss)": ["Dettifoss Selfoss Iceland"],
  "Grjotagja Cave": ["Grjótagjá, Iceland"],
  "Dimmuborgir": ["Dimmuborgir, Iceland"],
  "Hverir Namaskard": ["Hverir, Iceland", "Námaskarð, Iceland"],
  "Earth Lagoon Myvatn": ["Mývatn Nature Baths, Iceland", "Mývatn, Iceland"],
  "Godafoss": ["Goðafoss, Iceland"],
  "Akureyri": ["Akureyri, Iceland"],
  "Reykjavik - Farewell Dinner": ["Reykjavík, Iceland"],
  "Dahai: Flybus to KEF": ["Keflavik International Airport, Iceland"],
  "Mia Optional: Blue Lagoon": ["Blue Lagoon, Iceland"],
  "Mia: KEF Airport": ["Keflavik International Airport, Iceland"]
};

const stayPreferences = {
  1: {
    lodgingLabel: "Eyja Guldsmeden Hotel",
    stayQuery: "Eyja Guldsmeden Hotel, Reykjavík, Iceland"
  },
  2: {
    lodgingLabel: "Airbnb",
    stayQuery: "Selfoss, Iceland"
  },
  3: {
    lodgingLabel: "The Barn",
    stayQuery: "Vík, Iceland"
  },
  4: {
    lodgingLabel: "Seljavellir Guesthouse",
    stayQuery: "Höfn, Iceland"
  },
  5: {
    lodgingLabel: "Egilsstaðir 4",
    stayQuery: "Egilsstaðir, Iceland"
  },
  6: {
    lodgingLabel: "Árskógssandur",
    stayQuery: "Mývatn, Iceland"
  },
  7: {
    lodgingLabel: "Eyja Guldsmeden Hotel",
    stayQuery: "Eyja Guldsmeden Hotel, Reykjavík, Iceland"
  }
};

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row;
  });
}

function extractGoogleQuery(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("q") ?? "";
  } catch {
    return "";
  }
}

function normalizeStop(row, index) {
  const stop = { sequence: index + 1 };

  for (const [csvKey, jsonKey] of Object.entries(fieldMap)) {
    stop[jsonKey] = (row[csvKey] ?? "").trim();
  }

  stop.day = Number(stop.day);
  stop.mapsQuery = extractGoogleQuery(stop.mapsUrl);

  return stop;
}

function stopCandidateQueries(stop) {
  const candidates = [
    ...(preferredStopQueries[stop.stopName] ?? []),
    stop.mapsQuery,
    `${stop.stopName}, ${stop.overnightStay}, Iceland`,
    `${stop.stopName}, Iceland`,
    `${stop.stopName} ${stop.overnightStay} Iceland`
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

function stayMapsUrl(query) {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

function buildStays(stops) {
  const grouped = new Map();

  for (const stop of stops) {
    if (!grouped.has(stop.day)) {
      grouped.set(stop.day, []);
    }
    grouped.get(stop.day).push(stop);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .flatMap(([day, dayStops]) => {
      const firstStop = dayStops[0];
      if (firstStop.overnightStay === "Departure") {
        return [];
      }

      const preference = stayPreferences[day] ?? {};
      const stayQuery = preference.stayQuery
        ?? (firstStop.hotel && firstStop.hotel !== "Airbnb"
          ? `${firstStop.hotel}, ${firstStop.overnightStay}, Iceland`
          : `${firstStop.overnightStay}, Iceland`);

      const lodgingLabel = preference.lodgingLabel ?? firstStop.hotel ?? firstStop.overnightStay;

      return [{
        day,
        dateLabel: firstStop.dateLabel,
        overnightStay: firstStop.overnightStay,
        hotel: firstStop.hotel,
        lodgingLabel,
        stayQuery,
        mapsUrl: stayMapsUrl(stayQuery),
        highlightCount: dayStops.length,
        highlightCategories: [...new Set(dayStops.map((stop) => stop.type))],
        note: firstStop.hotel
          ? `Overnight in ${firstStop.overnightStay} at ${lodgingLabel}.`
          : `Overnight in ${firstStop.overnightStay}.`
      }];
    });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function saveJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function geocode(query) {
  const url = new URL(geocoderEndpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": "en"
    }
  });

  if (!response.ok) {
    throw new Error(`Geocoding failed for "${query}" with status ${response.status}`);
  }

  const results = await response.json();
  const first = results[0];

  if (!first) {
    throw new Error(`No geocoding result for "${query}"`);
  }

  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: first.display_name,
    provider: "nominatim"
  };
}

async function resolveCachedGeocode(queryCandidates, cache) {
  const cachedQuery = queryCandidates.find((query) => cache[query]);
  if (cachedQuery) {
    return { data: cache[cachedQuery], queryUsed: cachedQuery, created: false };
  }

  let lastError = null;
  for (const query of queryCandidates) {
    try {
      const result = await geocode(query);
      cache[query] = result;
      return { data: result, queryUsed: query, created: true };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Failed to geocode any candidate query for "${queryCandidates[0]}"`);
}

async function fetchRoute(fromStay, toStay) {
  const coordinates = `${fromStay.lng},${fromStay.lat};${toStay.lng},${toStay.lat}`;
  const url = new URL(`${routerEndpoint}/${coordinates}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "polyline6");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent
    }
  });

  if (!response.ok) {
    throw new Error(`Routing failed for day ${fromStay.day} to day ${toStay.day} with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.code !== "Ok" || !payload.routes?.[0]) {
    throw new Error(`Routing failed for day ${fromStay.day} to day ${toStay.day}: ${payload.code}`);
  }

  const route = payload.routes[0];
  return {
    arrivalDay: toStay.day,
    fromDay: fromStay.day,
    toDay: toStay.day,
    fromOvernightStay: fromStay.overnightStay,
    toOvernightStay: toStay.overnightStay,
    fromLodgingLabel: fromStay.lodgingLabel,
    toLodgingLabel: toStay.lodgingLabel,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry
  };
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const csvText = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvText).map(normalizeStop);
  const geocodeCache = await loadJson(cachePath, {});
  const routeCache = await loadJson(routeCachePath, {});
  const stays = buildStays(rows);

  let uncachedGeocodes = 0;
  let uncachedRoutes = 0;

  for (const stop of rows) {
    const resolved = await resolveCachedGeocode(stopCandidateQueries(stop), geocodeCache);
    if (resolved.created) {
      uncachedGeocodes += 1;
      await saveJson(cachePath, geocodeCache);
      await sleep(requestDelayMs);
    }

    stop.lat = resolved.data.lat;
    stop.lng = resolved.data.lng;
    stop.geocodeDisplayName = resolved.data.displayName;
  }

  for (const stay of stays) {
    const resolved = await resolveCachedGeocode([stay.stayQuery], geocodeCache);
    if (resolved.created) {
      uncachedGeocodes += 1;
      await saveJson(cachePath, geocodeCache);
      await sleep(requestDelayMs);
    }

    stay.lat = resolved.data.lat;
    stay.lng = resolved.data.lng;
    stay.geocodeDisplayName = resolved.data.displayName;
  }

  const routes = [];
  for (let index = 1; index < stays.length; index += 1) {
    const fromStay = stays[index - 1];
    const toStay = stays[index];
    const key = `${fromStay.day}-${toStay.day}`;
    const cachedRoute = routeCache[key];
    const hasUsableGeometry = typeof cachedRoute?.geometry === "string" && cachedRoute.geometry.length > 10;

    if (!hasUsableGeometry) {
      routeCache[key] = await fetchRoute(fromStay, toStay);
      uncachedRoutes += 1;
      await saveJson(routeCachePath, routeCache);
      await sleep(routeDelayMs);
    }

    routes.push(routeCache[key]);
  }

  await saveJson(cachePath, geocodeCache);
  await saveJson(routeCachePath, routeCache);
  await saveJson(stopsPath, rows);
  await saveJson(staysPath, stays);
  await saveJson(routesPath, routes);

  console.log(`Built ${rows.length} itinerary stops, ${stays.length} stay markers, and ${routes.length} routed legs.`);
  console.log(`Resolved ${uncachedGeocodes} new geocoding queries; cache size is ${Object.keys(geocodeCache).length}.`);
  console.log(`Resolved ${uncachedRoutes} new routed road segments; route cache size is ${Object.keys(routeCache).length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
