# backend/agent_service/app.py
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import threading
import traceback
import uuid
from typing import Any, Dict, List, Union

import redis
from dotenv import load_dotenv
from flask import Flask, abort, jsonify, render_template, request

from agents.orchestrator import OrchestratorAgent

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")


# --------------------------- Redis setup --------------------------- #

def get_redis_client() -> redis.Redis | None:
    """Create a Redis client from env vars and verify connectivity."""
    url = os.getenv("REDIS_URL") or os.getenv("REDIS_INTERNAL_URL", "redis://localhost:6379")
    try:
        print(f"Attempting to connect to Redis at: {url}")
        client = redis.from_url(url, decode_responses=True)
        client.ping()
        print("✅ Successfully connected to Redis!")
        return client
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        return None


report_storage = get_redis_client()


# --------------------------- Helper utils --------------------------- #

def now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def _as_dict(obj: Any) -> Dict[str, Any]:
    """Leniently coerce any pydantic/dataclass/object to a plain dict for templating/logging."""
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except Exception:
                pass
    try:
        return json.loads(json.dumps(obj, default=lambda o: getattr(o, "__dict__", str(o))))
    except Exception:
        return {}


def _coerce_list(v: Any) -> List[Any]:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def build_template_from_property(
    report_id: str,
    created_at: str,
    updated_at: str,
    status: str,
    prop_payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Bare-minimum report shell used for initial 'processing' and failure cases."""
    prop = _as_dict(prop_payload) or {}
    property_block = {
        "address": prop.get("address") or prop.get("fullAddress") or "",
        "price": prop.get("price"),
        "beds": prop.get("beds"),
        "baths": prop.get("baths"),
        "sqft": prop.get("sqft"),
        "yearBuilt": prop.get("yearBuilt") or prop.get("year_built"),
        "lotSize": prop.get("lotSize") or prop.get("lot_size"),
        "images": prop.get("images") or prop.get("imageUrls") or [],
        "description": prop.get("description") or "",
        "estimatePerSqft": prop.get("estimatePerSqft"),
        "source": prop.get("source"),
        "url": prop.get("url"),
    }
    return {
        "report_id": report_id,
        "status": status,
        "created_at": created_at,
        "updated_at": updated_at,
        "property": property_block,
        "detailed_report": {
            "renovation_ideas": [],
            "comparable_properties": [],
            "recommended_contractors": [],
            "market_summary": "",
            "investment_thesis": "",
        },
    }


def build_template_from_fullreport(
    report_id: str,
    created_at: str,
    updated_at: str,
    status: str,
    full: Union[Dict[str, Any], Any],
) -> Dict[str, Any]:
    """Normalize a FullReport (pydantic) to the Jinja template dict shape."""
    body = _as_dict(full)
    prop = _as_dict(body.get("property_details") or {})
    property_block = {
        "address": prop.get("address") or "",
        "price": prop.get("price"),
        "beds": prop.get("beds"),
        "baths": prop.get("baths"),
        "sqft": prop.get("sqft"),
        "yearBuilt": prop.get("yearBuilt") or prop.get("year_built"),
        "lotSize": prop.get("lotSize") or prop.get("lot_size"),
        "images": prop.get("images") or [],
        "description": prop.get("description") or "",
        "estimatePerSqft": prop.get("estimatePerSqft"),
        "source": prop.get("source"),
        "url": prop.get("url"),
    }

    ideas = [_as_dict(x) for x in _coerce_list(body.get("renovation_projects"))]
    comps = [_as_dict(x) for x in _coerce_list(body.get("comparable_properties"))]
    pros = [_as_dict(x) for x in _coerce_list(body.get("recommended_contractors"))]

    for it in ideas:
        it["estimated_cost"] = _as_dict(it.get("estimated_cost") or {})
        it["estimated_value_add"] = _as_dict(it.get("estimated_value_add") or {})

    tmpl = {
        "report_id": report_id,
        "status": status,
        "created_at": created_at,
        "updated_at": updated_at,
        "property": property_block,
        "detailed_report": {
            "renovation_ideas": ideas,
            "comparable_properties": comps,
            "recommended_contractors": pros,
            "market_summary": body.get("market_summary", ""),
            "investment_thesis": body.get("investment_thesis", ""),
        },
    }
    if body.get("error"):
        tmpl["error"] = body.get("error")
    return tmpl


def json_dumps(data: Dict[str, Any]) -> str:
    def default(o):
        if isinstance(o, dt.datetime):
            return o.isoformat()
        try:
            return _as_dict(o)
        except Exception:
            return str(o)

    return json.dumps(data, default=default)


# --------------------------- Background task --------------------------- #

def run_orchestrator_in_background(report_id: str, property_data: Dict[str, Any]) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        print(f"[{report_id}] Background orchestration thread started.")
        orchestrator = OrchestratorAgent()
        full_report = loop.run_until_complete(
            orchestrator.generate_full_report(property_data)
        )

        template_payload = build_template_from_fullreport(
            report_id=report_id,
            created_at=now_iso(),
            updated_at=now_iso(),
            status="complete",
            full=full_report,
        )
        if report_storage:
            report_storage.set(report_id, json_dumps(template_payload))
            print(f"[{report_id}] ✅ Stored completed report in Redis.")
        else:
            print(f"[{report_id}] ⚠ No Redis; report not persisted.")

    except Exception as e:
        print(f"[{report_id}] ❌ CRITICAL EXCEPTION during background orchestration: {e}")
        print(traceback.format_exc())

        fail_payload = build_template_from_property(
            report_id=report_id,
            created_at=now_iso(),
            updated_at=now_iso(),
            status="failed",
            prop_payload=property_data,
        )
        fail_payload["error"] = str(e)
        if report_storage:
            report_storage.set(report_id, json_dumps(fail_payload))
            print(f"[{report_id}] ❌ Stored 'failed' report in Redis due to critical exception.")
        else:
            print(f"[{report_id}] ⚠ No Redis; failed report not persisted.")


# --------------------------- Routes --------------------------- #

@app.route("/", methods=["GET"])
def root():
    abort(404)


@app.route("/api/analyze-property", methods=["POST"])
def analyze_property():
    """Entry point invoked by the Node scraper service."""
    if not report_storage:
        return jsonify({"error": "Report storage not available"}), 503

    # Always generate report_id first so logs can reference it
    report_id = str(uuid.uuid4())
    print(f"[{report_id}] Received /api/analyze-property request. Generated ID.")

    # Read raw JSON as-is (no coercion) for maximum visibility
    try:
        payload = request.get_json(force=True) or {}
    except Exception:
        print(f"[{report_id}] ❌ Invalid JSON in POST body.")
        return jsonify({"error": "Invalid JSON"}), 400

    # ── DEBUG: show exactly what arrived from Node ─────────────────────────────
    try:
        keys = sorted(list(payload.keys()))
        top_sqft = payload.get("sqft")
        top_epsf = payload.get("estimatePerSqft")
        maybe_prop = payload.get("property") if isinstance(payload.get("property"), dict) else None
        print(f"[{report_id}] [DEBUG] Incoming POST keys: {keys}")
        print(f"[{report_id}] [DEBUG] POST.sqft={top_sqft}  POST.estimatePerSqft={top_epsf}")
        if maybe_prop is not None:
            pk = sorted(list(maybe_prop.keys()))
            print(f"[{report_id}] [DEBUG] POST.property keys: {pk}")
            print(
                f"[{report_id}] [DEBUG] POST.property.sqft={maybe_prop.get('sqft')}  "
                f"POST.property.estimatePerSqft={maybe_prop.get('estimatePerSqft')}"
            )
    except Exception as e:
        print(f"[{report_id}] [DEBUG] Error logging incoming payload: {e}")
    # ───────────────────────────────────────────────────────────────────────────

    # Store initial 'processing' shell so the report page has something to render
    initial = build_template_from_property(
        report_id=report_id,
        created_at=now_iso(),
        updated_at=now_iso(),
        status="processing",
        prop_payload=payload,
    )
    print(f"[{report_id}] Attempting to write initial 'processing' status to Redis...")
    report_storage.set(report_id, json_dumps(initial))
    print(f"[{report_id}] ✅ Successfully wrote initial status to Redis.")

    # Spawn the orchestrator in a background thread
    threading.Thread(
        target=run_orchestrator_in_background,
        args=(report_id, payload),
        daemon=True,
    ).start()
    print(f"[{report_id}] Started background thread and sending immediate response.")

    return jsonify({"reportId": report_id})


@app.route("/api/report/status", methods=["GET"])
def report_status():
    """Lightweight JSON endpoint for the Node client to poll progress."""
    if not report_storage:
        return jsonify({"error": "Report storage not available"}), 503

    report_id = request.args.get("reportId")
    if not report_id:
        return jsonify({"error": "reportId required"}), 400

    data_str = report_storage.get(report_id)
    if not data_str:
        return jsonify({"status": "not_found"}), 404

    data = json.loads(data_str)
    return jsonify(
        {
            "status": data.get("status", "unknown"),
            "reportId": data.get("report_id", report_id),
            "updated_at": data.get("updated_at"),
        }
    )


@app.route("/report", methods=["GET"])
def get_report():
    """Render the human-facing HTML report from what we stored in Redis."""
    if not report_storage:
        abort(503)

    report_id = request.args.get("reportId")
    if not report_id:
        abort(400)

    report_str = report_storage.get(report_id)
    if not report_str:
        abort(404)

    report_data = json.loads(report_str)
    for key in ("created_at", "updated_at"):
        v = report_data.get(key)
        if isinstance(v, str):
            try:
                report_data[key] = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
            except Exception:
                pass

    return render_template("report.html", report=report_data)


if __name__ == "__main__":
    # On Render this block is typically ignored (Gunicorn is used),
    # but it’s handy for local runs.
    app.run(host="0.0.0.0", port=5000, debug=False)
