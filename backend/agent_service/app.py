# backend/agent_service/app.py
from flask import Flask, request, jsonify, render_template, abort
import asyncio
import uuid
import os
import datetime
import traceback
import re
import json
import threading
import redis

from dotenv import load_dotenv
from agents.orchestrator import OrchestratorAgent

load_dotenv()

app = Flask(__name__, template_folder="templates")

# --- Redis Connection with Enhanced Logging & Error Handling ---
report_storage = None
try:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        raise RuntimeError("FATAL: REDIS_URL environment variable not set.")
    
    print(f"Attempting to connect to Redis at: {redis_url}")
    # decode_responses=True is crucial for getting strings back from Redis instead of bytes
    report_storage = redis.from_url(redis_url, decode_responses=True)
    report_storage.ping()
    print("✅ Successfully connected to Redis!")
except Exception as e:
    print(f"❌ FATAL: Could not connect to Redis. The application will be non-functional. Error: {e}")
    # report_storage remains None if connection fails

# --- Health Check Endpoint ---
@app.route("/healthz")
def health_check():
    return jsonify({"status": "ok"}), 200

# --- Helper Functions ---
def safe_float_from_price(price_str):
    if price_str is None: return 0.0
    if isinstance(price_str, (int, float)): return float(price_str)
    try:
        return float(re.sub(r'[$,\s]', '', str(price_str)))
    except (ValueError, TypeError):
        return 0.0

def run_orchestrator_in_background(report_id, property_data):
    # This background thread now assumes Redis is connected.
    API_KEY = os.getenv("OPENAI_API_KEY")
    if not API_KEY:
        print(f"[{report_id}] ERROR: OPENAI_API_KEY not found in background thread.")
        report_data = json.loads(report_storage.get(report_id) or '{}')
        report_data.update({"status": "failed", "error": "API Key not configured."})
        report_storage.set(report_id, json.dumps(report_data))
        return
        
    orchestrator = OrchestratorAgent(model="gpt-4o")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        print(f"[{report_id}] Background orchestration thread started.")
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))
        
        report_data = json.loads(report_storage.get(report_id) or '{}')
        report_data.update({
             "status": "completed",
             "property": full_report.get("property", property_data),
             "updated_at": datetime.datetime.now().isoformat(),
             "detailed_report": full_report.get("detailed_report"),
             "market_summary": full_report.get("market_summary"),
             "error": full_report.get("error")
        })
        report_storage.set(report_id, json.dumps(report_data))
        print(f"[{report_id}] ✅ Stored 'completed' report in Redis.")

    except Exception as e:
        print(f"[{report_id}] ❌ EXCEPTION during background orchestration: {e}")
        report_data = json.loads(report_storage.get(report_id) or '{}')
        report_data.update({
            "status": "failed", "error": str(e), "updated_at": datetime.datetime.now().isoformat()
        })
        report_storage.set(report_id, json.dumps(report_data))
        print(f"[{report_id}] ❌ Stored 'failed' report in Redis.")
    finally:
        loop.close()

# --- API Endpoints ---
@app.route("/api/analyze-property", methods=["POST"])
def analyze_property():
    if not report_storage:
        print("API call failed: Redis is not connected.")
        return jsonify({"error": "Service is temporarily unavailable due to a database connection issue."}), 503

    report_id = str(uuid.uuid4())
    print(f"[{report_id}] Received /api/analyze-property request. Generated ID.")

    property_data = (request.get_json() or {}).get("property_data", {})
    property_data['price'] = safe_float_from_price(property_data.get('price'))
    property_data['estimate'] = safe_float_from_price(property_data.get('estimate'))

    initial_report = {
        "report_id": report_id, "status": "processing", "property": property_data,
        "created_at": datetime.datetime.now().isoformat(), "updated_at": datetime.datetime.now().isoformat(), "error": None
    }
    
    try:
        print(f"[{report_id}] Attempting to write initial 'processing' status to Redis...")
        report_storage.set(report_id, json.dumps(initial_report))
        report_storage.expire(report_id, 86400) # Expire key after 24 hours
        print(f"[{report_id}] ✅ Successfully wrote initial status to Redis.")
    except Exception as e:
        print(f"[{report_id}] ❌ CRITICAL: Failed to write initial status to Redis. Error: {e}")
        return jsonify({"error": "Failed to initialize report in the database."}), 500
    
    threading.Thread(target=run_orchestrator_in_background, args=(report_id, property_data)).start()
    print(f"[{report_id}] Started background thread and sending immediate response.")
    return jsonify({ "reportId": report_id })

@app.route("/api/report/status", methods=["GET"])
def get_report_status():
    if not report_storage:
        return jsonify({"error": "Service is temporarily unavailable due to a database connection issue."}), 503

    report_id = request.args.get("reportId")
    print(f"Polling for status of report ID: {report_id}")
    
    try:
        report_str = report_storage.get(report_id)
        if not report_str:
            print(f"[{report_id}] ❓ Report not found in Redis during status check.")
            return jsonify({"status": "not_found"}), 404
        
        report = json.loads(report_str)
        status = report.get('status')
        print(f"[{report_id}] ✅ Found report. Current status: '{status}'.")
        return jsonify({"status": status, "error": report.get("error")})

    except Exception as e:
        print(f"[{report_id}] ❌ Error during status check. Error: {e}")
        return jsonify({"error": "Failed to retrieve report status."}), 500

@app.route("/report", methods=["GET"])
def report():
    if not report_storage: abort(503)
        
    report_id = request.args.get("reportId")
    report_str = report_storage.get(report_id)
    if not report_str: abort(404)

    report_data = json.loads(report_str)
    for key in ['created_at', 'updated_at']:
        if key in report_data and isinstance(report_data[key], str):
            report_data[key] = datetime.datetime.fromisoformat(report_data[key])
    
    return render_template("report.html", report=report_data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)

 # Triggering a new build for the staging1234567890