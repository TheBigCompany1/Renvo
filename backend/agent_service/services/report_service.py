# app/services/report_service.py
from typing import Dict, Any, Optional
from ..models.property import PropertyDetails
from ..models.renovation import QuickInsights
from ..models.report import ReportStatus, DetailedReport
from fastapi import Depends
import json
import asyncio
import os
import sys

# Add the parent directory to sys.path to import agents
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
from agents.orchestrator import OrchestratorAgent
from app.core.config import get_settings

class ReportService:
    """Service for managing renovation reports."""
    
    def __init__(self, settings = Depends(get_settings)):
        """Initialize with configuration."""
        self.orchestrator = OrchestratorAgent(
            api_key=settings.openai_api_key,
            model=settings.openai_model
        )
        # In-memory storage for now - replace with database in production
        self.reports = {}
    
    async def generate_quick_insights(self, property_details: PropertyDetails) -> Dict[str, Any]:
        """Generate quick insights for a property."""
        return await self.orchestrator.generate_quick_insights(property_details.dict())
    
    async def create_report(
        self,
        report_id: str,
        property_details: PropertyDetails,
        quick_insights: Dict[str, Any]
    ) -> ReportStatus:
        """Create a new report entry."""
        report = ReportStatus(
            report_id=report_id,
            status="processing",
            property=property_details,
            quick_insights=QuickInsights(**quick_insights)
        )
        
        # Store in memory (replace with database call)
        self.reports[report_id] = report
        return report
    
    async def get_report(self, report_id: str) -> Optional[ReportStatus]:
        """Get a report by ID."""
        return self.reports.get(report_id)
    
    async def update_report(
        self,
        report_id: str,
        status: str,
        detailed_report: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None
    ) -> Optional[ReportStatus]:
        """Update an existing report."""
        report = self.reports.get(report_id)
        if not report:
            return None
        
        report.status = status
        if detailed_report:
            report.detailed_report = detailed_report
        if error:
            report.error = error
        
        # Save updated report
        self.reports[report_id] = report
        return report
    
    async def generate_detailed_report_background(self, report_id: str, property_details: PropertyDetails):
        """Generate detailed report in the background."""
        try:
            # Generate full report
            full_report = await self.orchestrator.generate_full_report(property_details.dict())
            
            # Update report status
            await self.update_report(
                report_id=report_id,
                status="completed",
                detailed_report=full_report
            )
            
        except Exception as e:
            # Log the error
            print(f"Error generating detailed report: {str(e)}")
            
            # Update report with error
            await self.update_report(
                report_id=report_id,
                status="failed",
                error=str(e)
            )