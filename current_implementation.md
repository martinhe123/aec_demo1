# Current Implementation

This document summarizes the current prototype and cross-references the intended experience in [`project_guide.md`](project_guide.md).

## Overview

The application implements the guide's primary workflow:

> stack diagram + 3D massing → program allocation → simple economics → conversational revision → saved scheme version

It is a working demonstration of the product idea, not a production AEC tool. Geometry, quantities, and economics are intentionally approximate, consistent with the priorities in [`project_guide.md` — Prototype Priorities](project_guide.md#prototype-priorities).

## User Experience

Cross-reference: [`project_guide.md` — Product Experience](project_guide.md#product-experience)

The experience is organized into five pages:

1. **Inputs** — create a project and scheme, then upload that scheme's stack diagram, STL model, and optional reference images.
2. **Scheme** — review the interpreted program stack, interactive 3D massing, and approximate program areas.
3. **Economics** — review conceptual value and cost and edit assumptions.
4. **Version Revision** — accumulate changes to the active scheme through chat, then save the complete draft as a new version. The page also exposes the current program heights, efficiencies, value/SF, cost/SF, calculation basis, and interpreted elevation ranges.
5. **Comparison** — select two exact scheme versions and compare their closest filename-matched renders plus key metrics side by side.

| Guide requirement | Current implementation |
| --- | --- |
| Stack interpretation | The FastAPI backend sends the image to OpenAI and returns structured program zones. A fixed demo result is available as a fallback. |
| STL massing | The browser parses the STL and displays the real mesh in an interactive Three.js viewer. |
| Program allocation | The massing is colored by the interpreted elevation zones and program ratios. |
| Project schemes | Each project can contain multiple independently selectable schemes, each with its own STL and inputs. |
| Reference images | Up to six images can be stored and viewed with each scheme version. |
| Physical quantities | Program areas are estimated from the STL footprint, zone heights, and program ratios. |
| Economics | Editable value/SF and cost/SF assumptions produce conceptual totals by program. |
| Conversational revision | OpenAI converts natural-language requests into validated changes to program height, efficiency, value, cost, or elevation-range allocation. Successful requests accumulate in the active draft and recalculate the stack, massing colors, and economics. |
| Saved versions | Each scheme preserves selectable snapshots. Only **Save as new version** commits the accumulated draft as the next version. |
| Scheme comparison | Two independently selected scheme versions are shown side by side with one reference render and matching area, value, cost, and margin metrics. |

## Architecture

Cross-reference: [`project_guide.md` — Architecture and Deployment](project_guide.md#architecture-and-deployment)

### Frontend

The frontend uses HTML, CSS, and native JavaScript modules:

- [`js/inputs.js`](js/inputs.js) — uploads and stack interpretation
- [`js/scheme.js`](js/scheme.js) — stack, program schedule, and 3D massing
- [`js/economics.js`](js/economics.js) — quantities and economics
- [`js/chat.js`](js/chat.js) — conversational program changes
- [`js/comparison.js`](js/comparison.js) — side-by-side scheme/version comparison
- [`js/state.js`](js/state.js) — session-only in-memory state

Three.js is kept in a self-contained browser bundle generated from [`three-viewer.js`](three-viewer.js).

### Backend

[`server.py`](server.py) is a FastAPI application served by Uvicorn. It:

- Serves the frontend during local development
- Provides `/api/health`
- Provides `/api/analyze-stack`
- Provides `/api/revise-scheme`
- Calls the OpenAI Responses API with structured output; stack-image interpretation uses the stronger `gpt-6.1-sol` model by default, while text revisions retain the faster model
- Keeps the OpenAI key on the server
- Returns stable demo data when OpenAI is unavailable

Dependencies are defined in [`requirements.txt`](requirements.txt) and [`package.json`](package.json).

## Data and Calculations

Cross-references:

- [`project_guide.md` — Geometry and Calculations](project_guide.md#geometry-and-calculations)
- [`project_guide.md` — Data to Record](project_guide.md#data-to-record)

Project information, schemes, version snapshots, images, zones, assumptions, chat messages, and original STL data are held in memory for the current page session. Refreshing the page clears the complete project state.

The main conceptual assumptions are:

- STL bounding-box width × depth represents the building footprint.
- Floor counts use program-specific heights from 10 to 20 feet rather than one universal floor-to-floor assumption.
- Value uses each program's efficiency-adjusted area; cost continues to use gross area.
- Program area is allocated using each zone's program ratios.
- Value and cost are calculated uniformly per square foot.
- STL units are inferred from model size.

These values are recalculated in deterministic browser code whenever the program changes.

## Current Limitations

The following are the main differences between the current prototype and a fuller product:

- **Projects are temporary.** Refreshing or closing the page clears all project data; nothing synchronizes between browsers, devices, or deployed sessions.
- **Chat behavior is intentionally narrow.** It supports program height, efficiency, value, cost, and elevation-range allocation changes, not general architectural conversation.
- **Geometry and economics are conceptual.** The massing is visually colored by program, but the mesh is not divided into separate solids.
- **There is no user account or server-side project database.**
- **Deployment is documented but not automated.** The intended targets remain GitHub Pages for the frontend and Render for the backend.

## Status Against the Definition of Success

Cross-reference: [`project_guide.md` — Definition of Success](project_guide.md#definition-of-success)

The prototype currently supports the complete demonstration flow. A reviewer can create a project with multiple schemes and different STL models, interpret a stack diagram, understand the connection between program and economics, apply a conversational program change, and compare the resulting scheme version with its earlier snapshot.

The most important future improvement would be portable project storage so the current in-memory scheme and version hierarchy survives refreshes. The current implementation is otherwise aligned with the intentionally brief and approximate scope defined in `project_guide.md`.
