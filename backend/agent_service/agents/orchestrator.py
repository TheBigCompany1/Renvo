import asyncio
from typing import Dict, Any, List
from models.property_model import PropertyDetails
from models.report import FullReport
from agents.text_agent import TextAnalysisAgent
from agents.image_agent import ImageAnalysisAgent
from agents.comp_agent import CompAnalysisAgent
from agents.financial_agent import FinancialAnalysisAgent
from agents.contractor_agent import ContractorSearchAgent
from agents.report_writer_agent import ReportWriterAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from core.config import get_settings
import traceback
import json

class OrchestratorAgent:
    """Orchestrates the workflow between a team of specialist agents using validated data models."""

    def __init__(self):
        """Initializes all specialist agents."""
        settings = get_settings()
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash-latest", 
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        )
        self.text_agent = TextAnalysisAgent(llm=self.llm)
        self.image_agent = ImageAnalysisAgent(llm=self.llm)
        self.comp_agent = CompAnalysisAgent(llm=self.llm)
        self.financial_agent = FinancialAnalysisAgent(llm=self.llm)
        self.contractor_agent = ContractorSearchAgent(llm=self.llm)
        self.report_writer_agent = ReportWriterAgent(llm=self.llm)

    async def generate_full_report(self, property_data: Dict[str, Any]) -> FullReport:
        """
        Runs the full analysis pipeline using a sequential workflow and validated Pydantic models.
        """
        print("--- generate_full_report started ---")
        
        try:
            # Step 1: Validate incoming data by creating a PropertyDetails object
            property_obj = PropertyDetails(**property_data)
            print("[Orchestrator] Successfully validated incoming property data.")

            # Step 2: Get initial ideas from text
            print("[Orchestrator] Calling TextAnalysisAgent...")
            initial_ideas = await self.text_agent.process(property_obj)
            if not initial_ideas:
                raise ValueError("TextAnalysisAgent failed to produce initial renovation ideas.")

            # Step 3: Get comparable properties
            print("[Orchestrator] Calling CompAnalysisAgent...")
            comparable_properties = await self.comp_agent.process(property_obj.address, search_mode='strict')
            if not comparable_properties:
                print("[Orchestrator] Comp search (strict) failed. Expanding search...")
                comparable_properties = await self.comp_agent.process(property_obj.address, search_mode='expanded')
            print(f"[Orchestrator] Found {len(comparable_properties)} comps.")

            # Step 4: Analyze images
            print("[Orchestrator] Calling ImageAnalysisAgent...")
            image_result = await self.image_agent.process(property_obj.images, initial_ideas)
            ideas_for_financial_analysis = image_result.get("refined_renovation_ideas", initial_ideas)
            
            # Step 5: Financial Analysis
            print("[Orchestrator] Calling FinancialAnalysisAgent...")
            final_ideas = await self.financial_agent.process(property_obj, ideas_for_financial_analysis, comparable_properties)
            if not final_ideas:
                raise ValueError("Financial analysis failed to produce renovation ideas.")

            # Step 6: Contractor Search
            top_idea_name = final_ideas[0].name if final_ideas else "General Remodeling"
            print(f"[Orchestrator] Calling ContractorSearchAgent for top idea: {top_idea_name}")
            contractors = await self.contractor_agent.process(top_idea_name, property_obj.address)

            # Step 7: Report Writing
            print("[Orchestrator] Calling ReportWriterAgent...")
            report_summary = await self.report_writer_agent.process(property_obj, final_ideas, comparable_properties)

            # Step 8: Assemble the final, validated FullReport object
            print("[Orchestrator] Assembling final validated report...")
            final_report = FullReport(
                property_details=property_obj,
                renovation_projects=final_ideas,
                comparable_properties=comparable_properties,
                recommended_contractors=contractors,
                market_summary=report_summary.get("market_summary", ""),
                investment_thesis=report_summary.get("investment_thesis", ""),
                error=None
            )
            
            print("--- generate_full_report finished successfully ---")
            return final_report

        except Exception as e:
            print(f"--- [Orchestrator] A CRITICAL error occurred: {e} ---")
            print(traceback.format_exc())
            # Return a valid FullReport object even on error, with the error message included
            return FullReport(
                property_details=PropertyDetails(**property_data),
                error=str(e)
            )

