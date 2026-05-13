# Iceland Trip Guide

Static GitHub Pages site for the May 2-9, 2026 Iceland Ring Road itinerary.

## Stack
- Plain HTML, CSS, and JavaScript
- Leaflet for the map
- Committed JSON data generated from the itinerary CSV
- GitHub Pages deployment via Actions

## Local Workflow
1. Keep the source itinerary CSV in the vault project:
   - `/Users/erafat/Library/Mobile Documents/iCloud~md~obsidian/Documents/BaseCamp/Projects/Iceland Trip Guide/source/itinerary.csv`
2. Rebuild site data:
   - `npm run build:data`
3. Refresh the Meteoblue stay forecast snapshot:
   - `METEOBLUE_API_KEY=... npm run build:weather`
   - If your Meteoblue key enforces signatures, also set `METEOBLUE_SHARED_SECRET=...`
4. Verify the generated output:
   - `npm run check:data`
5. Preview locally:
   - `python3 -m http.server 4173`

## Data Files
- `data/stops.json`
  Runtime data used by the site.
- `data/stays.json`
  Overnight stay/day markers and stay-level metadata for the map.
- `data/routes.json`
  Routed driving legs between overnight stays.
- `data/weather.json`
  Build-time Meteoblue snapshot keyed by stay day.
- `data/geocode-cache.json`
  Cached geocoding results for deterministic rebuilds.

## Notes
- Geocoding is a build-time step only.
- Weather is a build-time step only.
- `.github/workflows/weather.yml` can be run manually to refresh `data/weather.json` and commit the updated snapshot when the GitHub secret `METEOBLUE_API_KEY` is available. Set `METEOBLUE_SHARED_SECRET` too if the key requires signed requests.
- The browser never calls the geocoder directly.
- The browser never calls Meteoblue directly.
- The map uses OpenStreetMap tiles and keeps visible attribution.
