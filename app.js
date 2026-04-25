const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const typePalette = {
  Logistics: "#7d6d55",
  Landmark: "#2d6775",
  Waterfall: "#4a88a8",
  Shopping: "#8e4b44",
  Museum: "#705f8a",
  "Nature / UNESCO": "#5e8a5a",
  "Hot Spring / Hike": "#b36d35",
  Nature: "#5e8a5a",
  Town: "#8f6a4c",
  Beach: "#49738d",
  "Nature / Puffins": "#9a7f39",
  Canyon: "#8f4f42",
  "Waterfall / Hike": "#3b8ba4",
  "Glacier Lagoon": "#5470a8",
  Mountain: "#556f61",
  "Canyon / Hike": "#8b6a3a",
  Cave: "#6a5a7b",
  "Lava Formation": "#805443",
  Geothermal: "#ba6e44",
  "Hot Spring": "#bd7a3a"
};

const state = {
  stops: [],
  stays: [],
  routes: [],
  activeDay: "all",
  selectedStayDay: null,
  markers: [],
  routeLayers: [],
  map: null,
  hoveredStayDay: null,
  weather: {
    generatedAt: null,
    source: null,
    package: null,
    timezone: null,
    stays: {}
  }
};

const mapElement = document.querySelector("#map");
const hoverCard = document.querySelector("#hover-card");
const selectedStayElement = document.querySelector("#selected-stay");
const dayFiltersElement = document.querySelector("#day-filters");
const dayGroupsElement = document.querySelector("#day-groups");
const stayCountElement = document.querySelector("#stay-count");
const weatherStatusElement = document.querySelector("#weather-status");

const monthLabels = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function getDayParam() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("day");
  if (!value) {
    return "all";
  }

  return /^\d+$/.test(value) ? Number(value) : "all";
}

function setDayParam(day) {
  const url = new URL(window.location.href);
  if (day === "all") {
    url.searchParams.delete("day");
  } else {
    url.searchParams.set("day", String(day));
  }
  window.history.replaceState({}, "", url);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function supportsHover() {
  return window.matchMedia("(hover: hover)").matches;
}

function decodePolyline6(encoded) {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / 1e6, lng / 1e6]);
  }

  return coordinates;
}

