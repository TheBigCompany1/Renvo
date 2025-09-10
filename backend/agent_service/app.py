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
from typing import Any, Dict

from dotenv import load_dotenv
from agents.orchestrator import OrchestratorAgent

load_dotenv()

app = Flask(__name__, template_folder="templates", static_folder="static")

# --------------------------- Redis setup --------------------------- #

def get_redis_client() -> redis.Redis:
    url = os.getenv("REDIS_URL")
    if not url:
        url = os.getenv("REDIS_INTERNAL_URL", "redis://localhost:6379")
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

def pydantic_to_dict(obj: Any) -> Dict[str, Any]:
    """Convert Pydantic v2/v1 models or plain objects to a Python dict."""
    for attr in ("model_dump", "dict"):
        try:
            return getattr(obj, attr)()
        except Exception:
            continue
    try:
        return json.loads(json.dumps(obj, default=lambda o: getattr(o, "__dict__", str(o))))
    except Exception:
        return {}

def json_dumps(data: Dict[str, Any]) -> str:
    def default(o):
        if isinstance(o, (dt.datetime,)):
            return o.isoformat()
        try:
            return pydantic_to_dict(o)
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
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))

        # Serialize FullReport (Pydantic) to plain dict
        report_body = pydantic_to_dict(full_report)
        payload = {
            "status": "complete" if not report_body.get("error") else "failed",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "report": report_body,
        }
        if report_storage:
            report_storage.set(report_id, json_dumps(payload))
            print(f"[{report_id}] ✅ Stored completed report in Redis.")
        else:
            print(f"[{report_id}] ⚠ No Redis; report not persisted.")
    except Exception as e:
        print(f"[{report_id}] ❌ CRITICAL EXCEPTION during background orchestration: {e}")
        print(traceback.format_exc())
        fail_payload = {
            "status": "failed",
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "report": {
                "error": str(e),
                "property_details": property_data,
                "renovation_projects": [],
                "comparable_properties": [],
                "recommended_contractors": [],
                "market_summary": "",
                "investment_thesis": "",
            },
        }
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
        payload = request.get_json(force=True) or {}
    except Exception:
        return jsonify({"error": "Invalid JSON"}), 400

    report_id = str(uuid.uuid4())
    print(f"[{report_id}] Received /api/analyze-property request. Generated ID.")
    initial = {
        "status": "processing",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "report": {
            "error": None,
            "property_details": payload,
            "renovation_projects": [],
            "comparable_properties": [],
            "recommended_contractors": [],
            "market_summary": "",
            "investment_thesis": "",
        },
    }
    print(f"[{report_id}] Attempting to write initial 'processing' status to Redis...")
    report_storage.set(report_id, json_dumps(initial))
    print(f"[{report_id}] ✅ Successfully wrote initial status to Redis.")

    threading.Thread(target=run_orchestrator_in_background, args=(report_id, payload), daemon=True).start()
    print(f"[{report_id}] Started background thread and sending immediate response.")

    return jsonify({"reportId": report_id})

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
    app.run(host="0.0.0.0", port=5000, debug=False)
