# agents/market_agent.py
from typing import Dict, Any
import json
import asyncio
from agents.base import BaseAgent

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing local market trends to refine renovation recommendations."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment assistant. Analyze the local real estate market for the property at {address} and adjust these renovation ideas:
    
    Renovation Ideas: {renovation_json}
    
    Your tasks:
    - Research current market trends for this location
    - Adjust ROI estimates based on local property values and buyer preferences
    - Consider the property type and local competition
    - Provide a brief demographic and behaviroal profile of the ideal buyer for that investment proposal (for example, if an idea is to convert a detached garage to an ADU, the profile can be young family seeking additional rental income)
    
    Return a market-adjusted JSON with the following format:
    {{
        "market_adjusted_ideas": [
            {{
                "name": "Renovation name",
                "description": "Description with market context",
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "adjusted_roi": 150,
                "market_demand": "High/Medium/Low",
                "local_trends": "Specific market insights for this renovation",
                "buyer_profile": "Example buyer profile"
            }}
        ],
        "market_summary": "Overall analysis of the local market and its impact on renovation value"
    }}
    """
    
    async def process(self, address: str, renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market trends and adjust renovation recommendations."""
        try:
            renovation_json = json.dumps(renovation_ideas)
            
            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                address=address,
                renovation_json=renovation_json
            )
            
            # Use asyncio to make the LLM call non-blocking
            response = await asyncio.to_thread(
                self.llm.invoke,
                prompt
            )
            
            # Parse the response as JSON
            try:
                result = json.loads(response.content)
            except json.JSONDecodeError:
                import re
                json_match = re.search(r'```json\n(.*?)\n```', response.content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError("Could not extract valid JSON from response")
            
            return result
            
        except Exception as e:
            # Log the error
            print(f"MarketAnalysisAgent error: {str(e)}")
            return {
                "market_adjusted_ideas": renovation_ideas.get("renovation_ideas", []),
                "market_summary": "Market analysis could not be completed.",
                "error": str(e)
            }