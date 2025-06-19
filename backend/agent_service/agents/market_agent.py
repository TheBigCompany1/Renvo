# backend/agent_service/agents/market_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
from agents.base import BaseAgent
from pydantic import BaseModel, Field
from tools.search_tools import search_for_comparable_properties
from langchain_core.messages import ToolMessage

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends, now correctly handling parallel tool calls."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment expert for a development firm. Your analysis will focus on local market trends for the property at {address} and adjust these ambitious renovation ideas:

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS:**
    1.  **Find Real Comps**: Use the 'search_for_comparable_properties' tool to find 2-3 real, recently sold properties to validate the potential value of the primary property.
    2.  **Rental Analysis**: For each renovation idea that creates a rentable unit (like an ADU or duplex), you MUST use the search tool to find the average monthly rent for a similar unit in that specific city or neighborhood.
    3.  **Advanced Financials**: If you found rental data for an idea, you MUST calculate the Capitalization Rate (Cap Rate). Use this formula: Cap Rate = ( (Estimated Monthly Rent * 12) * 0.6 ) / (Medium Estimated Cost). (The 0.6 multiplier accounts for estimated expenses like taxes, insurance, and maintenance).
    4.  **Adjust Financials**: Adjust the `estimated_value_add` for each idea based on the concrete data you found from comps and market trends.
    5.  **Accurate ROI Recalculation**: Recalculate the `adjusted_roi` for every idea.

    **CRITICAL OUTPUT FORMAT:**
    Return only the JSON object below.
    - The "comparable_properties" key MUST be populated.
    - For rental projects, the "estimated_monthly_rent" and "capitalization_rate" keys MUST be populated. For non-rental projects, these keys can be omitted or set to null.

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
                "local_trends": "Specific market insights supporting or challenging this renovation.",
                "buyer_profile": "Example buyer profile",
                "estimated_monthly_rent": 1500,
                "capitalization_rate": 6.5
            }}
        ],
        "market_summary": "Overall analysis of the local market...",
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
            
            print("[MarketAgent] Initial call to LLM with tools...")
            ai_msg = await asyncio.to_thread(self.llm_with_tools.invoke, prompt)
            
            tool_calls = getattr(ai_msg, 'tool_calls', []) or []

            if not tool_calls:
                print("[MarketAgent] No tool call requested by LLM.")
                response_content = ai_msg.content
            else:
                print(f"[MarketAgent] LLM requested to use {len(tool_calls)} tool(s).")
                # --- START OF CORRECTED PARALLEL HANDLING ---
                tool_outputs = []
                for tool_call in tool_calls:
                    tool_name = tool_call.get("name")
                    print(f"[MarketAgent] Executing tool: {tool_name} with args: {tool_call.get('args')}")
                    if tool_name == "search_for_comparable_properties":
                        output = search_for_comparable_properties.invoke(tool_call.get('args'))
                        tool_outputs.append(ToolMessage(content=str(output), tool_call_id=tool_call['id']))
                
                print("[MarketAgent] Calling LLM again with all tool outputs...")
                history = [ai_msg] + tool_outputs
                final_response = await asyncio.to_thread(self.llm_with_tools.invoke, history)
                response_content = final_response.content
                # --- END OF CORRECTED PARALLEL HANDLING ---

            raw_content = response_content.strip()
            print(f"[MarketAgent] Final raw LLM content: {raw_content[:500]}...")
            
            try:
                result = json.loads(raw_content)
            except json.JSONDecodeError:
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
                "market_adjusted_ideas": [],
                "market_summary": "Market analysis could not be completed due to a processing error.",
                "comparable_properties": [],
                "error": str(e)
            }