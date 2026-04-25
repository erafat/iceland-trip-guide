# Iceland Trip Guide Design Direction

## Source Reference
- Selected from `VoltAgent/awesome-design-md`: Airbnb.
- Reason: it is the closest content fit for a travel itinerary site because it emphasizes warm travel surfaces, destination photography, rounded filters, and approachable card hierarchy.
- Adaptation rule: borrow the travel-product clarity, not Airbnb branding.

## Visual Theme
- Map-first Iceland travel guide, not a marketing landing page.
- Warm white surfaces over a soft paper-tinted background.
- Real Iceland photography should anchor the hero.
- UI should feel like a polished trip-planning tool: clear, calm, and easy to scan on a phone.

## Palette
- Ink: `#1f1f1f`
- Warm background: `#fff8f3`
- Surface: `#ffffff`
- Coral action accent: `#ff5a5f`
- Deep coral text accent: `#c83d32`
- Glacier link accent: `#075966`
- Moss secondary accent: `#5d7542`
- Sand panel: `#f5f1e8`

## Typography
- Display: Fraunces for destination-scale headings.
- UI/body: Manrope for readable controls and itinerary text.
- Metadata: IBM Plex Mono for dates, labels, durations, and route facts.

## Components
- Use rounded pill day filters and compact rounded cards.
- Keep the map visually dominant after the hero.
- Itinerary cards should prioritize stop name, category, drive/time metadata, note, and map link.
- Weather should stay secondary unless real forecast data is loaded.

## Guardrails
- Do not use generic AI illustration as the primary visual.
- Do not make the page a landing page; the map and itinerary must remain immediately available.
- Do not use neon gradients, glassmorphism, or decorative blobs.
- Keep mobile dense enough for travel use.
