# backend/agent_service/agents/orchestrator.py
import asyncio
from typing import Dict, Any, List
from .text_agent import TextAnalysisAgent
from .image_agent import ImageAnalysisAgent
from .market_agent import MarketAnalysisAgent
# This is where the Google AI client is imported
from langchain_google_genai import ChatGoogleGenerativeAI
from core.config import get_settings 
import traceback

class OrchestratorAgent:
    """Orchestrates the workflow between Text, Image, and Market Analysis agents."""

    def __init__(self, api_key: str, model: str):
        """Initializes all specialist agents with the Google Generative AI model."""
        settings = get_settings()
        # FIX: The model is now set to the efficient 'flash' version
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash", 
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        )
        self.text_agent = TextAnalysisAgent(llm=self.llm)
        self.image_agent = ImageAnalysisAgent(llm=self.llm)
        self.market_agent = MarketAnalysisAgent(llm=self.llm)

    def _calculate_aggregate_financials(self, ideas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculates total budget, value, and average ROI from a list of ideas."""
        if not ideas:
            return {
                "total_budget": {"low": 0, "medium": 0, "high": 0},
                "potential_value_increase": {"low": 0, "medium": 0, "high": 0},
                "average_roi": 0
            }

        total_low_cost = sum(idea.get("estimated_cost", {}).get("low", 0) for idea in ideas)
        total_medium_cost = sum(idea.get("estimated_cost", {}).get("medium", 0) for idea in ideas)
        total_high_cost = sum(idea.get("estimated_cost", {}).get("high", 0) for idea in ideas)

        total_low_value = sum(idea.get("estimated_value_add", {}).get("low", 0) for idea in ideas)
        total_medium_value = sum(idea.get("estimated_value_add", {}).get("medium", 0) for idea in ideas)
        total_high_value = sum(idea.get("estimated_value_add", {}).get("high", 0) for idea in ideas)

        rois = [idea.get('adjusted_roi', idea.get('roi', 0)) for idea in ideas]
        average_roi = sum(rois) / len(rois) if rois else 0

        return {
            "total_budget": {"low": total_low_cost, "medium": total_medium_cost, "high": total_high_cost},
            "potential_value_increase": {"low": total_low_value, "medium": total_medium_value, "high": total_high_value},
            "average_roi": round(average_roi, 2)
        }

    def _format_quick_insights(self, final_ideas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Formats the top 3 ideas into quick insights for the UI."""
        if not final_ideas:
            return {}

        sorted_ideas = sorted(
            final_ideas,
            key=lambda x: x.get('adjusted_roi', x.get('roi', 0)),
            reverse=True
        )
        top_ideas = sorted_ideas[:3]

        total_budget = sum(idea.get("estimated_cost", {}).get("medium", 0) for idea in top_ideas)
        total_value = sum(idea.get("estimated_value_add", {}).get("medium", 0) for idea in top_ideas)
        potential_score = min(10, round((total_value / total_budget) * 3, 1)) if total_budget > 0 else 5

        return {
            "potentialScore": potential_score,
            "estimatedBudget": total_budget,
            "potentialValueAdd": total_value,
            "topOpportunities": [
                {
                    "name": idea.get("name", ""),
                    "estimatedCost": idea.get("estimated_cost", {}).get("medium", 0),
                    "estimatedValueAdd": idea.get("estimated_value_add", {}).get("medium", 0),
                    "estimatedRoi": idea.get('adjusted_roi', idea.get("roi", 0))
                }
                for idea in top_ideas
            ]
        }

    async def generate_full_report(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Runs the full analysis pipeline and compiles the final report."""
        print("--- generate_full_report started ---")
        full_report = {"property": property_data}
        text_analysis_result = {}
        image_analysis_result = {}
        market_analysis_result = {}

        try:
            # 1. Text Analysis
            print("[Orchestrator] Calling TextAnalysisAgent...")
            text_analysis_result = await self.text_agent.process(property_data)
            print(f"[Orchestrator] TextAnalysisAgent completed. Result keys: {text_analysis_result.keys()}")
            if text_analysis_result.get("error"):
                print(f"[Orchestrator] TextAnalysisAgent Error: {text_analysis_result.get('error')}")

            # 2. Image Analysis
            image_urls = property_data.get("images", [])
            initial_ideas = text_analysis_result.get("renovation_ideas", [])
            print(f"[Orchestrator] Image URLs found: {len(image_urls)}")
            if image_urls:
                print("[Orchestrator] Calling ImageAnalysisAgent...")
                image_analysis_result = await self.image_agent.process(image_urls, initial_ideas)
                print(f"[Orchestrator] ImageAnalysisAgent completed. Result keys: {image_analysis_result.keys()}")

            ideas_for_market_analysis = image_analysis_result.get("refined_renovation_ideas", initial_ideas)

            # 3. Market Analysis
            print(f"[Orchestrator] Calling MarketAnalysisAgent...")
            market_analysis_result = await self.market_agent.process(property_data, {"renovation_ideas": ideas_for_market_analysis})
            print(f"[Orchestrator] MarketAnalysisAgent completed. Result keys: {market_analysis_result.keys()}")
            if market_analysis_result.get("error"):
                print(f"[Orchestrator] MarketAnalysisAgent Error: {market_analysis_result.get('error')}")

            # 4. Compile Final Report
            print("[Orchestrator] Compiling final report...")
            final_ideas = market_analysis_result.get("market_adjusted_ideas", ideas_for_market_analysis)
            aggregate_financials = self._calculate_aggregate_financials(final_ideas)

            full_report["detailed_report"] = {
                "renovation_ideas": final_ideas,
                "additional_suggestions": image_analysis_result.get("additional_suggestions", []),
                "comparable_properties": market_analysis_result.get("comparable_properties", []),
                "recommended_contractors": market_analysis_result.get("recommended_contractors", []),
                **aggregate_financials
            }
            full_report["market_summary"] = market_analysis_result.get("market_summary", "Market summary could not be generated.")
            full_report["quick_insights"] = self._format_quick_insights(final_ideas)

            print("[Orchestrator] Final report compiled.")

        except Exception as e:
            print(f"--- [Orchestrator] A CRITICAL error occurred in generate_full_report: {e} ---")
            print(traceback.format_exc())
            full_report["error"] = str(e)
            full_report["quick_insights"] = {}

        print("--- generate_full_report finished ---")
        return full_report
