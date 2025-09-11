# backend/agent_service/app.py
from __future__ import annotations

from flask import Flask, request, jsonify, render_template, abort
import asyncio
import uuid
import os
import datetime as dt
import traceback
import json
import threading
import redis
from typing import Any, Dict, List, Union

from dotenv import load_dotenv
from agents.orchestrator import OrchestratorAgent
from core.config import get_settings

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")


# --------------------------- Redis setup --------------------------- #

def get_redis_client() -> redis.Redis:
    settings = get_settings()
    # Prefer REDIS_URL, fall back to REDIS_INTERNAL_URL, then local
    url = settings.REDIS_URL or settings.REDIS_INTERNAL_URL or "redis://localhost:6379"
    print(f"Attempting to connect to Redis at: {url}")
    client = redis.from_url(url, decode_responses=True)
    client.ping()
    print("✅ Successfully connected to Redis!")
    return client


try:
    report_storage = get_redis_client()
except Exception as e:
    print(f"❌ Redis connection failed: {e}")
    report_storage = None


# --------------------------- Helpers --------------------------- #

def now_iso() -> str:
    return dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc).isoformat()


def _as_dict(obj: Any) -> Dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    # Pydantic v2 / v1 compatible getter
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
    prop_payload: Dict[str, Any]
) -> Dict[str, Any]:
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
    full: Union[Dict[str, Any], Any]
) -> Dict[str, Any]:
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
        if isinstance(o, (dt.datetime,)):
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
        print(f"[{report_id}] [DEBUG] Normalized payload keys: {sorted(list(property_data.keys()))}")
        print(f"[{report_id}] [DEBUG] Normalized payload values → sqft={property_data.get('sqft')} "
              f"estimatePerSqft={property_data.get('estimatePerSqft')}")

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
    """
    Accepts either:
      { ...flat property fields... }
    or
      { "property_data": { ...flat property fields... } }
    or
      { "property": { ...flat property fields... } }
    """
    if not report_storage:
        return jsonify({"error": "Report storage not available"}), 503

    # Parse raw JSON
    try:
        raw = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    # Normalize wrapper → a flat dict of property fields
    if isinstance(raw.get("property_data"), dict):
        payload = raw["property_data"]
        wrapper = "property_data"
    elif isinstance(raw.get("property"), dict):
        payload = raw["property"]
        wrapper = "property"
    else:
        payload = raw
        wrapper = "(none)"

    report_id = str(uuid.uuid4())
    print(f"[{report_id}] Received /api/analyze-property request. Generated ID.")
    print(f"[{report_id}] [DEBUG] Incoming POST keys: {sorted(list(raw.keys()))} (wrapper: {wrapper})")
    print(f"[{report_id}] [DEBUG] POST.sqft={raw.get('sqft')}  POST.estimatePerSqft={raw.get('estimatePerSqft')}")
    if isinstance(raw.get(wrapper if wrapper in ("property_data", "property") else ""), dict):
        sub = raw[wrapper]
        print(f"[{report_id}] [DEBUG] POST.{wrapper}.sqft={sub.get('sqft')}  "
              f"POST.{wrapper}.estimatePerSqft={sub.get('estimatePerSqft')}")

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

    threading.Thread(
        target=run_orchestrator_in_background,
        args=(report_id, payload),
        daemon=True
    ).start()
    print(f"[{report_id}] Started background thread and sending immediate response.")

    return jsonify({"reportId": report_id})


@app.route("/api/report/status", methods=["GET"])
def report_status():
    """Small JSON endpoint so the Node client can poll progress."""
    if not report_storage:
        return jsonify({"error": "Report storage not available"}), 503
    report_id = request.args.get("reportId")
    if not report_id:
        return jsonify({"error": "reportId required"}), 400
    data_str = report_storage.get(report_id)
    if not data_str:
        return jsonify({"status": "not_found"}), 404
    data = json.loads(data_str)
    return jsonify({
        "status": data.get("status", "unknown"),
        "reportId": data.get("report_id", report_id),
        "updated_at": data.get("updated_at"),
    })


@app.route("/report", methods=["GET"])
def get_report():
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
    # Local dev only
    app.run(host="0.0.0.0", port=5000, debug=False)
