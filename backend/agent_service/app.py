from flask import Flask, request, jsonify, render_template
from agents.orchestrator import OrchestratorAgent
import asyncio
import uuid
import os
import datetime              # ADDED: Import datetime
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__, template_folder="templates")

API_KEY = os.getenv("OPENAI_API_KEY")
orchestrator = OrchestratorAgent(api_key=API_KEY, model="gpt-4o")

# In-memory storage for report data (for demonstration; consider a persistent store in production)
report_storage = {}

@app.route("/api/analyze-property", methods=["POST"])
def analyze_property():
    data = request.get_json()
    # Get URL from top-level or within property_data
    url = data.get("url") or (data.get("property_data") or {}).get("url")
    if not url or ("redfin" not in url and "zillow" not in url):
        return jsonify({"error": "Please provide a valid Redfin or Zillow URL."}), 400

    property_data = data.get("property_data") or {}
    print("Received property_data:", property_data)
    
    # Process the property data using your orchestrator
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        full_report = loop.run_until_complete(orchestrator.generate_full_report(property_data))
    finally:
        loop.close()
    
    # ADDED: Set a created_at timestamp so report.html can call .strftime() on it
    full_report["created_at"] = datetime.datetime.now()
    
    # Generate a unique report ID and store it in the report_storage
    report_id = str(uuid.uuid4())
    # ADDED: Also store the report_id within the report data for template access
    full_report["report_id"] = report_id
    report_storage[report_id] = full_report
    print("Stored report for ID:", report_id)
    
    # Return the report ID and any quick insights
    return jsonify({
        "reportId": report_id,
        "quick_insights": full_report.get("quick_insights", {})
    })

@app.route("/report", methods=["GET"])
def report():
    # Retrieve the report ID from query parameters
    report_id = request.args.get("reportId")
    if not report_id or report_id not in report_storage:
        return "Report not found", 404

    report_data = report_storage[report_id]
    # Render report.html with the actual report data using Jinja templating
    return render_template("report.html", report=report_data)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
