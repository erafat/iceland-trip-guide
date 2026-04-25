# Iceland Trip Guide

Static GitHub Pages site for the May 2-9, 2026 Iceland Ring Road itinerary.

## Stack
- Plain HTML, CSS, and JavaScript
- Leaflet for the map
- Committed JSON data generated from the itinerary CSV
- GitHub Pages deployment via Actions

## Local Workflow
1. Keep the source itinerary CSV in the vault project:
   - `/Users/er/Library/Mobile Documents/iCloud~md~obsidian/Documents/BaseCamp/Projects/Iceland Trip Guide/source/itinerary.csv`
2. Rebuild site data:
   - `npm run build:data`
3. Verify the generated output:
   - `npm run check:data`
4. Preview locally:
   - `python3 -m http.server 4173`

## Data Files
- `data/stops.json`
  Runtime data used by the site.
- `data/geocode-cache.json`
  Cached geocoding results for deterministic rebuilds.

## Notes
- Geocoding is a build-time step only.
- The browser never calls the geocoder directly.
- The map uses OpenStreetMap tiles and keeps visible attribution.
