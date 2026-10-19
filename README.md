# Forma AEC Prototype

Forma is a dependency-free concept-feasibility web prototype. It connects a stack diagram, an STL massing model, approximate program areas, loose economics, and conversational program revisions.

## Run locally

From this folder:

```powershell
npm install
python -m pip install -r requirements.txt
python server.py
```

Then open `http://127.0.0.1:8000`.

The backend is a FastAPI application served by Uvicorn. While it is running, interactive API documentation is available at `http://127.0.0.1:8000/docs`. You can also start it directly with `uvicorn server:app --host 127.0.0.1 --port 8000`.

The app works without an API key by using the reference stack interpretation from `project_guide.md` as a demo fallback.

For an immediate end-to-end demo, use `ref_images/stack_diagram.png` and `ref_models/demo_massing.stl`.

When a stack image is interpreted, the server terminal logs the raw structured OpenAI response and the normalized zones returned to the frontend. The browser console logs the exact `/api/analyze-stack` response used by the Version Revision range table. Image data and API keys are never included in these logs.

## Enable live stack-diagram interpretation

Either set an `OPENAI_API_KEY` environment variable or create an ignored `secret.txt` file containing:

```text
OPENAI_API_KEY=your-key-here
```

The model can be changed with the optional `OPENAI_MODEL` environment variable. The default is `gpt-4.1-mini`.

## Deployment shape

- Host the static files on GitHub Pages.
- Host `server:app` on Render with the start command `uvicorn server:app --host 0.0.0.0 --port $PORT` and store `OPENAI_API_KEY` as a Render environment variable.
- Before deploying the frontend, set `window.FORMA_API_BASE` in `config.js` to the Render service URL.

## First-pass behavior

- A project can contain multiple schemes. Each scheme has its own STL, inputs, and selectable version history.
- Successful chatbot revisions automatically create the next version within the active scheme; manual version saves are also available.
- The Version Revision page contains the “Revise with Forma” chatbot, current economic parameters, and the reference image's interpreted elevation/program ranges.
- The Comparison page places two selected scheme versions side by side, automatically matching the two reference renders with the most similar filenames and showing their key metrics.
- Projects, schemes, versions, inputs, and assumptions remain in memory for the current page session and clear on refresh.
- Stack interpretation uses OpenAI when configured and a deterministic demo result otherwise.
- Binary and ASCII STL files are parsed and retained locally in the browser for triangle count, physical dimensions, and interactive display.
- The massing view uses Three.js for a dimensionally accurate 3D STL with orbit, pan, zoom, orthographic/perspective cameras, and program-by-elevation coloring. The stack remains a to-scale 2D analytical elevation.
- Program areas use the approximate STL floor plate and program-specific floor heights: 20 feet for retail, BOH, and townhomes; 10 feet for parking, undefined residential, and apartments; 11 feet for condos; and 15 feet for amenity and mechanical space.
- Program efficiencies range from 0% to 90%. Value is applied to efficient area, while cost is applied to gross area.
- Economics use editable value-per-square-foot and cost-per-square-foot assumptions.
- Chat supports elevation-range program changes such as: `From 100' to 120', make it retail.`

All geometry and economics are conceptual and for product demonstration only.

## Frontend modules

The browser application is split by page and responsibility under `js/`:

- `app.js` — startup, routing, and event wiring
- `inputs.js` — stack, STL, and reference-image inputs
- `scheme.js` — program schedule, scaled stack, and Three.js integration
- `economics.js` — area, value, cost, and assumption calculations
- `chat.js` — local conversational program revisions
- `comparison.js` — scheme/version render and metric comparison
- `state.js` — session-only in-memory project and STL state
- `api.js` — FastAPI requests and the offline demo fallback
- `stl.js` — binary and ASCII STL parsing
- `constants.js` and `utils.js` — shared data and helpers

The browser uses a local self-contained Three.js bundle built from the dependency in `node_modules`. If the bundle or WebGL is unavailable, the app keeps the to-scale 2D elevation as a fallback.

After changing `three-viewer.js`, rebuild its browser bundle with `npm run build:3d`.