function formatDistance(meters) {
  return `${Math.round(meters / 1000)} km`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

function formatIsoDate(dateIso) {
  if (!dateIso) {
    return null;
  }

  const [year, month, day] = dateIso.split("-").map(Number);
  if (!year || !month || !day) {
    return dateIso;
  }

  return `${monthLabels[month - 1]} ${day}, ${year}`;
}

function formatSnapshotTime(timestamp) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function weatherForDay(day) {
  return state.weather.stays?.[String(day)] ?? null;
}

function formatTemperature(value) {
  return Number.isFinite(value) ? `${Math.round(value)}°C` : null;
}

function formatPrecipitation(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} mm rain`;
}

function formatWind(value) {
  return Number.isFinite(value) ? `${Math.round(value)} km/h wind` : null;
}

function weatherSummaryParts(summary) {
  if (!summary) {
    return [];
  }

  const hiLo = summary.temperatureMaxC != null || summary.temperatureMinC != null
    ? `${formatTemperature(summary.temperatureMaxC) ?? "?"} / ${formatTemperature(summary.temperatureMinC) ?? "?"}`
    : null;

  return [
    hiLo,
    formatPrecipitation(summary.precipitationTotalMm),
    formatWind(summary.windspeedMeanKmh),
    summary.precipitationProbabilityPct != null ? `${summary.precipitationProbabilityPct}% precip` : null
  ].filter(Boolean);
}

function weatherInlineHtml(day) {
  const weather = weatherForDay(day);
  if (!weather || weather.status !== "forecast") {
    return "";
  }

  return `<p class="weather-inline">${escapeHtml(weatherSummaryParts(weather.summary).join(" · "))}</p>`;
}

function weatherDetailHtml(stay) {
  const weather = weatherForDay(stay.day);
  if (!weather) {
    return "";
  }

  if (weather.status === "forecast") {
    const updatedAt = formatSnapshotTime(state.weather.generatedAt);
    return `
      <section class="weather-card">
        <p class="section-kicker">Weather</p>
        <div class="weather-metrics">
          <div class="weather-metric">
            <span class="weather-metric-label">High / low</span>
            <strong>${escapeHtml(`${formatTemperature(weather.summary.temperatureMaxC) ?? "?"} / ${formatTemperature(weather.summary.temperatureMinC) ?? "?"}`)}</strong>
          </div>
          <div class="weather-metric">
            <span class="weather-metric-label">Rain</span>
            <strong>${escapeHtml(formatPrecipitation(weather.summary.precipitationTotalMm) ?? "n/a")}</strong>
          </div>
          <div class="weather-metric">
            <span class="weather-metric-label">Wind</span>
            <strong>${escapeHtml(formatWind(weather.summary.windspeedMeanKmh) ?? "n/a")}</strong>
          </div>
        </div>
        <p class="weather-update">
          Meteoblue ${escapeHtml(state.weather.package ?? "forecast")} for ${escapeHtml(formatIsoDate(weather.dateIso) ?? stay.dateLabel)}
          ${updatedAt ? ` · refreshed ${escapeHtml(updatedAt)}` : ""}
        </p>
      </section>
    `;
  }

  if (weather.status === "out_of_range") {
    return `
      <section class="weather-card weather-card--muted">
        <p class="section-kicker">Weather</p>
        <p class="weather-update">
          Forecast not published yet for ${escapeHtml(formatIsoDate(weather.dateIso) ?? stay.dateLabel)}.
          ${weather.lastAvailableDate ? ` Latest Meteoblue day returned: ${escapeHtml(formatIsoDate(weather.lastAvailableDate) ?? weather.lastAvailableDate)}.` : ""}
        </p>
      </section>
    `;
  }

  return `
    <section class="weather-card weather-card--muted">
      <p class="section-kicker">Weather</p>
      <p class="weather-update">Weather refresh failed on the last snapshot for this stay.</p>
    </section>
  `;
}

function weatherStripHtml(day) {
  const weather = weatherForDay(day);
  if (!weather || weather.status !== "forecast") {
    return "";
  }

  return `<div class="weather-strip">${escapeHtml(weatherSummaryParts(weather.summary).join(" · "))}</div>`;
}

function hoursHtml(stop) {
  if (!stop.operatingHours) {
    return "";
  }

  const note = stop.hoursNote
    ? `<p class="stop-hours-note">${escapeHtml(stop.hoursNote)}</p>`
    : "";
  const source = stop.hoursSource
    ? `<a href="${stop.hoursSource}" target="_blank" rel="noreferrer">Official hours</a>`
    : "";
  const verified = stop.hoursVerifiedOn
    ? `<span>Verified ${escapeHtml(stop.hoursVerifiedOn)}</span>`
    : "";
  const meta = [source, verified].filter(Boolean).join("<span aria-hidden=\"true\">·</span>");

  return `
    <div class="stop-hours-block">
      <p class="stop-hours"><strong>Hours:</strong> ${escapeHtml(stop.operatingHours)}</p>
      ${note}
      ${meta ? `<div class="stop-hours-meta">${meta}</div>` : ""}
    </div>
  `;
}

function markerHtml(stay) {
  return `
    <div class="marker-shell">
      <div class="marker-dot">
        <span class="marker-day">Day ${stay.day}</span>
        <span class="marker-sequence">${stay.day}</span>
        <span class="marker-short-date">${escapeHtml(stay.dateLabel)}</span>
      </div>
    </div>
  `;
}

function selectedStay() {
  return state.stays.find((stay) => stay.day === state.selectedStayDay) ?? null;
}

function routeForDay(day) {
  return state.routes.find((route) => route.arrivalDay === day) ?? null;
}

function visibleRouteRecords() {
  if (state.activeDay === "all") {
    return state.routes;
  }

  return state.routes.filter((route) => route.arrivalDay === state.activeDay);
}

function visibleStayDays() {
  if (state.activeDay === "all") {
    return new Set(state.stays.map((stay) => stay.day));
  }

  const maxStayDay = Math.max(...state.stays.map((stay) => stay.day));
  if (state.activeDay <= 1) {
    return new Set([1]);
  }

  if (state.activeDay > maxStayDay) {
    return new Set([maxStayDay]);
  }

  return new Set([state.activeDay - 1, state.activeDay]);
}

function defaultSelectedStayDayForFilter(day) {
  if (day === "all") {
    return state.selectedStayDay ?? state.stays[0]?.day ?? null;
  }

  const exact = state.stays.find((stay) => stay.day === day);
  if (exact) {
    return exact.day;
  }

  return state.stays[state.stays.length - 1]?.day ?? null;
}

function stayPreviewHtml(stay) {
  return `
    <p class="section-kicker">Day ${stay.day} · ${escapeHtml(stay.dateLabel)}</p>
    <h3>${escapeHtml(stay.overnightStay)}</h3>
    <p class="stop-note">${escapeHtml(stay.lodgingLabel)}</p>
    <p class="stop-meta">${stay.highlightCount} highlights that day</p>
    ${weatherInlineHtml(stay.day)}
  `;
}

function stayPopupHtml(stay) {
  return `
    <strong>${escapeHtml(stay.overnightStay)}</strong><br>
    Day ${stay.day} · ${escapeHtml(stay.dateLabel)}<br>
    ${escapeHtml(stay.lodgingLabel)}
    ${weatherForDay(stay.day)?.status === "forecast" ? `<br>${escapeHtml(weatherSummaryParts(weatherForDay(stay.day).summary).join(" · "))}` : ""}
  `;
}

function stayDetailHtml(stay) {
  const route = routeForDay(stay.day);
  const routeBlock = route
    ? `<p class="stop-drive"><strong>Drive leg:</strong> ${formatDistance(route.distanceMeters)} · ${formatDuration(route.durationSeconds)} from ${escapeHtml(route.fromOvernightStay)}</p>`
    : `<p class="stop-drive"><strong>Arrival:</strong> First overnight stay of the trip.</p>`;

  return `
    <p class="section-kicker">Day ${stay.day} · ${escapeHtml(stay.dateLabel)}</p>
    <h2>${escapeHtml(stay.overnightStay)}</h2>
    <p class="stay-lodging">${escapeHtml(stay.lodgingLabel)}</p>
    <p class="stop-meta">${stay.highlightCount} itinerary highlights</p>
    ${routeBlock}
    <p class="stop-note">${escapeHtml(stay.note)}</p>
    ${weatherDetailHtml(stay)}
    <div class="stop-links">
      <a href="${stay.mapsUrl}" target="_blank" rel="noreferrer">Open stay on Google Maps</a>
    </div>
  `;
}

function colorForType(type) {
  return typePalette[type] ?? "#2d6775";
}

function updateHoverCard(stay, latlng) {
  if (!latlng || !supportsHover()) {
    hoverCard.classList.add("is-hidden");
    return;
  }

  hoverCard.innerHTML = stayPreviewHtml(stay);
  const point = state.map.latLngToContainerPoint(latlng);
  hoverCard.style.left = `${point.x}px`;
  hoverCard.style.top = `${point.y}px`;
  hoverCard.classList.remove("is-hidden");
}

function hideHoverCard() {
  hoverCard.classList.add("is-hidden");
}

function updateSelectedStay() {
  const stay = selectedStay();
  if (!stay) {
    selectedStayElement.innerHTML = `
      <h2>Pick a stay on the map</h2>
      <p>Hover on desktop or tap on mobile to open the overnight stay details and routed road leg.</p>
    `;
    return;
  }

  selectedStayElement.innerHTML = stayDetailHtml(stay);
}

function renderWeatherStatus() {
  const entries = Object.values(state.weather.stays ?? {});
  const forecastCount = entries.filter((entry) => entry.status === "forecast").length;

  if (!entries.length || !state.weather.generatedAt) {
    weatherStatusElement.innerHTML = `
      <strong>Weather not loaded yet.</strong>
      <span>Run the Meteoblue snapshot build to add forecasts for each overnight stay.</span>
    `;
    return;
  }

  weatherStatusElement.innerHTML = `
    <strong>${forecastCount} of ${entries.length} stay dates currently have forecast data.</strong>
    <span>${escapeHtml(state.weather.source ?? "meteoblue")} ${escapeHtml(state.weather.package ?? "")} snapshot refreshed ${escapeHtml(formatSnapshotTime(state.weather.generatedAt) ?? "recently")}.</span>
  `;
}

function renderDayFilters() {
  const days = [...new Set(state.stops.map((stop) => stop.day))];
  const buttons = [
    `<button class="day-filter ${state.activeDay === "all" ? "is-active" : ""}" data-day="all">All days</button>`,
    ...days.map((day) => `<button class="day-filter ${state.activeDay === day ? "is-active" : ""}" data-day="${day}">Day ${day}</button>`)
  ];

  dayFiltersElement.innerHTML = buttons.join("");
  dayFiltersElement.querySelectorAll(".day-filter").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.day === "all" ? "all" : Number(button.dataset.day);
      state.activeDay = value;
      state.selectedStayDay = defaultSelectedStayDayForFilter(value);
      setDayParam(value);
      renderDayFilters();
      updateSelectedStay();
      renderDayGroups();
      updateMapVisibility();
    });
  });
}

function renderDayGroups() {
  const grouped = new Map();

  for (const stop of state.stops) {
    if (!grouped.has(stop.day)) {
      grouped.set(stop.day, []);
    }
    grouped.get(stop.day).push(stop);
  }

  dayGroupsElement.innerHTML = Array.from(grouped.entries()).map(([day, stops]) => {
    const hiddenClass = state.activeDay !== "all" && state.activeDay !== day ? "is-hidden" : "";
    const selectedClass = state.selectedStayDay === day ? "is-selected" : "";
    const overnight = stops.find((stop) => stop.hotel);
    const firstStop = stops[0];
    return `
      <article class="day-card ${hiddenClass} ${selectedClass}" data-day-card="${day}">
        <div class="day-header">
          <div>
            <p class="section-kicker">Day ${day}</p>
            <h3>${escapeHtml(firstStop.dateLabel)}</h3>
          </div>
          <span class="day-caption">${stops.length} stops</span>
        </div>
        <div class="overnight-summary">
          <strong>Overnight:</strong> ${escapeHtml(firstStop.overnightStay)}
          ${overnight?.hotel ? `<br><span class="day-summary">${escapeHtml(overnight.hotel)}</span>` : ""}
        </div>
        ${weatherStripHtml(day)}
        <ol class="day-stop-list">
          ${stops.map((stop) => `
            <li class="day-stop-item" data-sequence="${stop.sequence}">
              <div class="stop-title-row">
                <span class="stop-title">${escapeHtml(stop.stopName)}</span>
                <span class="stop-type-pill" style="background:${colorForType(stop.type)}20;color:${colorForType(stop.type)}">${escapeHtml(stop.type)}</span>
              </div>
              <div class="stop-meta">${escapeHtml(stop.timeNeeded)} · ${escapeHtml(stop.driveFromPrevious)}</div>
              ${hoursHtml(stop)}
              <p class="stop-note">${escapeHtml(stop.notes)}</p>
              <div class="stop-links">
                <a href="${stop.mapsUrl}" target="_blank" rel="noreferrer">Open in Google Maps</a>
              </div>
            </li>
          `).join("")}
        </ol>
      </article>
    `;
  }).join("");
}

function fitMapToVisibleGeometry(visibleStays, visibleRoutes) {
  const latLngs = [
    ...visibleStays.map((stay) => [stay.lat, stay.lng]),
    ...visibleRoutes.flatMap((route) => route.latLngs)
  ];

  if (latLngs.length === 0) {
    return;
  }

  const bounds = L.latLngBounds(latLngs);
  state.map.fitBounds(bounds.pad(0.16), { animate: false });
}

function updateMapVisibility() {
  const visibleDays = visibleStayDays();
  const visibleStays = state.stays.filter((stay) => visibleDays.has(stay.day));
  const visibleRoutes = visibleRouteRecords();

  for (const markerRecord of state.markers) {
    if (visibleDays.has(markerRecord.stay.day)) {
      markerRecord.marker.addTo(state.map);
    } else {
      markerRecord.marker.remove();
    }
  }

  for (const routeRecord of state.routeLayers) {
    if (visibleRoutes.includes(routeRecord.route)) {
      routeRecord.layer.addTo(state.map);
    } else {
      routeRecord.layer.remove();
    }
  }

  fitMapToVisibleGeometry(visibleStays, visibleRoutes);

  if (state.selectedStayDay && !visibleDays.has(state.selectedStayDay) && state.activeDay !== "all") {
    state.selectedStayDay = defaultSelectedStayDayForFilter(state.activeDay);
    updateSelectedStay();
    renderDayGroups();
  }
}

function selectStay(day, panToStay = false) {
  const stay = state.stays.find((item) => item.day === day);
  if (!stay) {
    return;
  }

  state.selectedStayDay = day;
  updateSelectedStay();
  renderDayGroups();

  if (panToStay) {
    state.map.flyTo([stay.lat, stay.lng], Math.max(state.map.getZoom(), 7), {
      animate: true,
      duration: 0.8
    });
  }
}

function buildMap() {
  state.map = L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: true
  });

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION
  }).addTo(state.map);

  state.routeLayers = state.routes.map((route) => {
    const layer = L.polyline(route.latLngs, {
      color: "#8e4b44",
      weight: 4.5,
      opacity: 0.78,
      lineCap: "round"
    });

    return { route, layer };
  });

  state.markers = state.stays.map((stay) => {
    const marker = L.marker([stay.lat, stay.lng], {
      icon: L.divIcon({
        html: markerHtml(stay),
        className: "",
        iconSize: [54, 54],
        iconAnchor: [27, 52]
      }),
      title: `${stay.overnightStay} (Day ${stay.day})`
    });

    marker.bindPopup(stayPopupHtml(stay));

    marker.on("mouseover", () => {
      state.hoveredStayDay = stay.day;
      updateHoverCard(stay, marker.getLatLng());
    });

    marker.on("mouseout", () => {
      state.hoveredStayDay = null;
      hideHoverCard();
    });

    marker.on("click", () => {
      state.hoveredStayDay = null;
      hideHoverCard();
      selectStay(stay.day, false);

      if (supportsHover()) {
        marker.closePopup();
      } else {
        marker.openPopup();
      }
    });

    return { marker, stay };
  });

  state.map.on("zoomstart movestart", () => {
    if (!state.hoveredStayDay) {
      hideHoverCard();
    }
  });

  renderDayFilters();
  renderDayGroups();
  updateSelectedStay();
  updateMapVisibility();
}

async function loadJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label}`);
  }

  return response.json();
}

