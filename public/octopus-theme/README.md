# Octopus theme assets

This folder holds images for the Octopus theme. Add the files below so the theme can use them.

## 1. Ocean floor background

- **Filename:** `ocean-floor.jpg` (or `ocean-floor.jpeg` / `ocean-floor.png` — if you use a different name, change the URL in `src/index.css` in `.theme-octopus body` to match).
- **Usage:** Full-page background when the Octopus theme is active.

If no image is present, the theme uses the default dark gradient.

## 2. Octopus logo (next to “Workroom”)

- **Path:** put your image in this folder: `public/octopus-theme/octopus.png`
- **Filename:** must be exactly `octopus.png`
- **Usage:** Shown next to “Workroom” in the top bar and on the landing page when the Octopus theme is active. Use a transparent or theme-friendly background; recommended size around 24×24 to 48×48 pixels so it scales cleanly.

If the file is missing, the app falls back to the built-in SVG octopus icon.
