from __future__ import annotations

import json
import os
import re
from datetime import datetime, time
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__, template_folder="templates", static_folder="static")

SCHEDULE_FILE = os.path.join(os.path.dirname(__file__), "room_schedule.json")
PERIOD_DEFINITIONS = [
    {"label": "8:00 am - 9:20 am", "start": "08:00", "end": "09:20"},
    {"label": "9:30 am - 10:50 am", "start": "09:30", "end": "10:50"},
    {"label": "11:00 am - 12:20 pm", "start": "11:00", "end": "12:20"},
    {"label": "12:30 pm - 1:50 pm", "start": "12:30", "end": "13:50"},
    {"label": "2:00 pm - 3:20 pm", "start": "14:00", "end": "15:20"},
    {"label": "3:30 pm - 4:50 pm", "start": "15:30", "end": "16:50"},
    {"label": "5:00 pm - 6:20 pm", "start": "17:00", "end": "18:20"},
]
PERIOD_MAP = {period["label"]: period for period in PERIOD_DEFINITIONS}


def normalize_room_name(room: Any) -> str | None:
    if not isinstance(room, str):
        return None
    name = room.strip().upper()
    return name if name else None


def is_valid_room_name(room_name: Any) -> bool:
    if not isinstance(room_name, str):
        return False
    candidate = room_name.strip().upper()
    if not candidate:
        return False
    if candidate == "UB0000" or candidate.startswith("MON ") or candidate.startswith("TUE "):
        return False
    if candidate.startswith("WED ") or candidate.startswith("THU ") or candidate.startswith("FRI "):
        return False
    if candidate.startswith("SAT ") or candidate.startswith("SUN "):
        return False
    return bool(re.match(r"^[A-Z0-9]+-[0-9]{1,3}[A-Z]?$", candidate))


def parse_room_segments(room_name: str) -> list[str]:
    if not isinstance(room_name, str) or not room_name.strip():
        return []

    parts = [segment.strip() for segment in room_name.split(";") if segment.strip()]
    room_codes: list[str] = []
    for part in parts:
        if ":" in part:
            room_code = part.rsplit(":", 1)[-1].strip().upper()
            if room_code:
                room_codes.append(room_code)
                continue
        room_codes.append(part.upper())
    return room_codes


def add_booking(room: str, day: str, start: str, end: str, course: str, rooms: dict[str, list[dict[str, str]]]) -> None:
    room_name = normalize_room_name(room)
    if not room_name:
        return

    rooms.setdefault(room_name, []).append(
        {
            "day": day.strip().upper() if isinstance(day, str) else "",
            "start": start[:5],
            "end": end[:5],
            "course": course,
        }
    )


def normalize_day(day: Any) -> str | None:
    if not isinstance(day, str):
        return None
    value = day.strip().upper()
    valid_days = {"SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"}
    return value if value in valid_days else None


def room_is_excluded(room_name: Any) -> bool:
    if not isinstance(room_name, str):
        return True
    name = room_name.strip().upper()
    if not name:
        return True
    if name.startswith("FT11") or name == "UB0000":
        return True
    return not is_valid_room_name(name)


def load_schedule() -> dict[str, Any]:
    if os.path.exists(SCHEDULE_FILE):
        try:
            with open(SCHEDULE_FILE, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, ValueError):
            pass

    return {"rooms": []}


def parse_time(value: str) -> time:
    return datetime.strptime(value.strip(), "%H:%M").time()


def times_overlap(start_a: time, end_a: time, start_b: time, end_b: time) -> bool:
    return start_a < end_b and start_b < end_a


def room_is_free(room: dict[str, Any], period: dict[str, str], day: str | None = None) -> bool:
    period_start = parse_time(period["start"])
    period_end = parse_time(period["end"])
    normalized_day = day.strip().upper() if isinstance(day, str) else None

    for booking in room.get("bookings", []):
        booking_day = booking.get("day")
        if normalized_day is not None and booking_day != normalized_day:
            continue

        booking_start = parse_time(booking["start"])
        booking_end = parse_time(booking["end"])
        if times_overlap(period_start, period_end, booking_start, booking_end):
            return False

    return True


def build_room_response(schedule: dict[str, Any], day: str | None = None) -> list[dict[str, Any]]:
    normalized_day = normalize_day(day) if day is not None else None
    rooms: list[dict[str, Any]] = []
    for room in schedule.get("rooms", []):
        room_name = room.get("name")
        if room_is_excluded(room_name):
            continue
        rooms.append(
            {
                "name": room_name,
                "free_periods": [
                    period["label"]
                    for period in PERIOD_DEFINITIONS
                    if room_is_free(room, period, normalized_day)
                ],
            }
        )
    return rooms


@app.route("/", methods=["GET"])
def home() -> str:
    return render_template("index.html")


@app.route("/api/room-schedule", methods=["GET"])
def api_room_schedule() -> tuple[str, int]:
    schedule = load_schedule()
    day = request.args.get("day")
    normalized_day = None
    if day is not None:
        normalized_day = normalize_day(day)
        if normalized_day is None:
            return jsonify(
                {
                    "error": "Invalid day. Use Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, or Saturday.",
                    "available_days": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                }
            ), 400

    return jsonify(
        {
            "source": "room_schedule.json",
            "rooms": build_room_response(schedule, normalized_day),
            "periods": [period["label"] for period in PERIOD_DEFINITIONS],
        }
    ), 200


@app.route("/api/free-rooms", methods=["GET", "POST"])
def api_free_rooms() -> tuple[str, int]:
    payload: dict[str, Any] = {}
    if request.method == "POST" and request.is_json:
        payload = request.get_json(silent=True) or {}
    else:
        payload["period"] = request.args.get("period")
        payload["day"] = request.args.get("day")

    period_label = payload.get("period")
    if isinstance(period_label, str):
        period_label = period_label.strip()

    if not period_label or period_label not in PERIOD_MAP:
        return jsonify(
            {
                "error": "Invalid period. Use one of the labels from /api/room-schedule.",
                "available_periods": [p["label"] for p in PERIOD_DEFINITIONS],
            }
        ), 400

    day = payload.get("day")
    if isinstance(day, str):
        day = day.strip()
    normalized_day = normalize_day(day)
    if normalized_day is None:
        return jsonify(
            {
                "error": "Invalid or missing day. Use Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, or Saturday.",
                "available_days": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            }
        ), 400

    schedule = load_schedule()
    free_rooms = [
        room["name"]
        for room in schedule.get("rooms", [])
        if not room_is_excluded(room.get("name")) and room_is_free(room, PERIOD_MAP[period_label], normalized_day)
    ]

    return jsonify(
        {
            "period": period_label,
            "day": day,
            "free_rooms": free_rooms,
        }
    ), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8989)), debug=False)
