# app/routers/reports.py
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from typing import Dict, Any
from models.property import PropertyDetails
from models.report import ReportStatus, DetailedReport
from services.report_service import ReportService
from dependencies import get_report_service
import uuid
from pathlib import Path

router = APIRouter(tags=["reports"])

@router.post("/quickreport", response_model=Dict[str, Any])
async def generate_quick_report(
    property_details: PropertyDetails,
    background_tasks: BackgroundTasks,
    report_service: ReportService = Depends(get_report_service)
):
    print(f"Received request with data: {property_details.dict()}")
    """Generate a quick renovation ROI report."""
    # Generate report ID
    report_id = f"r_{uuid.uuid4().hex[:12]}"
    
    try:
        # Generate quick insights
        quick_insights = await report_service.generate_quick_insights(property_details)
        
        # Store report status
        await report_service.create_report(
            report_id=report_id,
            property_details=property_details,
            quick_insights=quick_insights
        )
        
        # Schedule detailed report generation in background
        background_tasks.add_task(
            report_service.generate_detailed_report_background,
            report_id,
            property_details
        )
        
        return {
            "success": True,
            "reportId": report_id,
            "quickInsights": quick_insights
        }
        
    except Exception as e:
        # Log the error
        print(f"Error generating quick report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

BASE_DIR = Path(__file__).resolve().parent.parent  # This gets the agent_service directory
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Modify the existing report endpoint
@router.get("/report/{report_id}", response_class=HTMLResponse)
async def get_report(request: Request, report_id: str, report_service: ReportService = Depends(get_report_service)):
    """Get a report by ID."""
    report = await report_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Check if detailed report is still processing
    if report.status == "processing":
        return templates.TemplateResponse(
            "processing.html",  # Create a processing page template
            {
                "request": request,
                "report_id": report_id,
                "property": report.property,
                "quick_insights": report.quick_insights,
                "progress": report.progress if hasattr(report, "progress") else "Generating detailed analysis..."
            }
        )
    
    # Return the complete report
    return templates.TemplateResponse(
        "report.html",
        {
            "request": request,
            "report": report,
            "report_id": report_id
        }
    )