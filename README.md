# Cycle Path

This project is based on [OpenSaas](https://opensaas.sh) template and consists of three main dirs:
1. `app` - Your web app, built with [Wasp](https://wasp.sh).
2. `e2e-tests` - [Playwright](https://playwright.dev/) tests for your Wasp web app.
3. `blog` - Your blog / docs, built with [Astro](https://docs.astro.build) based on [Starlight](https://starlight.astro.build/) template.

For more details, check READMEs of each respective directory!

## Chart Tooltip & Crosshair — Mobile Touch Handling

The temperature chart (`CycleChartPage.tsx`) uses a fully custom tooltip and crosshair overlay on top of ApexCharts. Native ApexCharts tooltip/crosshair are disabled; all interaction is driven by canvas-level `mousemove`, `click`, `touchstart`, `touchmove`, and `touchend` listeners.

Key design decisions for mobile touch:

- **Tooltip pointer-events split by breakpoint.** The tooltip outer wrapper (including the "shield" padding) uses `pointer-events-none md:pointer-events-auto`. On mobile (`<md`) touches pass through the tooltip so adjacent chart nodes remain tappable. On desktop (`>=md`) the shield intercepts hover events, preventing the tooltip from jumping while the cursor travels toward the Edit button.
- **ApexCharts elements are `pointer-events: none`.** Markers, data labels, grid, and plot-area SVG elements have `pointer-events: none !important` via CSS so they don't intercept touch or mouse events before our custom handlers.
- **Touch pins without toggle.** On `touchend`, the tapped day is always pinned (no toggle-off). Tapping outside the chart or on a day with no data dismisses the tooltip. Desktop click retains toggle behavior.
- **Tolerant Y-bounds for touch.** `resolveDay()` accepts a `tolerant` flag (used by touch handlers) that adds 30 px vertical padding to the plot-area hit region, compensating for imprecise finger taps.
- **Separate document-level dismiss handlers.** Outside-chart dismissal uses `pointerdown` (mouse only, skips `pointerType === 'touch'`) and a dedicated document-level `touchstart` for touch, avoiding race conditions between pointer and touch event sequences.

## Note on Fly.io Deployment

The files `app/fly-server.toml` and `app/fly-client.toml` still reference the original Fly.io app names (`my-cycle-monitor-app-server` and `my-cycle-monitor-app-client`). If you redeploy under a new Fly.io app name, update the `app` field in each of these files and recreate the apps via the Fly.io CLI (`fly apps create`).
