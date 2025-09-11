# backend/agent_service/agents/orchestrator.py
from __future__ import annotations

import json
import traceback
from typing import Any, Dict, List

from langchain_google_genai import ChatGoogleGenerativeAI

from agents.comp_agent import CompAnalysisAgent
from agents.contractor_agent import ContractorSearchAgent
from agents.financial_agent import FinancialAnalysisAgent
from agents.image_agent import ImageAnalysisAgent
from agents.report_writer_agent import ReportWriterAgent
from agents.text_agent import TextAnalysisAgent
from core.config import get_settings
from models.property_model import PropertyDetails
from models.report import FullReport


class OrchestratorAgent:
    """
    Coordinates the pipeline: text → comps → images → financials → contractors → writer.
    Adds explicit debug logs to surface field names/values moving through the system.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self.llm = ChatGoogleGenerativeAI(
            model=settings.GOOGLE_GEMINI_MODEL,
            google_api_key=settings.GOOGLE_API_KEY,
        )

        self.text_agent = TextAnalysisAgent(llm=self.llm)
        self.comp_agent = CompAnalysisAgent(llm=self.llm)
        self.image_agent = ImageAnalysisAgent(llm=self.llm)
        self.financial_agent = FinancialAnalysisAgent(llm=self.llm)
        self.contractor_agent = ContractorSearchAgent(llm=self.llm)
        self.report_writer_agent = ReportWriterAgent(llm=self.llm)

    async def generate_full_report(self, property_data: Dict[str, Any]) -> FullReport:
        """
        Runs the full analysis pipeline using a sequential workflow and validated Pydantic models.
        """
        print("--- generate_full_report started ---")

        try:
            # Step 1: Validate/normalize incoming data
            property_obj = PropertyDetails(**property_data)
            print("[Orchestrator] Successfully validated incoming property data.")

            # Deep visibility into what survived Pydantic:
            try:
                dump = property_obj.model_dump()
                keys = sorted(list(dump.keys()))
                print(f"[Orchestrator] [DEBUG] PropertyDetails keys: {keys}")
                print(
                    "[Orchestrator] [DEBUG] Key fields → "
                    f"address={dump.get('address')!r}, "
                    f"sqft={dump.get('sqft')!r}, "
                    f"estimatePerSqft={dump.get('estimatePerSqft')!r}, "
                    f"price={dump.get('price')!r}"
                )
            except Exception as e:
                print(f"[Orchestrator] [DEBUG] Could not model_dump PropertyDetails: {e}")

            # Step 2: Text analysis
            print("[Orchestrator] Calling TextAnalysisAgent...")
            initial_ideas = await self.text_agent.process(property_obj)
            if not initial_ideas:
                raise ValueError("TextAnalysisAgent failed to produce initial renovation ideas.")

            # Step 3: Comparable properties
            print("[Orchestrator] Calling CompAnalysisAgent...")
            comparable_properties = await self.comp_agent.process(property_obj.address, search_mode="strict")
            if not comparable_properties:
                print("[Orchestrator] Comp search (strict) failed. Expanding search...")
                comparable_properties = await self.comp_agent.process(property_obj.address, search_mode="expanded")
            print(f"[Orchestrator] Found {len(comparable_properties)} comps.")

            # Step 4: Images
            print("[Orchestrator] Calling ImageAnalysisAgent...")
            image_result = await self.image_agent.process(property_obj.images, initial_ideas)
            ideas_for_financial_analysis = image_result.get("ideas", initial_ideas)

            # Step 5: Financial analysis
            print("[Orchestrator] Calling FinancialAnalysisAgent...")
            final_ideas = await self.financial_agent.process(
                property_obj, ideas_for_financial_analysis, comparable_properties
            )
            if not final_ideas:
                raise ValueError("Financial analysis failed to produce renovation ideas.")

            # Step 6: Contractor Search
            top_idea_name = final_ideas[0].name if final_ideas else "General Remodeling"
            print(f"[Orchestrator] Calling ContractorSearchAgent for top idea: {top_idea_name}")
            contractors = await self.contractor_agent.process(top_idea_name, property_obj.address)

            # Step 7: Report Writing
            print("[Orchestrator] Calling ReportWriterAgent...")
            report_summary: Dict[str, Any] = await self.report_writer_agent.process(
                property_obj, final_ideas, comparable_properties
            )

            # Step 8: Assemble final report
            print("[Orchestrator] Assembling final validated report...")
            final_report = FullReport(
                property_details=property_obj,
                renovation_projects=final_ideas,
                comparable_properties=comparable_properties,
                recommended_contractors=contractors,
                market_summary=report_summary.get("market_summary", ""),
                investment_thesis=report_summary.get("investment_thesis", ""),
                error=None,
            )

            print("--- generate_full_report finished successfully ---")
            return final_report

        except Exception as e:
            print(f"--- [Orchestrator] A CRITICAL error occurred: {e} ---")
            print(traceback.format_exc())
            # Return a valid FullReport object even on error, with the error message included.
            return FullReport(property_details=PropertyDetails(**property_data), error=str(e))
