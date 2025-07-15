from flask import Flask, request, jsonify, render_template, abort
import asyncio
import uuid
import os
import datetime
import traceback
import re
import json
import threading

from dotenv import load_dotenv
from agents.orchestrator import OrchestratorAgent

load_dotenv()

app = Flask(__name__, template_folder="templates")

# --- In-memory Storage ---
report_storage = {}

# --- Helper Functions ---
def safe_float_from_price(price_str):
    """
    Cleans a price string by removing currency symbols and commas.
    Returns a float, or 0.0 if cleaning fails.
    """
    if price_str is None:
        return 0.0
    if isinstance(price_str, (int, float)):
        return float(price_str)
    try:
        cleaned_str = re.sub(r'[$,\s]', '', str(price_str))
        return float(cleaned_str)
    except (ValueError, TypeError):
        print(f"Warning: Could not convert price string '{price_str}' to float.")
        return 0.0

def run_orchestrator_in_background(report_id, property_data):
    """
    Runs the entire async orchestration in a dedicated event loop in a new thread.
    """
    # --- FIX: Instantiate the orchestrator INSIDE the thread ---
    API_KEY = os.getenv("OPENAI_API_KEY")
    if not API_KEY:
        print(f"[{report_id}] ERROR: OPENAI_API_KEY not found in background thread.")
        report_storage[report_id].update({"status": "failed", "error": "API Key not configured."})
        return
        
    orchestrator = OrchestratorAgent(api_key=API_KEY, model="gpt-4o")
    
    # --- FIX: Use asyncio.run() for robust loop management ---
    async def main():
        """A wrapper to run the async orchestrator."""
        print(f"[{report_id}] Background async main function started.")
        report = await orchestrator.generate_full_report(property_data)
        print(f"[{report_id}] Background async main function finished.")
        return report

    try:
        # asyncio.run() creates and closes the loop automatically.
        full_report = asyncio.run(main())
        
        report_property_data = full_report.get("property", property_data)

        report_storage[report_id].update({
             "status": "completed",
             "property": report_property_data,
             "updated_at": datetime.datetime.now(),
             "detailed_report": full_report.get("detailed_report"),
             "market_summary": full_report.get("market_summary") or full_report.get("detailed_report", {}).get("market_summary"),
             "quick_insights": full_report.get("quick_insights", {}),
             "error": full_report.get("error")
        })
        print(f"[{report_id}] Stored 'completed' report from background thread.")

    except Exception as e:
        print(f"[{report_id}] EXCEPTION during background orchestration: {str(e)}")
        print(f"[{report_id}] Traceback: {traceback.format_exc()}")
        report_storage[report_id].update({
            "status": "failed", 
            "error": str(e),
            "updated_at": datetime.datetime.now()
        })
        print(f"[{report_id}] Stored 'failed' report from background thread.")


# --- API Endpoints ---
@app.route("/api/analyze-property", methods=["POST"])
def analyze_property():
    """
    Receives property data, cleans it, starts the orchestrator in a background thread,
    and immediately returns a reportId.
    """
    data = request.get_json()
    url = data.get("url") or (data.get("property_data") or {}).get("url")
    if not url or ("redfin" not in url and "zillow" not in url):
        print("API Error: Invalid URL provided.")
        return jsonify({"error": "Please provide a valid Redfin or Zillow URL."}), 400

    property_data = data.get("property_data") or {}
    print("Received property_data (summary):", {
        k: v for k, v in property_data.items() if k not in ['description', 'images']
    })
    if 'images' in property_data:
        print(f"Received {len(property_data.get('images', []))} image(s).")

    property_data['price'] = safe_float_from_price(property_data.get('price'))
    property_data['estimate'] = safe_float_from_price(property_data.get('estimate'))
    print(f"Cleaned price: {property_data['price']}, Cleaned estimate: {property_data['estimate']}")

    report_id = str(uuid.uuid4())
    print(f"Generated report ID: {report_id}")

    report_storage[report_id] = {
        "report_id": report_id,
        "status": "processing",
        "property": property_data,
        "created_at": datetime.datetime.now(),
        "updated_at": datetime.datetime.now(),
        "error": None
    }
    
    thread = threading.Thread(target=run_orchestrator_in_background, args=(report_id, property_data))
    thread.start()
    print(f"[{report_id}] Orchestration started in a background thread.")

    response_payload = { "reportId": report_id }
    print(f"[{report_id}] Sending immediate response to Node.js:", response_payload)
    return jsonify(response_payload)

@app.route("/api/report/status", methods=["GET"])
def get_report_status():
    """
    A lightweight endpoint for the frontend to poll for the report status.
    """
    report_id = request.args.get("reportId")
    if not report_id or report_id not in report_storage:
        return jsonify({"status": "not_found"}), 404
    
    report = report_storage[report_id]
    return jsonify({
        "status": report.get("status"),
        "error": report.get("error")
    })

@app.route("/report", methods=["GET"])
def report():
    """
    Retrieves report data and renders the template.
    The template itself will handle polling for updates if status is 'processing'.
    """
    report_id = request.args.get("reportId")
    print(f"GET /report request for ID: {report_id}")

    if not report_id or report_id not in report_storage:
        print(f"Report '{report_id}' not found in storage.")
        abort(404)

    report_data = report_storage.get(report_id)
    report_status = report_data.get("status", "unknown")
    print(f"Report '{report_id}' status: {report_status}")

    print("\n--- DEBUG: Data being sent to report.html template ---")
    print(json.dumps(report_data, indent=2, default=str))
    print("--- END DEBUG ---\n")

    if report_status == "completed":
        try:
            if report_data.get("detailed_report") and report_data["detailed_report"].get("renovation_ideas"):
                ideas_list = report_data["detailed_report"]["renovation_ideas"]
                ideas_list.sort(
                    key=lambda idea: float(idea.get('adjusted_roi', '-inf')),
                    reverse=True
                )
                print(f"Sorted {len(ideas_list)} renovation ideas by ROI for report {report_id}.")
        except Exception as sort_err:
             print(f"ERROR sorting renovation ideas for {report_id}: {sort_err}")

    print(f"Rendering report.html for {report_id} with status '{report_status}'")
    return render_template("report.html", report=report_data)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
