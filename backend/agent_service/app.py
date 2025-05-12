# app.py - With ROI Sorting

from flask import Flask, request, jsonify, render_template, abort
from agents.orchestrator import OrchestratorAgent
import asyncio
import uuid
import os
import datetime
import traceback
import re # Import re for cleaning price strings

from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, template_folder="templates")

API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    print("ERROR: OPENAI_API_KEY environment variable not set.")
orchestrator = OrchestratorAgent(api_key=API_KEY, model="gpt-4o")

# In-memory storage remains
report_storage = {}


# Helper function to safely get float from potential string like '$1,234.56' or None
def safe_float_from_price(price_str):
    if price_str is None:
        return 0.0
    if isinstance(price_str, (int, float)): # Already a number
        return float(price_str)
    try:
        # Remove '$', ',', handle potential spaces
        cleaned_str = re.sub(r'[$,\s]', '', str(price_str))
        return float(cleaned_str)
    except (ValueError, TypeError):
        print(f"Warning: Could not convert price string '{price_str}' to float.")
        return 0.0


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
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))
        print(f"[{report_id}] Synchronous orchestration finished.")

        # Prepare data for storage - use helper to clean price/estimate early
        report_property_data = full_report.get("property", property_data)
        # Ensure estimate and price are stored as floats if possible for easier use later
        report_property_data['estimate'] = safe_float_from_price(report_property_data.get('estimate'))
        report_property_data['price'] = safe_float_from_price(report_property_data.get('price'))


        report_storage[report_id] = {
             "report_id": report_id,
             "status": "completed", # Mark as completed directly
             "property": report_property_data, # Store cleaned property data
             "created_at": datetime.datetime.now(),
             "updated_at": datetime.datetime.now(),
             "detailed_report": full_report.get("detailed_report"),
             # market_summary might be inside detailed_report now, adjust if needed
             "market_summary": full_report.get("market_summary") or full_report.get("detailed_report", {}).get("market_summary"),
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

    response_payload = {
        "reportId": report_id,
        "quick_insights": report_storage.get(report_id, {}).get("quick_insights", {})
    }
    print(f"[{report_id}] Sending response payload to Node.js:", response_payload)
    return jsonify(response_payload)


@app.route("/report", methods=["GET"])
def report():
    """
    Retrieves report data, sorts renovation ideas by ROI, and renders the template.
    """
    report_id = request.args.get("reportId")
    print(f"GET /report request for ID: {report_id}")

    if not report_id or report_id not in report_storage:
        print(f"Report '{report_id}' not found in storage.")
        abort(404) # Use abort for standard Flask error handling

    report_data = report_storage.get(report_id)
    report_status = report_data.get("status", "unknown")
    print(f"Report '{report_id}' status: {report_status}")

    if report_status == "failed":
         error_message = report_data.get('error', 'Unknown error')
         print(f"Rendering error page/message for {report_id}: {error_message}")
         # Optionally render an error template: return render_template("error.html", error=error_message), 500
         return f"Report generation failed for ID {report_id}. Error: {error_message}", 500
    elif report_status == "completed":
        # --- Add Sorting Logic Here ---
        try:
            if report_data.get("detailed_report") and report_data["detailed_report"].get("renovation_ideas"):
                ideas_list = report_data["detailed_report"]["renovation_ideas"]
                # Sort by 'adjusted_roi' descending. Treat missing/None ROI as lowest (-infinity).
                ideas_list.sort(
                    key=lambda idea: float(idea.get('adjusted_roi', '-inf')),
                    reverse=True
                )
                print(f"Sorted {len(ideas_list)} renovation ideas by ROI for report {report_id}.")
            else:
                 print(f"No renovation ideas found to sort for report {report_id}.")
        except Exception as sort_err:
             # Log error but don't fail the whole report rendering if sorting fails
             print(f"ERROR sorting renovation ideas for {report_id}: {sort_err}")
             print(traceback.format_exc())
        # --- End Sorting Logic ---

        print(f"Rendering report.html for {report_id}")
        return render_template("report.html", report=report_data)
    else:
         print(f"Unexpected status '{report_status}' for {report_id} in sync flow.")
         abort(500, description=f"Report has unexpected status: {report_status}")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)