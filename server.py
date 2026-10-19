"""FastAPI server for the Forma prototype and OpenAI stack interpretation."""

from __future__ import annotations

import os
import json
import sys
from pathlib import Path
from typing import Literal
from urllib.parse import unquote

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from openai import OpenAI
from pydantic import BaseModel, ConfigDict, Field


ROOT = Path(__file__).resolve().parent
MAX_IMAGE_CHARACTERS = 14 * 1024 * 1024
PORT = int(os.environ.get("PORT", "8000"))


class Zone(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    bottom: float
    top: float
    mix: dict[str, float]


class StackAnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: str = Field(
        min_length=1,
        max_length=MAX_IMAGE_CHARACTERS,
        pattern=r"^data:image/(png|jpe?g|webp);base64,",
    )
    fileName: str | None = Field(default=None, max_length=255)


class StackAnalyzeResponse(BaseModel):
    zones: list[Zone]
    mode: Literal["openai", "demo"]
    warning: str | None = None


ProgramName = Literal[
    "retail", "boh", "parking", "townhome", "undefined residential",
    "apartments", "condos", "amenity", "mechanical", "office", "hotel",
]


class ProgramAssumption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    height: float
    efficiency: float
    value: float
    cost: float


class RevisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=1000)
    zones: list[Zone]
    assumptions: dict[str, ProgramAssumption]


class RevisionMixItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    program: ProgramName
    ratio: float


class RevisionOperation(BaseModel):
    """Flat strict schema; unrelated fields must be null or empty."""

    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "set_program_height", "set_program_efficiency", "set_program_value",
        "set_program_cost", "set_program_allocation",
    ]
    program: ProgramName | None
    value: float | None
    bottom: float | None
    top: float | None
    mix: list[RevisionMixItem]


class RevisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    supported: bool
    reply: str
    operations: list[RevisionOperation]


class StackMixItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    program: str
    ratio: float


class ExtractedZone(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    bottom: float
    top: float
    mix: list[StackMixItem]


class ExtractedStack(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_height: float
    zones: list[ExtractedZone]


DEMO_ZONES = [
    Zone(name="0'-20'", bottom=0, top=20, mix={"retail": 0.63, "boh": 0.37}),
    Zone(name="20'-40'", bottom=20, top=40, mix={"retail": 0.43, "parking": 0.57}),
    Zone(
        name="40'-120'",
        bottom=40,
        top=120,
        mix={"parking": 0.77, "townhome": 0.13, "undefined residential": 0.10},
    ),
    Zone(name="120'-135'", bottom=120, top=135, mix={"amenity": 1.0}),
    Zone(name="135'-335'", bottom=135, top=335, mix={"apartments": 1.0}),
    Zone(name="335'-350'", bottom=335, top=350, mix={"amenity": 1.0}),
    Zone(name="350'-559'", bottom=350, top=559, mix={"condos": 1.0}),
    Zone(name="559'-574'", bottom=559, top=574, mix={"amenity": 1.0}),
    Zone(name="574'-589'", bottom=574, top=589, mix={"mechanical": 1.0}),
]


app = FastAPI(
    title="Forma AEC Prototype API",
    version="1.0.0",
    description="Conceptual stack-diagram interpretation for the Forma demo.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def read_api_key() -> str | None:
    """Read the API key from the environment, then from an ignored local file."""
    environment_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if environment_key:
        return environment_key

    secret_path = ROOT / "secret.txt"
    if not secret_path.exists():
        return None
    value = secret_path.read_text(encoding="utf-8").strip()
    if "=" in value:
        name, possible_key = value.split("=", 1)
        if name.strip() == "OPENAI_API_KEY":
            value = possible_key.strip().strip('"\'')
    return value or None


def call_openai(image_data_url: str) -> list[Zone]:
    key = read_api_key()
    if not key:
        raise RuntimeError("No OpenAI API key is configured")

    client = OpenAI(api_key=key, timeout=75.0)
    response = client.responses.create(
        model=os.environ.get("OPENAI_STACK_MODEL", "gpt-6.1-sol"),
        store=False,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Read this architectural stack diagram carefully from bottom to top. Identify every "
                            "horizontal program boundary and every vertical dimension label. Dimension labels may "
                            "describe segment heights rather than cumulative elevations: add segment heights to "
                            "produce continuous bottom and top elevations starting at 0 feet. Use the drawing's "
                            "overall-height dimension as a cross-check so the final top is close to the labeled "
                            "total. Preserve mixed-use zones and estimate their program ratios from the relative "
                            "horizontal widths; ratios in each zone must sum to 1. Use concise lowercase canonical "
                            "program names such as retail, boh, parking, townhome, undefined residential, amenity, "
                            "apartments, condos, mechanical, office, or hotel. Return zones in ascending order with "
                            "no gaps or overlaps. Round every elevation, segment height, and total height to the "
                            "nearest whole foot; do not return fractional-foot elevations. Program ratios may remain "
                            "decimal fractions and must still sum to 1. This is conceptual extraction."
                        ),
                    },
                    {"type": "input_image", "image_url": image_data_url, "detail": "high"},
                ],
            }
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": "stack_diagram",
                "strict": True,
                "schema": ExtractedStack.model_json_schema(),
            }
        },
    )
    if not response.output_text:
        raise RuntimeError("OpenAI returned no structured stack data")

    print("\n[Forma] Raw OpenAI stack response:", file=sys.stdout, flush=True)
    print(response.output_text, file=sys.stdout, flush=True)

    extracted = ExtractedStack.model_validate_json(response.output_text)
    if not extracted.zones:
        raise RuntimeError("No zones were found in the image")

    final_top = max(zone.top for zone in extracted.zones)
    scale = 1.0
    if extracted.total_height > 0 and final_top > 0 and abs(final_top - extracted.total_height) > 2:
        scale = extracted.total_height / final_top

    zones: list[Zone] = []
    for extracted_zone in extracted.zones:
        bottom = round(extracted_zone.bottom * scale)
        top = round(extracted_zone.top * scale)
        mix = {item.program: item.ratio for item in extracted_zone.mix}
        zones.append(
            Zone(
                name=f"{bottom:g}'-{top:g}'",
                bottom=bottom,
                top=top,
                mix=mix,
            )
        )
    print("\n[Forma] Normalized stack zones returned to the frontend:", file=sys.stdout, flush=True)
    print(
        json.dumps({"zones": [zone.model_dump() for zone in zones], "mode": "openai"}, indent=2),
        file=sys.stdout,
        flush=True,
    )
    return zones


