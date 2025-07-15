# backend/agent_service/agents/orchestrator.py
import asyncio
from typing import Dict, Any, List
from .text_agent import TextAnalysisAgent
from .image_agent import ImageAnalysisAgent
from .comp_agent import CompAnalysisAgent
from .financial_agent import FinancialAnalysisAgent
from .contractor_agent import ContractorSearchAgent
from .report_writer_agent import ReportWriterAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from core.config import get_settings
import traceback
import json

class OrchestratorAgent:
    """Orchestrates the workflow between a team of specialist agents."""

    def __init__(self, api_key: str, model: str):
        """Initializes all specialist agents."""
        settings = get_settings()
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro", 
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        )
        self.text_agent = TextAnalysisAgent(llm=self.llm)
        self.image_agent = ImageAnalysisAgent(llm=self.llm)
        self.comp_agent = CompAnalysisAgent(llm=self.llm)
        self.financial_agent = FinancialAnalysisAgent(llm=self.llm)
        self.contractor_agent = ContractorSearchAgent(llm=self.llm)
        self.report_writer_agent = ReportWriterAgent(llm=self.llm)

    async def generate_full_report(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs the full analysis pipeline using the team of specialist agents
        with a multi-step fallback strategy for finding comps.
        """
        print("--- generate_full_report started with new agent team ---")
        
        try:
            # Step 1: Get initial ideas from text
            print("[Orchestrator] Calling TextAnalysisAgent...")
            text_result = await self.text_agent.process(property_data)
            if isinstance(text_result, Exception): raise text_result
            initial_ideas = text_result.get("renovation_ideas", [])
            if not initial_ideas:
                raise ValueError("TextAnalysisAgent failed to produce initial renovation ideas.")

            # Step 2: Refine ideas with images
            print("[Orchestrator] Calling ImageAnalysisAgent...")
            image_urls = property_data.get("images", [])
            image_result = await self.image_agent.process(image_urls, initial_ideas)
            if isinstance(image_result, Exception): raise image_result
            ideas_for_financial_analysis = image_result.get("refined_renovation_ideas", initial_ideas)

            # --- FIX: Multi-step fallback for finding comps ---
            # Attempt 1: Strict search for sold comps
            print("[Orchestrator] Attempt 1: Searching for SOLD comps...")
            comps_result = await self.comp_agent.process(property_data['address'], search_mode='strict')
            comparable_properties = comps_result.get("comparable_properties", [])

            # Attempt 2: Expanded search if first attempt failed
            if not comparable_properties:
                print("[Orchestrator] Attempt 1 FAILED. Attempt 2: Expanding search to ACTIVE listings...")
                comps_result = await self.comp_agent.process(property_data['address'], search_mode='expanded')
                comparable_properties = comps_result.get("comparable_properties", [])
            
            print(f"[Orchestrator] Found {len(comparable_properties)} comps after all attempts.")

            # Step 3: Financial Analysis (now with a safety net)
            print("[Orchestrator] Calling FinancialAnalysisAgent...")
            financial_result = await self.financial_agent.process(property_data, ideas_for_financial_analysis, comparable_properties)
            if isinstance(financial_result, Exception): raise financial_result
            final_ideas = financial_result.get("market_adjusted_ideas", [])
            
            if not final_ideas:
                raise ValueError("Financial analysis failed to produce renovation ideas.")

            # Step 4 & 5: Contractor Search and Report Writing
            top_idea_name = final_ideas[0]['name']
            print(f"[Orchestrator] Calling Contractor and Report Writer agents for top idea: {top_idea_name}")
            full_data_for_writer = { "property": property_data, "renovation_ideas": final_ideas, "comparable_properties": comparable_properties }
            
            contractor_task = self.contractor_agent.process(top_idea_name, property_data['address'])
            writer_task = self.report_writer_agent.process(full_data_for_writer)
            
            contractor_result, writer_result = await asyncio.gather(contractor_task, writer_task, return_exceptions=True)
            if isinstance(contractor_result, Exception): raise contractor_result
            if isinstance(writer_result, Exception): raise writer_result

            # Step 6: Compile Final Report
            print("[Orchestrator] Compiling final report...")
            detailed_report = {
                "renovation_ideas": final_ideas,
                "additional_suggestions": image_result.get("additional_suggestions", []),
                "comparable_properties": comparable_properties,
                "recommended_contractors": contractor_result.get("recommended_contractors", []),
            }

            final_report = {
                "property": property_data,
                "detailed_report": detailed_report,
                "market_summary": writer_result.get("market_summary", "Market summary could not be generated."),
                "investment_thesis": writer_result.get("investment_thesis", "Investment thesis could not be generated."),
                "error": None
            }
            print("--- generate_full_report finished ---")
            return final_report

        except Exception as e:
            print(f"--- [Orchestrator] A CRITICAL error occurred: {e} ---")
            print(traceback.format_exc())
            return {"property": property_data, "error": str(e)}
