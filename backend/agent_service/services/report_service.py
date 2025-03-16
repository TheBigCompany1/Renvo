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
from ..agents.orchestrator import OrchestratorAgent
from ..core.config import get_settings

class ReportService:
    """Service for managing renovation reports."""
    
    def __init__(self, settings = None):
        """Initialize with configuration."""
        if settings is None:
            from ..core.config import get_settings
            settings = get_settings()
            
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

        print(f"Creating report with ID: {report_id}")

        report = ReportStatus(
            report_id=report_id,
            status="processing",
            property=property_details,
            quick_insights=QuickInsights(**quick_insights)
        )
        
        # Store in memory (replace with database call)
        self.reports[report_id] = report
        print(f"Report created. All report IDs in storage: {list(self.reports.keys())}")

        return report
    
    async def get_report(self, report_id: str) -> Optional[ReportStatus]:
        """Get a report by ID."""
        print(f"Looking for report with ID: {report_id}")
        print(f"Available IDs: {list(self.reports.keys())}")
        report = self.reports.get(report_id)
        return report
    
    async def update_report(
        self,
        report_id: str,
        status: str,
        detailed_report: Optional[Dict[str, Any]] = None,
        error: Optional[str] = None,
        progress: Optional[str] = None 
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
        if progress: 
            report.progress = progress
        
        # Save updated report
        self.reports[report_id] = report
        return report
    
    async def generate_detailed_report_background(self, report_id: str, property_details: PropertyDetails):
        """Generate detailed report in the background."""
        try:
            # Update status to show we're starting
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing property data..."
            )
            
            # Step 1: Generate initial renovation ideas
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Generating renovation ideas..."
            )
            
            # Generate full report (step by step with updates)
            # Step 1: Get initial ideas
            initial_ideas = await self.orchestrator.text_agent.process(property_details.dict())
            
            # Update status
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing images and refining ideas..."
            )
            
            # Step 2: Process images if available
            image_urls = property_details.images
            if image_urls:
                refined_ideas = await self.orchestrator.image_agent.process(initial_ideas, image_urls)
            else:
                refined_ideas = initial_ideas
            
            # Update status
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing market conditions..."
            )
            
            # Step 3: Market analysis
            address = property_details.address
            if address:
                market_adjusted = await self.orchestrator.market_agent.process(address, refined_ideas)
            else:
                market_adjusted = refined_ideas
            
            # Step 4: Compile final report
            full_report = self.orchestrator._compile_full_report(
                property_details.dict(), 
                initial_ideas, 
                refined_ideas, 
                market_adjusted
            )
            
            # Update report status to completed
            await self.update_report(
                report_id=report_id,
                status="completed",
                detailed_report=full_report
            )
            
        except Exception as e:
            print(f"Error generating detailed report: {str(e)}")
            
            # Update report with error
            await self.update_report(
                report_id=report_id,
                status="failed",
                error=str(e)
            )