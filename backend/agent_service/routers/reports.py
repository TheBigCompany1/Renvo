# app/routers/reports.py
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from typing import Dict, Any
from ..models.property import PropertyDetails
from ..models.report import ReportStatus, DetailedReport
from ..services.report_service import ReportService
import uuid

router = APIRouter(prefix="/api/extension/v1", tags=["reports"])

@router.post("/quickreport", response_model=Dict[str, Any])
async def generate_quick_report(
    property_details: PropertyDetails,
    background_tasks: BackgroundTasks,
    report_service: ReportService = Depends()
):
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

@router.get("/report/{report_id}", response_model=ReportStatus)
async def get_report(report_id: str, report_service: ReportService = Depends()):
    """Get a report by ID."""
    report = await report_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report