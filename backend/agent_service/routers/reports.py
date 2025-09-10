from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from services.report_service import ReportService, get_report_service
from models.property_model import PropertyDetails
import json

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.post("/api/analyze-property")
async def analyze_property(
    property_data: PropertyDetails, 
    service: ReportService = Depends(get_report_service)
):
    """Receives property data and starts the background analysis."""
    report_id = await service.start_analysis(property_data)
    return {"reportId": report_id}

@router.get("/report")
async def get_report_page(
    reportId: str, 
    request: Request, 
    service: ReportService = Depends(get_report_service)
):
    """Serves the report page, showing processing status or the final report."""
    status = await service.get_status(reportId)
    
    if not status:
        raise HTTPException(status_code=404, detail="Report not found.")

    if status in ["processing", "pending"]:
        return templates.TemplateResponse("processing.html", {
            "request": request,
            "report_id": reportId,
            "status": status
        })
    
    if status == "failed":
        report_data = await service.get_report(reportId)
        # Even on failure, we can show the property data that was submitted
        return templates.TemplateResponse("report.html", {
            "request": request,
            "report": report_data,
            "error": "An error occurred during analysis."
        })

    report_data = await service.get_report(reportId)
    if not report_data:
        raise HTTPException(status_code=404, detail="Report data not found, though status was complete.")

    return templates.TemplateResponse("report.html", {
        "request": request, 
        "report": report_data.dict() # Convert Pydantic model to dict for template
    })

@router.get("/api/report/status")
async def get_report_status(
    reportId: str, 
    service: ReportService = Depends(get_report_service)
):
    """API endpoint for the frontend to poll for the report status."""
    status = await service.get_status(reportId)
    if not status:
        raise HTTPException(status_code=404, detail="Report not found.")
    
    final_report = None
    if status == "completed":
        final_report = await service.get_report(reportId)

    return {
        "reportId": reportId, 
        "status": status,
        "report": final_report.dict() if final_report else None
    }

