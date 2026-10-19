# Engineering Overview

Forma is a lightweight AEC concept-feasibility prototype. It connects an architectural stack image and STL massing model to approximate program areas, economics, conversational revisions, version snapshots, and side-by-side comparison.

## Architecture

- **Frontend:** HTML, CSS, and native JavaScript modules with no UI framework.
- **Backend:** FastAPI served by Uvicorn. It exposes the API and serves the static frontend locally.
- **3D:** Three.js renders the uploaded STL and colors the massing by interpreted program zones. `three-viewer.js` is bundled into `three-viewer.bundle.js` with esbuild.
- **Validation:** Pydantic models validate API requests and strict structured responses from OpenAI.
- **State:** Project, scheme, version, images, chat, and STL data remain in browser memory. Refreshing the page clears the session.

## OpenAI Integration

The OpenAI API is called only by the FastAPI backend, so the API key is never exposed to browser code.

### Stack interpretation

- Endpoint: `POST /api/analyze-stack`
- Default model: **`gpt-6.1-sol`**
- Override: `OPENAI_STACK_MODEL`
- Input: uploaded stack image plus extraction instructions
- Output: strict JSON containing continuous elevation zones and program ratios
- Backend normalization rounds elevations to whole feet and validates the response.
- If OpenAI is unavailable, the prototype returns a fixed demonstration stack.

### Forma revisions

- Endpoint: `POST /api/revise-scheme`
- Default model: **`gpt-4.1-mini`**
- Overrides: `OPENAI_REVISION_MODEL`, then `OPENAI_MODEL`
- Input: natural-language request plus the active zones and program assumptions
- Output: validated operations for program height, efficiency, value/SF, cost/SF, or elevation-range allocation
- Unsupported requests leave the scheme unchanged.

OpenAI interprets intent but does not calculate economics or directly mutate application state. The browser validates and applies the returned operations deterministically and atomically.

## Geometry and Economics

- The STL bounding-box width × depth provides an approximate footprint, with a fallback of 23,000 square feet.
- Zone height divided by the relevant program height estimates the number of floors.
- Gross area is allocated using each zone's program ratio.
- Efficient area = gross area × program efficiency.
- Estimated value = efficient area × value/SF.
- Estimated cost = gross area × cost/SF.
- Value minus cost provides the conceptual margin.

These calculations are intentionally loose and are suitable only for demonstrating the product concept.

## Revisions and Versions

- Forma revisions accumulate in an active working draft.
- Multiple supported changes can be applied before saving.
- Changed parameters, ranges, and resulting economics are highlighted in red against the saved baseline.
- **Save as new version** preserves the baseline and commits the complete draft as the next version.
- Each project may contain multiple schemes, and each scheme may contain multiple versions with independent STL and image data.

## Comparison

The Comparison page lets the user select two exact scheme versions. It chooses the two reference images with the most similar filenames and shows them beside each version's area, value, cost, and margin metrics.

## Security and Configuration

- Local development reads `OPENAI_API_KEY` from the environment or ignored `secret.txt`.
- Render should store `OPENAI_API_KEY` as an environment variable.
- Credential files are excluded through `.gitignore`.
- The backend validates file paths and never serves hidden files or `secret.txt`.

## Main Dependencies

- Python: FastAPI, Uvicorn, OpenAI SDK, and Pydantic
- Browser tooling: Three.js and esbuild

The dependency versions are recorded in `requirements.txt` and `package.json`.

## Prototype Boundaries

- No database, user accounts, or persistent project storage
- Approximate geometry and economics rather than professional analysis
- Limited supported revision operations
- Fixed fallback stack when image interpretation fails