async function loadWeather() {
  const response = await fetch("./data/weather.json", { cache: "no-store" });
  if (response.status === 404) {
    return { stays: {} };
  }

  if (!response.ok) {
    throw new Error("Failed to load weather.json");
  }

  return response.json();
}

async function main() {
  const [stops, stays, routes, weather] = await Promise.all([
    loadJson("./data/stops.json", "stops.json"),
    loadJson("./data/stays.json", "stays.json"),
    loadJson("./data/routes.json", "routes.json"),
    loadWeather()
  ]);

  state.stops = stops;
  state.stays = stays;
  state.routes = routes.map((route) => ({
    ...route,
    latLngs: decodePolyline6(route.geometry)
  }));
  state.weather = {
    generatedAt: weather.generatedAt ?? null,
    source: weather.source ?? "meteoblue",
    package: weather.package ?? null,
    timezone: weather.timezone ?? null,
    stays: weather.stays ?? {}
  };
  state.activeDay = getDayParam();
  state.selectedStayDay = defaultSelectedStayDayForFilter(state.activeDay);
  stayCountElement.textContent = String(state.stays.length);
  renderWeatherStatus();
  buildMap();
}

main().catch((error) => {
  selectedStayElement.innerHTML = `
    <h2>Site failed to load</h2>
    <p>${escapeHtml(error.message)}</p>
  `;
  console.error(error);
});
