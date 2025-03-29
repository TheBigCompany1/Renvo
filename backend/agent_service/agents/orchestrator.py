# agents/orchestrator.py
from typing import Dict, Any, List, Optional
import asyncio
from .base import BaseAgent
from .text_agent import TextAnalysisAgent
from .image_agent import ImageAnalysisAgent
from .market_agent import MarketAnalysisAgent
from langchain.chat_models import ChatOpenAI

class OrchestratorAgent:
    """Coordinates the multi-agent system workflow."""
    
    def __init__(self, api_key: str, model: str = "gpt-3.5-turbo-0125"):
        """Initialize the orchestrator with the required agents."""
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
        """Generate a comprehensive renovation report using all agents."""
        
        # Step 1: Generate initial renovation ideas
        renovation_ideas = await self.text_agent.process(property_data)
        
        # Step 2: If images are available, refine ideas using image analysis
        image_urls = property_data.get("images", [])
        if image_urls:
            refined_ideas = await self.image_agent.process(renovation_ideas, image_urls)
        else:
            refined_ideas = renovation_ideas
        
        # Step 3: Adjust recommendations based on market analysis
        address = property_data.get("address", "")
        if address:
            market_adjusted = await self.market_agent.process(address, refined_ideas)
        else:
            market_adjusted = refined_ideas
        
        # Step 4: Compile the full report
        full_report = self._compile_full_report(property_data, renovation_ideas, refined_ideas, market_adjusted)
        
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
        
        # Get the final list of renovation ideas
        final_ideas = market_adjusted.get("market_adjusted_ideas", 
                      refined_ideas.get("refined_renovation_ideas",
                      initial_ideas.get("renovation_ideas", [])))

        print(final_ideas)
        
        # Additional suggestions from image analysis
        additional_suggestions = refined_ideas.get("additional_suggestions", [])
        
        # Market insights
        market_summary = market_adjusted.get("market_summary", "")
        
        # Calculate totals
        total_budget_low = sum(idea.get("estimated_cost", {}).get("low", 0) for idea in final_ideas)
        total_budget_med = sum(idea.get("estimated_cost", {}).get("medium", 0) for idea in final_ideas)
        total_budget_high = sum(idea.get("estimated_cost", {}).get("high", 0) for idea in final_ideas)
        
        total_value_low = sum(idea.get("estimated_value_add", {}).get("low", 0) for idea in final_ideas)
        total_value_med = sum(idea.get("estimated_value_add", {}).get("medium", 0) for idea in final_ideas)
        total_value_high = sum(idea.get("estimated_value_add", {}).get("high", 0) for idea in final_ideas)
        
        # Alex ADDED: Build a nested "detailed_report" block with renovation data
        detailed_report = {
            "renovation_ideas": final_ideas,
            "additional_suggestions": additional_suggestions,
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
        # ---------------------------------------------------------------------------
        
        # Alex ADDED: Return the final report with the scraped property data merged under "property"
        return {
            "property": property_data,             # Contains the scraped data (address, price, etc.)
            "detailed_report": detailed_report,      # Contains renovation ideas and metrics
            "market_summary": market_summary,
            "quick_insights": market_adjusted.get("quick_insights", {})
        }