def validate_revision(result: RevisionResponse, payload: RevisionRequest) -> RevisionResponse:
    """Reject model output unless every operation is safe and internally consistent."""
    if not result.supported:
        result.operations = []
        return result
    if not result.operations:
        raise ValueError("A supported revision must include at least one operation")

    range_bottom = min((zone.bottom for zone in payload.zones), default=None)
    range_top = max((zone.top for zone in payload.zones), default=None)
    scalar_types = {
        "set_program_height", "set_program_efficiency",
        "set_program_value", "set_program_cost",
    }
    for operation in result.operations:
        if operation.type in scalar_types:
            if operation.program is None or operation.value is None:
                raise ValueError(f"{operation.type} requires a program and value")
            if operation.type == "set_program_height" and operation.value <= 0:
                raise ValueError("Program height must be greater than zero")
            if operation.type == "set_program_efficiency" and not 0 <= operation.value <= 1:
                raise ValueError("Program efficiency must be between 0 and 1")
            if operation.type in {"set_program_value", "set_program_cost"} and operation.value < 0:
                raise ValueError("Program value and cost cannot be negative")
            if operation.bottom is not None or operation.top is not None or operation.mix:
                raise ValueError(f"{operation.type} contains unrelated fields")
            continue

        if operation.program is not None or operation.value is not None:
            raise ValueError("Program allocation contains unrelated scalar fields")
        if operation.bottom is None or operation.top is None or operation.bottom >= operation.top:
            raise ValueError("Program allocation requires a valid bottom and top elevation")
        if range_bottom is None or range_top is None:
            raise ValueError("A stack must be interpreted before changing program allocation")
        if operation.bottom < range_bottom or operation.top > range_top:
            raise ValueError("Program allocation must remain within the current building range")
        if not operation.mix:
            raise ValueError("Program allocation requires at least one program")
        programs = [item.program for item in operation.mix]
        if len(programs) != len(set(programs)):
            raise ValueError("Program allocation cannot contain duplicate programs")
        if any(item.ratio < 0 or item.ratio > 1 for item in operation.mix):
            raise ValueError("Program allocation ratios must be between 0 and 1")
        if abs(sum(item.ratio for item in operation.mix) - 1) > 0.001:
            raise ValueError("Program allocation ratios must total 1")
    return result


