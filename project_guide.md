# Project Overview

This is a bare-bones prototype of an AEC product for the 113 final. It must be a web app.

The purpose of this project is to let users quickly understand and experience the idea behind the real product. It is not intended to be production-ready, technically complete, or numerically precise. A short, convincing end-to-end experience is more important than engineering every feature in depth.

# Product Experience

The prototype should communicate this workflow:

**stack diagram + 3D massing -> program allocation -> simple economics -> conversational revision -> saved scheme version**

The prototype organizes work as **Project -> Scheme -> Version**. A project may contain multiple schemes, and each scheme may contain multiple version snapshots.

The user should be able to:

1. Create a project and give it a name. The project starts with its first scheme.
2. Upload a stack diagram, such as `ref_images/stack_diagram.png`.
3. Have the diagram interpreted through the OpenAI API, called by the backend hosted on Render.
4. See the interpreted information reconstructed as a clean stack diagram in the web app.
5. Upload an STL file for the scheme. Additional schemes may use different STL files.
6. Optionally upload reference images associated with the scheme and view them on the scheme page.
7. See the massing divided into programs using the interpreted stack diagram.
8. See approximate physical quantities and simple economic calculations for each program and for the overall scheme.
9. Use a chatbot to request a change, such as: "From 20' to 40', make it 40% retail and 60% back of house."
10. Make multiple conversational changes in a working draft, then use **Save as new version** to create the next version of the same scheme, such as `Scheme 1 v2`, while preserving the earlier version.
11. Select any two scheme versions and compare the pair of renders with the most similar filenames and their key metrics side by side.

The chatbot belongs on a dedicated **Version Revision** page between Economics and Comparison. Under the chatbot, show the current program height, efficiency, value/SF, cost/SF, and the reference image's interpreted elevation-to-program ranges.

# Prototype Priorities

This is a brief demonstration project. Prioritize the following, in order:

1. The complete user journey works from beginning to end.
2. The interface clearly communicates what the full product could become.
3. Changes to the stack or program visibly affect the massing information and economics.
4. The experience feels responsive, coherent, and visually clean.
5. Calculations and geometry are plausible enough for a demonstration.

Do not over-engineer this prototype. Simplified rules, rough assumptions, and limited edge-case handling are acceptable. Calculations do not need to be suitable for design, construction, appraisal, or investment decisions. When approximate values are shown, the interface should make it clear that they are conceptual estimates.

# Stack Diagram Interpretation

The OpenAI response should describe a series of vertical zones. Each zone needs:

- A display name
- A bottom elevation
- A top elevation
- A program mix whose values add up to approximately 1.0

The response should correspond to the uploaded image. For `ref_images/stack_diagram.png`, the expected interpretation is approximately:

```json
{
  "zones": [
    {
      "name": "0'-20'",
      "bottom": 0,
      "top": 20,
      "mix": { "retail": 0.63, "boh": 0.37 }
    },
    {
      "name": "20'-40'",
      "bottom": 20,
      "top": 40,
      "mix": { "retail": 0.43, "parking": 0.57 }
    },
    {
      "name": "40'-120'",
      "bottom": 40,
      "top": 120,
      "mix": {
        "parking": 0.77,
        "townhome": 0.13,
        "undefined residential": 0.10
      }
    },
    {
      "name": "120'-135'",
      "bottom": 120,
      "top": 135,
      "mix": { "amenity": 1.0 }
    },
    {
      "name": "135'-335'",
      "bottom": 135,
      "top": 335,
      "mix": { "apartments": 1.0 }
    },
    {
      "name": "335'-350'",
      "bottom": 335,
      "top": 350,
      "mix": { "amenity": 1.0 }
    },
    {
      "name": "350'-559'",
      "bottom": 350,
      "top": 559,
      "mix": { "condos": 1.0 }
    },
    {
      "name": "559'-574'",
      "bottom": 559,
      "top": 574,
      "mix": { "amenity": 1.0 }
    },
    {
      "name": "574'-589'",
      "bottom": 574,
      "top": 589,
      "mix": { "mechanical": 1.0 }
    }
  ]
}
```

Strict JSON is preferred because it is easy to validate, store, revise, and display. For the prototype, it is acceptable to use simple cleanup or fallback values when the AI response is incomplete.

# Geometry and Calculations

Geometry and calculations may use simplified assumptions. The goal is to show the relationship between the building form, program, and economics—not to produce professional-grade analysis.

Acceptable simplifications include:

- Estimating contours or floor plates from STL geometry
- Using average or bounding-box dimensions when detailed geometry is difficult
- Allocating area in proportion to each zone's program mix
- Using a small set of editable assumptions for cost, rent, sale value, and efficiency
- Applying calculations uniformly across a program type
- Rounding values for clarity

Whenever possible, deterministic application code should perform the area and economic calculations after OpenAI interprets the diagram or chatbot request. This keeps the demonstration stable and understandable.

# Chatbot Behavior

The chatbot exists to demonstrate conversational editing of a scheme. OpenAI translates the request into validated structured operations, while deterministic application code applies the change and recalculates the scheme. The supported changes are:

- Change a program's height
- Change a program's efficiency
- Change a program's value per square foot
- Change a program's cost per square foot
- Change the program allocation within an elevation range

Multiple supported changes in one request are applied together. Program parameters apply globally within the new version, and allocation changes may split existing elevation zones. Requests outside these five change types should receive a brief "not supported yet" response and keep the current scheme unchanged.

Successful chatbot revisions accumulate in a working draft. A new version is created only when the user selects **Save as new version**; saving preserves the earlier version and commits all accumulated changes together.

# Data to Record

For each project, record enough information to restore the demonstration. Organize the data by schemes and their version snapshots:

- Project name
- Scheme name and version
- Uploaded stack diagram
- Interpreted zones and program mixes
- Uploaded STL file
- Scheme reference images
- Approximate physical quantities
- Approximate economic results

A lightweight in-memory approach is acceptable for the local prototype; data may clear on page refresh.

# Interface and CSS

Use a clean, simple visual style. Store shared fonts, colors, spacing, and other design tokens in one central location so the application feels consistent.

The interface should emphasize visual understanding over dense technical detail. It should be obvious how the stack diagram, massing, program areas, and economics relate to one another.

# Architecture and Deployment

- Test the complete application locally first.
- Host the frontend on GitHub Pages.
- Host the backend on Render.
- The frontend must call the Render backend for OpenAI and processing tasks.
- Never expose the OpenAI API key in frontend code or commit it to Git.
- During local development, the key may be read from an ignored `secret.txt` file.
- On Render, store the key as an environment variable.

# Decision Rule

When a decision is not defined here and the choice could noticeably change the product experience, ask the project owner instead of inventing behavior. For small implementation details that do not affect the experience, choose the simplest reasonable option and keep moving.

# Definition of Success

The prototype is successful when a reviewer can compare schemes within a project, accumulate conversational changes, and save them as a visible new version with updated approximate economics.
