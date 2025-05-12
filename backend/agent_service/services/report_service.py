# app/services/report_service.py
from typing import Dict, Any, Optional
from models.property import PropertyDetails
from models.renovation import QuickInsights
from models.report import ReportStatus, DetailedReport
from fastapi import Depends
import json
import asyncio
import os
import sys

from agents.orchestrator import OrchestratorAgent
from core.config import get_settings

class ReportService:
    """Service for managing renovation reports."""
    
    def __init__(self, settings = None):
        """Initialize with configuration."""
        if settings is None:
            from core.config import get_settings
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
    
    # In gemini/backend/agent_service/services/report_service.py

    async def generate_detailed_report_background(self, report_id: str, property_details: PropertyDetails):
        """Generate detailed report in the background with enhanced logging."""
        print(f"BACKGROUND TASK STARTED for report_id: {report_id}")
        try:
            property_dict = property_details.dict() # Use the dictionary representation

            # Update status to show we're starting
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing property data..."
            )
            print(f"[{report_id}] Status updated: processing - Analyzing property data...")

            # Step 1: Generate initial renovation ideas
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Generating initial renovation ideas..."
            )
            print(f"[{report_id}] Calling TextAnalysisAgent...")
            initial_ideas = await self.orchestrator.text_agent.process(property_dict)
            print(f"[{report_id}] TextAnalysisAgent completed. Result keys: {initial_ideas.keys()}")
            if "error" in initial_ideas:
                print(f"[{report_id}] TextAnalysisAgent returned error: {initial_ideas['error']}")


            # Update status
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing images (if any) and refining ideas..."
            )

            # Step 2: Process images if available
            image_urls = property_details.images # Access images from the Pydantic model directly
            print(f"[{report_id}] Image URLs found: {len(image_urls)}")
            if image_urls:
                print(f"[{report_id}] Calling ImageAnalysisAgent...")
                refined_ideas = await self.orchestrator.image_agent.process(initial_ideas, image_urls)
                print(f"[{report_id}] ImageAnalysisAgent completed. Result keys: {refined_ideas.keys()}")
                if "error" in refined_ideas:
                     print(f"[{report_id}] ImageAnalysisAgent returned error: {refined_ideas['error']}")
            else:
                print(f"[{report_id}] Skipping ImageAnalysisAgent as no image URLs were provided.")
                # If no images, the 'refined_ideas' are just the initial ones for the next step
                refined_ideas = initial_ideas
                # Ensure refined_ideas has the expected structure even if skipping image agent
                if "renovation_ideas" in refined_ideas and "refined_renovation_ideas" not in refined_ideas:
                     refined_ideas["refined_renovation_ideas"] = refined_ideas["renovation_ideas"]


            # Update status
            await self.update_report(
                report_id=report_id,
                status="processing",
                progress="Analyzing market conditions..."
            )

            # Step 3: Market analysis
            address = property_details.address
            print(f"[{report_id}] Address for Market Analysis: {address}")
            if address:
                print(f"[{report_id}] Calling MarketAnalysisAgent...")
                # Pass the 'refined_ideas' (which might be initial_ideas if no images)
                market_adjusted = await self.orchestrator.market_agent.process(address, refined_ideas)
                print(f"[{report_id}] MarketAnalysisAgent completed. Result keys: {market_adjusted.keys()}")
                if "error" in market_adjusted:
                     print(f"[{report_id}] MarketAnalysisAgent returned error: {market_adjusted['error']}")
            else:
                print(f"[{report_id}] Skipping MarketAnalysisAgent as no address was provided.")
                # If no address, the 'market_adjusted' ideas are just the refined ones
                market_adjusted = refined_ideas
                 # Ensure market_adjusted has the expected structure even if skipping market agent
                if "refined_renovation_ideas" in market_adjusted and "market_adjusted_ideas" not in market_adjusted:
                    market_adjusted["market_adjusted_ideas"] = market_adjusted["refined_renovation_ideas"]


            # Step 4: Compile final report
            print(f"[{report_id}] Compiling final report...")
            full_report = self.orchestrator._compile_full_report(
                property_dict,
                initial_ideas,
                refined_ideas,
                market_adjusted
            )
            print(f"[{report_id}] Final report compiled.")

            # Update report status to completed
            await self.update_report(
                report_id=report_id,
                status="completed",
                detailed_report=full_report,
                progress="Report generated successfully." # Add final progress message
            )
            print(f"[{report_id}] Status updated: completed.")

        except Exception as e:
            # Log the specific error
            import traceback
            print(f"[{report_id}] ERROR during background task: {str(e)}")
            print(f"[{report_id}] Traceback: {traceback.format_exc()}")

            # Update report with error status
            try:
                await self.update_report(
                    report_id=report_id,
                    status="failed",
                    error=str(e),
                    progress="Failed to generate report." # Add final progress message
                )
                print(f"[{report_id}] Status updated: failed.")
            except Exception as update_err:
                 print(f"[{report_id}] FAILED TO UPDATE STATUS TO FAILED: {str(update_err)}")