# backend/agent_service/app.py
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

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")

# --------------------------- Redis setup --------------------------- #

def get_redis_client() -> redis.Redis:
    url = os.getenv("REDIS_URL") or os.getenv("REDIS_INTERNAL_URL") or "redis://localhost:6379"
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
    # Pydantic v2 object?
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

def build_template_from_property(report_id: str, created_at: str, updated_at: str, status: str, prop_payload: Dict[str, Any]) -> Dict[str, Any]:
    prop = _as_dict(prop_payload) or {}
    # Try both top-level and nested 'property_data'
    nested = _as_dict(prop.get("property_data") or {})
    src = nested if nested else prop

    property_block = {
        "address": src.get("address") or src.get("fullAddress") or "",
        "price": src.get("price"),
        "beds": src.get("beds"),
        "baths": src.get("baths"),
        "sqft": src.get("sqft") or src.get("livingArea") or src.get("living_sqft"),
        "yearBuilt": src.get("yearBuilt") or src.get("year_built"),
        "lotSize": src.get("lotSize") or src.get("lot_size"),
        "images": src.get("images") or src.get("imageUrls") or [],
        "description": src.get("description") or "",
        "estimatePerSqft": src.get("estimatePerSqft"),
        "estimate": src.get("estimate"),
        "source": src.get("source"),
        "url": src.get("url"),
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

def build_template_from_fullreport(report_id: str, created_at: str, updated_at: str, status: str, full: Union[Dict[str, Any], Any]) -> Dict[str, Any]:
    body = _as_dict(full)
    prop = _as_dict(body.get("property_details") or body.get("property") or {})

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
        "estimate": prop.get("estimate"),
        "source": prop.get("source"),
        "url": prop.get("url"),
    }

    ideas = [_as_dict(x) for x in _coerce_list(body.get("renovation_projects"))]
    comps = [_as_dict(x) for x in _coerce_list(body.get("comparable_properties"))]
    pros  = [_as_dict(x) for x in _coerce_list(body.get("recommended_contractors"))]

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
        orchestrator = OrchestratorAgent()

        # Pass through exactly what arrived from Node so the orchestrator
        # can normalize robustly (handles 'property_data' wrapper).
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))

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
    if not report_storage:
        return jsonify({"error": "Report storage not available"}), 503

    try:
        raw = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    # DEBUG – show the incoming shape and the known sqft/epsf spots
    report_id = str(uuid.uuid4())
    print(f"[{report_id}] Received /api/analyze-property request. Generated ID.")
    try:
        keys = sorted(list(raw.keys()))
        wrapper = "property_data" if isinstance(raw.get("property_data"), dict) else None
        if wrapper:
            print(f"[{report_id}] [DEBUG] Incoming POST keys: {keys} (wrapper: {wrapper})")
            print(f"[{report_id}] [DEBUG] POST.sqft={raw.get('sqft')}  POST.estimatePerSqft={raw.get('estimatePerSqft')}")
            print(f"[{report_id}] [DEBUG] POST.property_data.sqft={raw['property_data'].get('sqft')}  POST.property_data.estimatePerSqft={raw['property_data'].get('estimatePerSqft')}")
        else:
            print(f"[{report_id}] [DEBUG] Incoming POST keys: {keys}")
            print(f"[{report_id}] [DEBUG] POST.sqft={raw.get('sqft')}  POST.estimatePerSqft={raw.get('estimatePerSqft')}")
    except Exception as e:
        print(f"[{report_id}] [DEBUG] Error logging incoming payload: {e}")

    # Persist initial "processing" record
    initial = build_template_from_property(
        report_id=report_id,
        created_at=now_iso(),
        updated_at=now_iso(),
        status="processing",
        prop_payload=raw,
    )
    print(f"[{report_id}] Attempting to write initial 'processing' status to Redis...")
    report_storage.set(report_id, json_dumps(initial))
    print(f"[{report_id}] ✅ Successfully wrote initial status to Redis.")

    # Kick off orchestration
    threading.Thread(target=run_orchestrator_in_background, args=(report_id, raw), daemon=True).start()
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
    # Render binds $PORT; default to 10000 if provided, else 5000 locally
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=False)
