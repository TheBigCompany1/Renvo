# backend/agent_service/agents/market_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
from agents.base import BaseAgent
from langchain_core.pydantic_v1 import BaseModel, Field

# Import the new search tool
from tools.search_tools import search_for_comparable_properties

# A new Pydantic model to define the structure for a single comparable property
class ComparableProperty(BaseModel):
    address: str = Field(description="The full address of the comparable property.")
    sale_price: float = Field(description="The final sale price of the property.")
    brief_summary: str = Field(description="A brief one-sentence summary of the property (e.g., '3-bed, 2-bath, sold above asking').")
    url: str = Field(description="The URL link to the property listing or sales record.")

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends and finding comparable properties."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment expert for a development firm. Your analysis will focus on local market trends for the property at {address} and adjust these renovation ideas:

    Renovation Ideas: {renovation_json}

    **YOUR TASKS:**
    1.  **Find Real Comps**: Use the 'search_for_comparable_properties' tool to find 2-3 real, recently sold properties in the same area. This is mandatory for validating your analysis.
    2.  **Market Research**: Based on the search results, analyze current market trends, property values, and buyer preferences.
    3.  **Adjust Financials**: Adjust the `estimated_value_add` for each renovation idea based on the concrete data you found.
    4.  **Accurate ROI Recalculation**: Recalculate the ROI for each idea and place it in the "adjusted_roi" key.

    **CRITICAL OUTPUT FORMAT:**
    Return only a single JSON object. The "comparable_properties" key MUST be populated with data from your search tool.

    JSON Format:
    {{
        "market_adjusted_ideas": [ ... ],
        "market_summary": "Overall analysis...",
        "comparable_properties": [
            {{
                "address": "123 Main St, Santa Monica, CA 90405",
                "sale_price": 3850000,
                "brief_summary": "3-bed, 2-bath, sold in 10 days.",
                "url": "https://www.zillow.com/homedetails/..."
            }}
        ]
    }}
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        # Bind the search tool to the LLM for this agent
        self.llm_with_tools = self.llm.bind_tools([search_for_comparable_properties])

    async def process(self, address: str, renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market trends and adjust renovation recommendations using tools."""
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            
            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                address=address,
                renovation_json=renovation_json
            )
            
            # --- TOOL-USE WORKFLOW ---
            print("[MarketAgent] Initial call to LLM with tools...")
            ai_msg = await asyncio.to_thread(self.llm_with_tools.invoke, prompt)
            
            # Check if the AI wants to use a tool
            if ai_msg.tool_calls:
                print(f"[MarketAgent] LLM requested to use a tool: {ai_msg.tool_calls[0]['name']}")
                tool_output = search_for_comparable_properties.invoke(ai_msg.tool_calls[0]['args'])
                
                # Call the LLM again, providing the tool's output
                print("[MarketAgent] Calling LLM again with tool output...")
                ai_msg.tool_calls[0]['output'] = tool_output
                final_response = await asyncio.to_thread(self.llm_with_tools.invoke, [ai_msg])
                response_content = final_response.content
            else:
                # If no tool was needed, use the initial response
                print("[MarketAgent] No tool call requested by LLM.")
                response_content = ai_msg.content

            # --- PARSING LOGIC ---
            raw_content = response_content.strip()
            print(f"[MarketAgent] Raw LLM content (stripped): {raw_content[:500]}...")
            
            try:
                result = json.loads(raw_content)
            except json.JSONDecodeError:
                print("[MarketAgent] Direct JSON parsing failed. Trying to extract from markdown.")
                json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw_content, re.DOTALL | re.IGNORECASE)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    raise ValueError("Could not extract valid JSON from LLM response.")
            
            print("[MarketAgent] Process finished successfully.")
            return result
            
        except Exception as e:
            import traceback
            print(f"[MarketAgent] General error in process: {str(e)}")
            print(f"[MarketAgent] Traceback: {traceback.format_exc()}")
            return {
                "market_adjusted_ideas": renovation_ideas.get("renovation_ideas", []),
                "market_summary": "Market analysis could not be completed.",
                "error": str(e)
            }