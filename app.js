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
  activeDay: "all",
  selectedSequence: null,
  markers: [],
  routeLine: null,
  map: null,
  hoveredSequence: null
};

const mapElement = document.querySelector("#map");
const hoverCard = document.querySelector("#hover-card");
const selectedStopElement = document.querySelector("#selected-stop");
const dayFiltersElement = document.querySelector("#day-filters");
const dayGroupsElement = document.querySelector("#day-groups");
const legendElement = document.querySelector("#legend");
const stopCountElement = document.querySelector("#stop-count");

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

function shortDate(dateLabel) {
  return dateLabel.replace("May ", "May ");
}

function colorForType(type) {
  return typePalette[type] ?? "#2d6775";
}

function supportsHover() {
  return window.matchMedia("(hover: hover)").matches;
}

function stopsForDay(day) {
  return state.stops.filter((stop) => day === "all" || stop.day === day);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function markerHtml(stop) {
  return `
    <div class="marker-shell">
      <div class="marker-dot">
        <span class="marker-day">Day ${stop.day}</span>
        <span class="marker-sequence">${stop.sequence}</span>
        <span class="marker-short-date">${escapeHtml(shortDate(stop.dateLabel))}</span>
      </div>
    </div>
  `;
}

function stopPreviewHtml(stop) {
  return `
    <p class="section-kicker">Day ${stop.day} · ${escapeHtml(stop.dateLabel)}</p>
    <h3>${escapeHtml(stop.stopName)}</h3>
    <p class="stop-note">${escapeHtml(stop.notes)}</p>
    <p class="stop-meta">${escapeHtml(stop.type)} · ${escapeHtml(stop.timeNeeded)}</p>
  `;
}

function stopDetailHtml(stop) {
  return `
    <p class="section-kicker">Day ${stop.day} · ${escapeHtml(stop.dateLabel)}</p>
    <h2>${escapeHtml(stop.stopName)}</h2>
    <p class="stop-meta">${escapeHtml(stop.type)} · ${escapeHtml(stop.timeNeeded)}</p>
    <p class="stop-drive"><strong>Drive from previous:</strong> ${escapeHtml(stop.driveFromPrevious)}</p>
    <p class="stop-note">${escapeHtml(stop.notes)}</p>
    <div class="stop-links">
      <a href="${stop.mapsUrl}" target="_blank" rel="noreferrer">Open in Google Maps</a>
    </div>
  `;
}

function popupHtml(stop) {
  return `
    <strong>${escapeHtml(stop.stopName)}</strong><br>
    Day ${stop.day} · ${escapeHtml(stop.dateLabel)}<br>
    ${escapeHtml(stop.type)}
  `;
}

function updateHoverCard(stop, latlng) {
  if (!latlng || !supportsHover()) {
    hoverCard.classList.add("is-hidden");
    return;
  }

  hoverCard.innerHTML = stopPreviewHtml(stop);
  const point = state.map.latLngToContainerPoint(latlng);
  hoverCard.style.left = `${point.x}px`;
  hoverCard.style.top = `${point.y}px`;
  hoverCard.classList.remove("is-hidden");
}

function hideHoverCard() {
  hoverCard.classList.add("is-hidden");
}

function updateSelectedStop() {
  const stop = state.stops.find((item) => item.sequence === state.selectedSequence);
  if (!stop) {
    selectedStopElement.innerHTML = `
      <h2>Pick a stop on the map</h2>
      <p>Hover on desktop or tap on mobile to open the notes, drive context, and the Google Maps link.</p>
    `;
    return;
  }

  selectedStopElement.innerHTML = stopDetailHtml(stop);
}

function renderLegend() {
  const seen = new Set();
  const orderedTypes = state.stops
    .map((stop) => stop.type)
    .filter((type) => {
      if (seen.has(type)) {
        return false;
      }
      seen.add(type);
      return true;
    });

  legendElement.innerHTML = orderedTypes
    .map((type) => `
      <li class="legend-item">
        <span class="legend-swatch" style="--swatch:${colorForType(type)}"></span>
        <span>${escapeHtml(type)}</span>
      </li>
    `)
    .join("");
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
      setDayParam(value);
      renderDayFilters();
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
    const overnight = stops.find((stop) => stop.hotel);
    const firstStop = stops[0];
    return `
      <article class="day-card ${hiddenClass}" data-day-card="${day}">
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
        <ol class="day-stop-list">
          ${stops.map((stop) => `
            <li class="day-stop-item ${state.selectedSequence === stop.sequence ? "is-selected" : ""}" data-sequence="${stop.sequence}">
              <div class="stop-title-row">
                <span class="stop-title">${escapeHtml(stop.stopName)}</span>
                <span class="stop-type-pill" style="background:${colorForType(stop.type)}20;color:${colorForType(stop.type)}">${escapeHtml(stop.type)}</span>
              </div>
              <div class="stop-meta">${escapeHtml(stop.timeNeeded)} · ${escapeHtml(stop.driveFromPrevious)}</div>
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

  dayGroupsElement.querySelectorAll(".day-stop-item").forEach((item) => {
    item.addEventListener("click", () => {
      const sequence = Number(item.dataset.sequence);
      selectStop(sequence, true);
    });
  });
}

function updateMapVisibility() {
  const visibleStops = stopsForDay(state.activeDay);
  const visibleSequences = new Set(visibleStops.map((stop) => stop.sequence));

  for (const markerRecord of state.markers) {
    if (visibleSequences.has(markerRecord.stop.sequence)) {
      markerRecord.marker.addTo(state.map);
    } else {
      markerRecord.marker.remove();
    }
  }

  if (state.routeLine) {
    state.routeLine.setLatLngs(visibleStops.map((stop) => [stop.lat, stop.lng]));
  }

  if (visibleStops.length > 0) {
    const bounds = L.latLngBounds(visibleStops.map((stop) => [stop.lat, stop.lng]));
    state.map.fitBounds(bounds.pad(0.2), { animate: false });
  }

  if (state.selectedSequence && !visibleSequences.has(state.selectedSequence)) {
    state.selectedSequence = null;
    updateSelectedStop();
    renderDayGroups();
  }
}

function selectStop(sequence, panToStop = false) {
  const stop = state.stops.find((item) => item.sequence === sequence);
  if (!stop) {
    return;
  }

  state.selectedSequence = sequence;
  updateSelectedStop();
  renderDayGroups();

  if (panToStop) {
    state.map.flyTo([stop.lat, stop.lng], Math.max(state.map.getZoom(), 7), {
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

  state.routeLine = L.polyline([], {
    color: "#8e4b44",
    weight: 4,
    opacity: 0.75,
    lineCap: "round"
  }).addTo(state.map);

  state.markers = state.stops.map((stop) => {
    const marker = L.marker([stop.lat, stop.lng], {
      icon: L.divIcon({
        html: markerHtml(stop),
        className: "",
        iconSize: [54, 54],
        iconAnchor: [27, 52]
      }),
      title: `${stop.stopName} (Day ${stop.day})`
    });

    marker.bindPopup(popupHtml(stop));

    marker.on("mouseover", () => {
      state.hoveredSequence = stop.sequence;
      updateHoverCard(stop, marker.getLatLng());
    });

    marker.on("mouseout", () => {
      state.hoveredSequence = null;
      hideHoverCard();
    });

    marker.on("click", () => {
      state.hoveredSequence = null;
      hideHoverCard();
      selectStop(stop.sequence, false);

      if (supportsHover()) {
        marker.closePopup();
      } else {
        marker.openPopup();
      }
    });

    return { marker, stop };
  });

  state.map.on("zoomstart movestart", () => {
    if (!state.hoveredSequence) {
      hideHoverCard();
    }
  });

  renderDayFilters();
  renderDayGroups();
  updateMapVisibility();
}

async function loadStops() {
  const response = await fetch("./data/stops.json");
  if (!response.ok) {
    throw new Error("Failed to load stops.json");
  }

  return response.json();
}

async function main() {
  state.stops = await loadStops();
  state.activeDay = getDayParam();
  stopCountElement.textContent = String(state.stops.length);
  renderLegend();
  buildMap();
}

main().catch((error) => {
  selectedStopElement.innerHTML = `
    <h2>Site failed to load</h2>
    <p>${escapeHtml(error.message)}</p>
  `;
  console.error(error);
});
