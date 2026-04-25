import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const defaultCsvPath = "/Users/er/Library/Mobile Documents/iCloud~md~obsidian/Documents/BaseCamp/Projects/Iceland Trip Guide/source/itinerary.csv";
const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultCsvPath;
const dataDir = path.join(repoRoot, "data");
const cachePath = path.join(dataDir, "geocode-cache.json");
const stopsPath = path.join(dataDir, "stops.json");

const geocoderEndpoint = process.env.GEOCODER_ENDPOINT ?? "https://nominatim.openstreetmap.org/search";
const userAgent = process.env.GEOCODER_USER_AGENT ?? "iceland-trip-guide-build/1.0 (+https://github.com/erafat/iceland-trip-guide)";
const requestDelayMs = Number(process.env.GEOCODER_DELAY_MS ?? "1200");

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

const preferredQueries = {
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

function candidateQueries(stop) {
  const candidates = [
    ...(preferredQueries[stop.stopName] ?? []),
    stop.mapsQuery,
    `${stop.stopName}, ${stop.overnightStay}, Iceland`,
    `${stop.stopName}, Iceland`,
    `${stop.stopName} ${stop.overnightStay} Iceland`
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(candidates)];
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCache() {
  if (!existsSync(cachePath)) {
    return {};
  }

  const raw = await readFile(cachePath, "utf8");
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

async function geocodeStop(stop) {
  const queries = candidateQueries(stop);
  let lastError = null;

  for (const query of queries) {
    try {
      const result = await geocode(query);
      return { ...result, queryUsed: query };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`No geocoding result for "${stop.stopName}"`);
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const csvText = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvText).map(normalizeStop);
  const cache = await loadCache();
  let uncachedCount = 0;

  for (const stop of rows) {
    const queries = candidateQueries(stop);
    const cachedQuery = queries.find((query) => cache[query]);

    if (!cachedQuery) {
      uncachedCount += 1;
      const result = await geocodeStop(stop);
      cache[result.queryUsed] = result;
      await saveJson(cachePath, cache);
      await sleep(requestDelayMs);
    }

    const resolvedQuery = queries.find((query) => cache[query]);
    stop.lat = cache[resolvedQuery].lat;
    stop.lng = cache[resolvedQuery].lng;
    stop.geocodeDisplayName = cache[resolvedQuery].displayName;
  }

  await saveJson(cachePath, cache);
  await saveJson(stopsPath, rows);

  console.log(`Built ${rows.length} stops from ${path.basename(csvPath)}.`);
  console.log(`Resolved ${uncachedCount} new geocoding queries; cache size is ${Object.keys(cache).length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
