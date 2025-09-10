from flask import Blueprint, request, jsonify, render_template
from services.report_service import ReportService
from models.property_model import PropertyDetails
import traceback

reports_bp = Blueprint('reports', __name__)
report_service = ReportService()

@reports_bp.route('/api/analyze-property', methods=['POST'])
def generate_report():
    """Receives property data and starts the report generation process."""
    try:
        data = request.get_json()
        if not data or 'property_data' not in data:
            return jsonify({"error": "Invalid request. 'property_data' is required."}), 400
        
        # The main entry point for the background task
        report_id = report_service.start_report_generation(data['property_data'])
        
        return jsonify({"reportId": report_id}), 202 # 202 Accepted
        
    except Exception as e:
        print(f"CRITICAL ERROR in /api/analyze-property endpoint: {e}")
        print(traceback.format_exc())
        return jsonify({"error": "An internal error occurred."}), 500

@reports_bp.route('/report', methods=['GET'])
def get_report():
    """Serves the final report HTML page."""
    report_id = request.args.get('reportId')
    if not report_id:
        return "Report ID is required.", 400

    report_data = report_service.get_report(report_id)
    if not report_data:
        # This could be because the report is still processing or failed.
        # The frontend will poll the status endpoint to know for sure.
        return render_template('processing.html', reportId=report_id)
        
    # If the report is complete, render it.
    # The ReportService now returns a Pydantic model, so we convert it to a dict.
    return render_template('report.html', report=report_data.dict())

@reports_bp.route('/api/report/status', methods=['GET'])
def get_report_status():
    """Allows the frontend to poll for the report generation status."""
    report_id = request.args.get('reportId')
    if not report_id:
        return jsonify({"error": "Report ID is required."}), 400
        
    status_data = report_service.get_report_status(report_id)
    return jsonify(status_data)

