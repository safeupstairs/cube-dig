# The Cube Dig

Side-view prestige digger: tunnel down through fog toward a buried cube core. Click exposed blocks, place diggers, build industry, prestige for permanent power.

## Run

```bash
python3 -m http.server 3480
```

Open `http://localhost:3480`

## Controls

- **Drag** — pan
- **Scroll** — zoom
- **Click** — dig/chop exposed tiles only (or place worker/building)
- **Esc** — clear tool / close ending

Dirt takes multiple hits. Unrevealed depths stay black until your shaft reaches them.

Progress autosaves in `localStorage` (`cube-dig-v2`).
