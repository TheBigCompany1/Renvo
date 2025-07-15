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

class OrchestratorAgent:
    """Orchestrates the workflow between a team of specialist agents."""

    def __init__(self, api_key: str, model: str):
        """Initializes all specialist agents."""
        settings = get_settings()
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash-latest", 
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        )
        # Initialize the team of specialist agents
        self.text_agent = TextAnalysisAgent(llm=self.llm)
        self.image_agent = ImageAnalysisAgent(llm=self.llm)
        self.comp_agent = CompAnalysisAgent(llm=self.llm)
        self.financial_agent = FinancialAnalysisAgent(llm=self.llm)
        self.contractor_agent = ContractorSearchAgent(llm=self.llm)
        self.report_writer_agent = ReportWriterAgent(llm=self.llm)

    async def generate_full_report(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Runs the full analysis pipeline using the team of specialist agents."""
        print("--- generate_full_report started with new agent team ---")
        
        try:
            # Step 1 & 2: Run initial text and image analysis in parallel
            print("[Orchestrator] Calling Text, Image, and Comp agents in parallel...")
            text_task = self.text_agent.process(property_data)
            image_task = self.image_agent.process(property_data.get("images", []), []) # Start with empty ideas
            comp_task = self.comp_agent.process(property_data['address'])
            
            results = await asyncio.gather(text_task, image_task, comp_task, return_exceptions=True)
            
            text_result, image_result, comps_result = results

            # Error handling for parallel tasks
            if isinstance(text_result, Exception): raise text_result
            if isinstance(image_result, Exception): raise image_result
            if isinstance(comps_result, Exception): raise comps_result

            initial_ideas = text_result.get("renovation_ideas", [])
            ideas_for_financial_analysis = image_result.get("refined_renovation_ideas", initial_ideas)
            comparable_properties = comps_result.get("comparable_properties", [])

            # Step 3: Financial Analysis
            print("[Orchestrator] Calling FinancialAnalysisAgent...")
            financial_result = await self.financial_agent.process(property_data, ideas_for_financial_analysis, comparable_properties)
            final_ideas = financial_result.get("market_adjusted_ideas", [])

            if not final_ideas:
                raise ValueError("Financial analysis failed to produce renovation ideas.")

            # Step 4 & 5: Contractor Search and Report Writing in parallel
            top_idea_name = final_ideas[0]['name']
            print(f"[Orchestrator] Calling Contractor and Report Writer agents for top idea: {top_idea_name}")

            # Prepare data for the report writer
            full_data_for_writer = {
                "property": property_data,
                "renovation_ideas": final_ideas,
                "comparable_properties": comparable_properties
            }

            contractor_task = self.contractor_agent.process(top_idea_name, property_data['address'])
            writer_task = self.report_writer_agent.process(full_data_for_writer)

            final_results = await asyncio.gather(contractor_task, writer_task, return_exceptions=True)
            contractor_result, writer_result = final_results
            
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
            return {"error": str(e)}
