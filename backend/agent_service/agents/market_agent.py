# agents/market_agent.py
from typing import Dict, Any
import json
import asyncio
from agents.base import BaseAgent

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing local market trends to refine renovation recommendations."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment expert for a development firm. Your analysis will focus on the local real estate market trends for the property at {address} and adjust these ambitious renovation ideas:

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS:**
    1.  **Market Research**: Research current market trends, property values, and recent sales for this specific location.
    2.  **Feasibility Insights**: For each idea, comment on its viability in the current market. Pay special attention to zoning clues, lot size, and demand for new or multi-unit housing in the area. This information should be in the "local_trends" field.
    3.  **Adjust Financials**: Adjust the `estimated_value_add` based on your research of local property values and buyer preferences.
    4.  **Accurate ROI Recalculation**: Recalculate the ROI for each idea and place it in the "adjusted_roi" key. Before providing the final number, you must mentally perform the calculation using this exact formula: ((`estimated_value_add.medium` - `estimated_cost.medium`) / `estimated_cost.medium`) * 100. Double-check your math.

    **CRITICAL OUTPUT FORMAT:**
    Return only the JSON object below without any extra commentary, adhering to the original format.

    JSON Format:
    {{
        "market_adjusted_ideas": [
            {{
                "name": "Renovation name",
                "description": "Description with market context",
                "estimated_cost": {{"low": 1000, "medium": 2000, "high": 3000}},
                "estimated_value_add": {{"low": 2000, "medium": 3000, "high": 4000}},
                "adjusted_roi": 50,
                "market_demand": "High/Medium/Low",
                "local_trends": "Specific market insights supporting or challenging this renovation. Mention zoning potential or density trends.",
                "buyer_profile": "Example buyer profile"
            }}
        ],
        "market_summary": "Overall analysis of the local market and its impact on large-scale renovation value. Comment on the general feasibility of development in this area."
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