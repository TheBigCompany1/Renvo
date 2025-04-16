# app.py - Reverted to SYNCHRONOUS execution for testing

from flask import Flask, request, jsonify, render_template
from agents.orchestrator import OrchestratorAgent
import asyncio
import uuid
import os
import datetime
import traceback # Keep traceback for logging

from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, template_folder="templates")

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    print("ERROR: OPENAI_API_KEY environment variable not set.")
orchestrator = OrchestratorAgent(api_key=API_KEY, model="gpt-4o") # Keep improved Orchestrator

# In-memory storage remains
report_storage = {}

# REMOVED the /api/report-status endpoint as it's not needed for sync flow

@app.route("/api/analyze-property", methods=["POST"])
def analyze_property():
    """
    Receives property data, runs orchestrator SYNCHRONOUSLY, stores result, returns reportId.
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
        print(f"Received {len(property_data.get('images',[]))} image(s).")

    report_id = str(uuid.uuid4())
    print(f"Generated report ID: {report_id}")
    full_report = None
    processing_error = None

    # --- Run Orchestrator Synchronously ---
    print(f"[{report_id}] Starting SYNCHRONOUS report generation...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Call the orchestrator directly and wait for it to complete
        # Orchestrator function still has detailed logging inside
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))
        print(f"[{report_id}] Synchronous orchestration finished.")
        # Store the full result immediately
        report_storage[report_id] = {
             "report_id": report_id,
             "status": "completed", # Mark as completed directly
             "property": full_report.get("property", property_data),
             "created_at": datetime.datetime.now(),
             "updated_at": datetime.datetime.now(),
             "detailed_report": full_report.get("detailed_report"),
             "market_summary": full_report.get("market_summary"),
             "quick_insights": full_report.get("quick_insights", {}),
             "error": full_report.get("error") # Store error if orchestrator returned one
        }
        print(f"[{report_id}] Stored 'completed' report.")

    except Exception as e:
        print(f"[{report_id}] EXCEPTION during SYNCHRONOUS orchestration: {str(e)}")
        print(f"[{report_id}] Traceback: {traceback.format_exc()}")
        processing_error = str(e)
        # Store failed state
        report_storage[report_id] = {
            "report_id": report_id, "status": "failed", "error": processing_error,
            "property": property_data, "created_at": datetime.datetime.now()
        }
        print(f"[{report_id}] Stored 'failed' report.")
    finally:
        loop.close()
        print(f"[{report_id}] Finished synchronous processing block.")
    # --- End Synchronous Execution ---

    # Return only the reportId and quick_insights (even if processing failed)
    # Node.js will wait for this entire block to finish before getting this response
    response_payload = {
        "reportId": report_id,
        "quick_insights": report_storage.get(report_id, {}).get("quick_insights", {})
    }
    # If there was an error during processing, we might indicate it here
    # although the primary error handling happens when fetching the report later.
    # For now, just return the ID. The stored status will reflect the failure.
    print(f"[{report_id}] Sending response payload to Node.js:", response_payload)
    return jsonify(response_payload)


@app.route("/report", methods=["GET"])
def report():
    """
    Retrieves report data and renders the template.
    No need for status checking here in synchronous flow, assume data is ready if ID exists.
    """
    report_id = request.args.get("reportId")
    print(f"GET /report request for ID: {report_id}")

    if not report_id or report_id not in report_storage:
        print(f"Report '{report_id}' not found in storage.")
        return "Report not found", 404

    report_data = report_storage.get(report_id)
    report_status = report_data.get("status", "unknown")
    print(f"Report '{report_id}' status: {report_status}") # Log status for info

    if report_status == "failed":
         print(f"Rendering error page/message for {report_id}: {report_data.get('error')}")
         return f"Report generation failed for ID {report_id}. Error: {report_data.get('error', 'Unknown error')}", 500
    elif report_status == "completed":
        print(f"Rendering report.html for {report_id}")
        # Pass the whole stored dict to the template
        return render_template("report.html", report=report_data)
    else:
        # Should ideally not happen in sync flow if ID exists, but handle just in case
         print(f"Unexpected status '{report_status}' for {report_id} in sync flow.")
         return f"Report has unexpected status: {report_status}", 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)