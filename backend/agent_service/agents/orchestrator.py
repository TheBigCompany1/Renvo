# agents/orchestrator.py
from typing import Dict, Any, List, Optional
import asyncio
import os
from agents.base import BaseAgent
from agents.text_agent import TextAnalysisAgent
from agents.image_agent import ImageAnalysisAgent
from agents.market_agent import MarketAnalysisAgent
from langchain_openai import ChatOpenAI

class OrchestratorAgent:
    """Coordinates the multi-agent system workflow."""
    def __init__(self, api_key: str, model: str = None):
        if model is None:
            # Use your config variable; make sure your .env file has OPENAI_MODEL set.
            model = os.getenv("OPENAI_MODEL", "gpt-4o")
        self.llm = ChatOpenAI(model_name=model, openai_api_key=api_key)
        self.text_agent = TextAnalysisAgent(self.llm)
        self.image_agent = ImageAnalysisAgent(self.llm)
        self.market_agent = MarketAnalysisAgent(self.llm)
    
    async def generate_quick_insights(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate quick insights for the Chrome extension."""
        # Use only the text agent for quick insights
        renovation_ideas = await self.text_agent.process(property_data)
        
        # Extract top ideas and format for quick display
        quick_insights = self._format_quick_insights(renovation_ideas, property_data)
        return quick_insights
    
    async def generate_full_report(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a comprehensive renovation report using all agents with detailed logging."""
        print("--- generate_full_report started ---")
        full_report = {}
        try:
            # Step 1: Generate initial renovation ideas
            print("[Orchestrator] Calling TextAnalysisAgent...")
            initial_ideas = await self.text_agent.process(property_data)
            print(f"[Orchestrator] TextAnalysisAgent completed. Result keys: {initial_ideas.keys()}")
            if "error" in initial_ideas:
                 print(f"[Orchestrator] TextAnalysisAgent Error: {initial_ideas['error']}")

            # Step 2: If images are available, refine ideas using image analysis
            image_urls = property_data.get("images", [])
            print(f"[Orchestrator] Image URLs found: {len(image_urls)}")
            if image_urls:
                print("[Orchestrator] Calling ImageAnalysisAgent...")
                refined_ideas = await self.image_agent.process(initial_ideas, image_urls)
                print(f"[Orchestrator] ImageAnalysisAgent completed. Result keys: {refined_ideas.keys()}")
                if "error" in refined_ideas:
                     print(f"[Orchestrator] ImageAnalysisAgent Error: {refined_ideas['error']}")
            else:
                print("[Orchestrator] Skipping ImageAnalysisAgent (no images).")
                # If no images, 'refined_ideas' are the initial ones for the next step
                refined_ideas = initial_ideas
                 # Ensure refined_ideas structure for market agent if skipping image agent
                if "renovation_ideas" in refined_ideas and "refined_renovation_ideas" not in refined_ideas:
                     refined_ideas["refined_renovation_ideas"] = refined_ideas["renovation_ideas"]


            # Step 3: Adjust recommendations based on market analysis
            address = property_data.get("address", "")
            print(f"[Orchestrator] Address for Market Analysis: {address}")
            if address:
                print("[Orchestrator] Calling MarketAnalysisAgent...")
                 # Pass the 'refined_ideas' structure
                market_adjusted = await self.market_agent.process(address, refined_ideas)
                print(f"[Orchestrator] MarketAnalysisAgent completed. Result keys: {market_adjusted.keys()}")
                if "error" in market_adjusted:
                     print(f"[Orchestrator] MarketAnalysisAgent Error: {market_adjusted['error']}")
            else:
                print("[Orchestrator] Skipping MarketAnalysisAgent (no address).")
                 # If no address, 'market_adjusted' ideas are the refined ones
                market_adjusted = refined_ideas
                 # Ensure market_adjusted structure for compilation if skipping market agent
                if "refined_renovation_ideas" in market_adjusted and "market_adjusted_ideas" not in market_adjusted:
                     market_adjusted["market_adjusted_ideas"] = market_adjusted["refined_renovation_ideas"]

            # Step 4: Compile the full report
            print("[Orchestrator] Compiling final report...")
            full_report = self._compile_full_report(
                property_data,
                initial_ideas,
                refined_ideas,
                market_adjusted
            )
            print("[Orchestrator] Final report compiled.")

        except Exception as e:
            import traceback
            print(f"[Orchestrator] ERROR during generate_full_report: {str(e)}")
            print(f"[Orchestrator] Traceback: {traceback.format_exc()}")
            # Return a minimal structure in case of error
            full_report = {"error": str(e), "property": property_data} # Include property data for context

        print("--- generate_full_report finished ---")
        return full_report
    
    def _format_quick_insights(self, renovation_ideas: Dict[str, Any], property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Format renovation ideas into quick insights for the extension."""
        ideas = renovation_ideas.get("renovation_ideas", [])
        
        # Sort ideas by ROI
        sorted_ideas = sorted(ideas, key=lambda x: x.get("roi", 0), reverse=True)
        top_ideas = sorted_ideas[:3]  # Take top 3 ideas
        
        # Calculate total budget and potential value
        total_budget = sum(idea.get("estimated_cost", {}).get("medium", 0) for idea in top_ideas)
        total_value = sum(idea.get("estimated_value_add", {}).get("medium", 0) for idea in top_ideas)
        
        # Calculate potential score (1-10)
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
                    "estimatedRoi": idea.get("roi", 0)
                } 
                for idea in top_ideas
            ]
        }
    
    def _compile_full_report(
        self, 
        property_data: Dict[str, Any], 
        initial_ideas: Dict[str, Any],
        refined_ideas: Dict[str, Any],
        market_adjusted: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Compile the full detailed report from all agent outputs."""
        
        final_ideas = market_adjusted.get("market_adjusted_ideas", 
                      refined_ideas.get("refined_renovation_ideas",
                      initial_ideas.get("renovation_ideas", [])))
        
        additional_suggestions = refined_ideas.get("additional_suggestions", [])
        market_summary = market_adjusted.get("market_summary", "")
        
        # Get the new comparable properties and contractors data
        comparable_properties = market_adjusted.get("comparable_properties", [])
        recommended_contractors = market_adjusted.get("recommended_contractors", [])

        total_budget_low = sum(idea.get("estimated_cost", {}).get("low", 0) for idea in final_ideas)
        total_budget_med = sum(idea.get("estimated_cost", {}).get("medium", 0) for idea in final_ideas)
        total_budget_high = sum(idea.get("estimated_cost", {}).get("high", 0) for idea in final_ideas)
        total_value_low = sum(idea.get("estimated_value_add", {}).get("low", 0) for idea in final_ideas)
        total_value_med = sum(idea.get("estimated_value_add", {}).get("medium", 0) for idea in final_ideas)
        total_value_high = sum(idea.get("estimated_value_add", {}).get("high", 0) for idea in final_ideas)
        
        detailed_report = {
            "renovation_ideas": final_ideas,
            "additional_suggestions": additional_suggestions,
            "comparable_properties": comparable_properties,
            "recommended_contractors": recommended_contractors,
            "total_budget": {
                "low": total_budget_low,
                "medium": total_budget_med,
                "high": total_budget_high
            },
            "potential_value_increase": {
                "low": total_value_low,
                "medium": total_value_med,
                "high": total_value_high
            },
            "average_roi": round(total_value_med / total_budget_med * 100, 1) if total_budget_med > 0 else 0
        }
        
        return {
            "property": property_data,
            "detailed_report": detailed_report,
            "market_summary": market_summary,
            "quick_insights": market_adjusted.get("quick_insights", {})
        }