def call_openai_revision(payload: RevisionRequest) -> RevisionResponse:
    key = read_api_key()
    if not key:
        raise RuntimeError("No OpenAI API key is configured")

    current_state = {
        "zones": [zone.model_dump() for zone in payload.zones],
        "assumptions": {name: values.model_dump() for name, values in payload.assumptions.items()},
    }
    client = OpenAI(api_key=key, timeout=75.0)
    response = client.responses.create(
        model=os.environ.get("OPENAI_REVISION_MODEL", os.environ.get("OPENAI_MODEL", "gpt-4.1-mini")),
        store=False,
        input=[
            {
                "role": "system",
                "content": (
                    "Translate the user's AEC scheme revision into structured operations. Only program height, "
                    "program efficiency, program value per square foot, program cost per square foot, and program "
                    "allocation within an elevation range are supported. Multiple supported changes may be returned "
                    "and are applied atomically. Map back of house, back-of-house, and service to boh; apartment to "
                    "apartments; condo to condos. Convert percentages to ratios from 0 to 1. Never invent a missing "
                    "program, number, percentage, or range. For anything outside the five supported change types, set "
                    "supported false, reply exactly 'That type of revision is not supported yet.', and return no "
                    "operations. For scalar operations set program and value, bottom and top to null, and mix to an "
                    "empty list. For allocation set program and value to null and provide bottom, top, and the complete "
                    "mix. Acknowledge supported changes concisely. Do not calculate project economics."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Current scheme state:\n{json.dumps(current_state, separators=(',', ':'))}\n\n"
                    f"Requested revision:\n{payload.message}"
                ),
            },
        ],
        text={"format": {
            "type": "json_schema", "name": "scheme_revision", "strict": True,
            "schema": RevisionResponse.model_json_schema(),
        }},
    )
    if not response.output_text:
        raise RuntimeError("OpenAI returned no structured revision")

    print("\n[Forma] Raw OpenAI revision response:", file=sys.stdout, flush=True)
    print(response.output_text, file=sys.stdout, flush=True)
    result = RevisionResponse.model_validate_json(response.output_text)
    return validate_revision(result, payload)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True, "openaiConfigured": bool(read_api_key())}


@app.post("/api/analyze-stack", response_model=StackAnalyzeResponse)
def analyze_stack(payload: StackAnalyzeRequest) -> StackAnalyzeResponse:
    if not read_api_key():
        return StackAnalyzeResponse(zones=DEMO_ZONES, mode="demo")
    try:
        zones = call_openai(payload.image)
        return StackAnalyzeResponse(zones=zones, mode="openai")
    except Exception as error:  # Keep the conceptual UI usable if the API call fails.
        print(f"Stack analysis fallback: {error}", file=sys.stderr)
        return StackAnalyzeResponse(zones=DEMO_ZONES, mode="demo", warning=str(error))


@app.post("/api/revise-scheme", response_model=RevisionResponse)
def revise_scheme(payload: RevisionRequest) -> RevisionResponse:
    if not read_api_key():
        raise HTTPException(status_code=503, detail="Revision service is not configured")
    try:
        return call_openai_revision(payload)
    except ValueError as error:
        print(f"Revision validation rejected: {error}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        print(f"Revision service failed: {error}", file=sys.stderr, flush=True)
        raise HTTPException(status_code=503, detail="Revision service is temporarily unavailable") from error


@app.get("/{request_path:path}", include_in_schema=False)
def serve_static(request_path: str) -> FileResponse:
    relative = unquote(request_path).lstrip("/") or "index.html"
    requested = (ROOT / relative).resolve()
    try:
        relative_parts = requested.relative_to(ROOT).parts
    except ValueError as error:
        raise HTTPException(status_code=403, detail="Forbidden") from error
    if not requested.is_file() or requested.name == "secret.txt" or any(part.startswith(".") for part in relative_parts):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(requested)


if __name__ == "__main__":
    default_host = "0.0.0.0" if os.environ.get("RENDER") else "127.0.0.1"
    address = os.environ.get("HOST", default_host)
    print(f"Forma is running at http://{address}:{PORT}")
    uvicorn.run(app, host=address, port=PORT)
