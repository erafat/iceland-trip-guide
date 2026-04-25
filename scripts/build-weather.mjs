import { readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const staysPath = path.join(repoRoot, "data", "stays.json");
const weatherPath = path.join(repoRoot, "data", "weather.json");

const apiKey = process.env.METEOBLUE_API_KEY;
const sharedSecret = process.env.METEOBLUE_SHARED_SECRET ?? "";
const weatherPackage = process.env.METEOBLUE_PACKAGE ?? "basic-day";
const timezone = process.env.METEOBLUE_TIMEZONE ?? "Atlantic/Reykjavik";
const forecastDays = Number(process.env.METEOBLUE_FORECAST_DAYS ?? "7");
const tripYear = Number(process.env.TRIP_YEAR ?? "2026");
const temperatureUnit = process.env.METEOBLUE_TEMPERATURE_UNIT ?? "C";
const windspeedUnit = process.env.METEOBLUE_WINDSPEED_UNIT ?? "kmh";
const precipitationUnit = process.env.METEOBLUE_PRECIPITATION_UNIT ?? "mm";
const requestDelayMs = Number(process.env.METEOBLUE_DELAY_MS ?? "150");
const requestTimeoutMs = Number(process.env.METEOBLUE_TIMEOUT_MS ?? "30000");
const retryCount = Number(process.env.METEOBLUE_RETRY_COUNT ?? "3");
const helpRequested = process.argv.includes("--help");

const monthLookup = new Map([
  ["January", 1],
  ["February", 2],
  ["March", 3],
  ["April", 4],
  ["May", 5],
  ["June", 6],
  ["July", 7],
  ["August", 8],
  ["September", 9],
  ["October", 10],
  ["November", 11],
  ["December", 12]
]);

function defaultSnapshot() {
  return {
    generatedAt: null,
    source: "meteoblue",
    package: weatherPackage,
    timezone,
    forecastDays,
    tripYear,
    units: {
      temperature: temperatureUnit,
      windspeed: windspeedUnit,
      precipitation: precipitationUnit
    },
    stays: {}
  };
}

function printHelp() {
  console.log(`
Build a Meteoblue weather snapshot for itinerary stays.

Required environment:
  METEOBLUE_API_KEY=...

Optional environment:
  METEOBLUE_SHARED_SECRET=...     # needed only if your key enforces signatures
  METEOBLUE_PACKAGE=basic-day
  METEOBLUE_TIMEZONE=Atlantic/Reykjavik
  METEOBLUE_FORECAST_DAYS=7
  TRIP_YEAR=2026
  METEOBLUE_TEMPERATURE_UNIT=C
  METEOBLUE_WINDSPEED_UNIT=kmh
  METEOBLUE_PRECIPITATION_UNIT=mm
  METEOBLUE_DELAY_MS=150
  METEOBLUE_TIMEOUT_MS=30000
  METEOBLUE_RETRY_COUNT=3

Writes:
  data/weather.json
`.trim());
}

function toIsoDate(dateLabel) {
  const [monthName, dayValue] = dateLabel.trim().split(/\s+/);
  const month = monthLookup.get(monthName);
  const day = Number(dayValue);

  if (!month || !Number.isInteger(day)) {
    throw new Error(`Unsupported date label "${dateLabel}".`);
  }

  return `${tripYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function roundNumber(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSignedUrl(stay) {
  const pathname = `/packages/${weatherPackage}`;
  const params = new URLSearchParams();

  params.append("apikey", apiKey);
  params.append("lat", String(stay.lat));
  params.append("lon", String(stay.lng));
  params.append("tz", timezone);
  params.append("temperature", temperatureUnit);
  params.append("windspeed", windspeedUnit);
  params.append("precipitationamount", precipitationUnit);
  params.append("forecast_days", String(forecastDays));
  params.append("name", stay.overnightStay);

  if (sharedSecret) {
    const expire = String(Math.floor(Date.now() / 1000) + 600);
    params.append("expire", expire);
  }

  const query = `${pathname}?${params.toString()}`;
  let search = params.toString();

  if (sharedSecret) {
    const sig = crypto.createHmac("sha256", sharedSecret).update(query).digest("hex");
    search = `${search}&sig=${sig}`;
  }

  return `https://my.meteoblue.com${pathname}?${search}`;
}

async function fetchJson(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(requestTimeoutMs)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (payload?.error) {
        throw new Error(payload.error_message ?? "Meteoblue returned an error.");
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (attempt < retryCount) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw lastError ?? new Error("Weather request failed.");
}

function pickArray(container, keys) {
  for (const key of keys) {
    if (Array.isArray(container?.[key])) {
      return container[key];
    }
  }

  return null;
}

function pickValue(container, keys, index, digits = 1) {
  const values = pickArray(container, keys);
  if (!values) {
    return null;
  }

  const value = Number(values[index]);
  return roundNumber(value, digits);
}

function pickIntegerValue(container, keys, index) {
  const values = pickArray(container, keys);
  if (!values) {
    return null;
  }

  const value = Number(values[index]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getDayData(payload) {
  return payload.data_day ?? payload;
}

function summarizeForecast(payload, stay) {
  const dayData = getDayData(payload);
  const time = pickArray(dayData, ["time"]);

  if (!time?.length) {
    return {
      status: "error",
      overnightStay: stay.overnightStay,
      dateIso: stay.dateIso,
      message: "Meteoblue response did not include daily time values."
    };
  }

  const dateIndex = time.findIndex((entry) => entry === stay.dateIso);
  const metadata = {
    overnightStay: stay.overnightStay,
    dateIso: stay.dateIso,
    modelrunUtc: payload.modelrun_utc ?? null,
    modelrunUpdatedUtc: payload.modelrun_updatetime_utc ?? null
  };

  if (dateIndex === -1) {
    return {
      ...metadata,
      status: "out_of_range",
      firstAvailableDate: time[0] ?? null,
      lastAvailableDate: time.at(-1) ?? null
    };
  }

  return {
    ...metadata,
    status: "forecast",
    summary: {
      temperatureMaxC: pickValue(dayData, ["temperature_max", "temperature_2m_max"], dateIndex, 1),
      temperatureMinC: pickValue(dayData, ["temperature_min", "temperature_2m_min"], dateIndex, 1),
      temperatureMeanC: pickValue(dayData, ["temperature_mean", "temperature_2m_mean"], dateIndex, 1),
      precipitationTotalMm: pickValue(dayData, ["precipitation_total", "precipitation"], dateIndex, 1),
      precipitationProbabilityPct: pickIntegerValue(dayData, ["precipitation_probability", "precipitation_probability_max"], dateIndex),
      windspeedMeanKmh: pickValue(dayData, ["windspeed_mean", "windspeed"], dateIndex, 1),
      windspeedMaxKmh: pickValue(dayData, ["windspeed_max"], dateIndex, 1),
      pictocode: pickIntegerValue(dayData, ["pictocode"], dateIndex)
    }
  };
}

async function writeSnapshot(snapshot) {
  await writeFile(weatherPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function main() {
  if (helpRequested) {
    printHelp();
    return;
  }

  if (!apiKey) {
    throw new Error("Missing METEOBLUE_API_KEY.");
  }

  const stays = JSON.parse(await readFile(staysPath, "utf8")).map((stay) => ({
    ...stay,
    dateIso: toIsoDate(stay.dateLabel)
  }));

  const snapshot = defaultSnapshot();

  for (const stay of stays) {
    const url = buildSignedUrl(stay);

    try {
      const payload = await fetchJson(url);
      snapshot.stays[String(stay.day)] = summarizeForecast(payload, stay);
    } catch (error) {
      snapshot.stays[String(stay.day)] = {
        status: "error",
        overnightStay: stay.overnightStay,
        dateIso: stay.dateIso,
        message: error instanceof Error ? error.message : String(error)
      };
    }

    if (requestDelayMs > 0) {
      await sleep(requestDelayMs);
    }
  }

  snapshot.generatedAt = new Date().toISOString();
  await writeSnapshot(snapshot);

  const counts = Object.values(snapshot.stays).reduce((accumulator, entry) => {
    accumulator[entry.status] = (accumulator[entry.status] ?? 0) + 1;
    return accumulator;
  }, {});

  console.log(`Wrote weather snapshot for ${stays.length} stays.`);
  console.log(`Forecast: ${counts.forecast ?? 0}, out_of_range: ${counts.out_of_range ?? 0}, error: ${counts.error ?? 0}`);
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
