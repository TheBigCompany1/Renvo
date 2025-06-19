# backend/agent_service/agents/market_agent.py
from typing import Dict, Any, List, Optional
import json
import asyncio
import re
from agents.base import BaseAgent
from pydantic import BaseModel, Field
from tools.search_tools import search_for_comparable_properties
from langchain_core.messages import ToolMessage

# --- START: Define the JSON Output Structure ---
class Cost(BaseModel):
    low: int
    medium: int
    high: int

class ValueAdd(BaseModel):
    low: int
    medium: int
    high: int

class MarketAdjustedIdea(BaseModel):
    name: str
    description: str
    estimated_cost: Cost
    estimated_value_add: ValueAdd
    adjusted_roi: float
    market_demand: str
    local_trends: str
    buyer_profile: str
    estimated_monthly_rent: Optional[int] = Field(None, description="The estimated monthly rent for new units.")
    capitalization_rate: Optional[float] = Field(None, description="The calculated capitalization rate for rental projects.")

class ComparableProperty(BaseModel):
    address: str
    sale_price: float
    brief_summary: str
    url: str

class MarketAnalysisOutput(BaseModel):
    """The final JSON object containing market-adjusted ideas and comps."""
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
# --- END: Define the JSON Output Structure ---

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends with guaranteed JSON output."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment expert for a development firm. Your analysis will focus on local market trends for the property at {address} and adjust these ambitious renovation ideas:

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS:**
    1.  **Find Real Comps**: Use the 'search_for_comparable_properties' tool to find 2-3 real, recently sold properties to validate the potential value of the primary property.
    2.  **Rental Analysis**: For each renovation idea that creates a rentable unit (like an ADU or duplex), you MUST use the search tool to find the average monthly rent for a similar unit in that specific city or neighborhood.
    3.  **Advanced Financials**: If you found rental data for an idea, you MUST calculate the Capitalization Rate (Cap Rate). Use this formula: Cap Rate = ( (Estimated Monthly Rent * 12) * 0.6 ) / (Medium Estimated Cost). (The 0.6 multiplier accounts for estimated expenses).
    4.  **Adjust Financials**: Adjust the `estimated_value_add` for each idea based on the concrete data you found from comps and market trends.
    5.  **Accurate ROI Recalculation**: Recalculate the `adjusted_roi` for every idea.

    After using your tools and analyzing the results, you MUST format your final response as a single, valid JSON object conforming to the required schema.
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        self.llm_with_tools = self.llm.bind_tools([search_for_comparable_properties])
        # This line forces the final output to match the MarketAnalysisOutput schema
        self.structured_llm = self.llm.with_structured_output(MarketAnalysisOutput)

    async def process(self, address: str, renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market trends with guaranteed JSON output."""
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            prompt = self._create_prompt(self.PROMPT_TEMPLATE, address=address, renovation_json=renovation_json)
            
            print("[MarketAgent] Initial call to LLM with tools...")
            ai_msg = await asyncio.to_thread(self.llm_with_tools.invoke, prompt)
            
            tool_calls = getattr(ai_msg, 'tool_calls', []) or []

            if not tool_calls:
                print("[MarketAgent] No tool call requested. Forcing structured output on initial prompt.")
                response = await asyncio.to_thread(self.structured_llm.invoke, prompt)
                return response.dict()

            print(f"[MarketAgent] LLM requested to use {len(tool_calls)} tool(s).")
            tool_outputs = []
            for tool_call in tool_calls:
                tool_name = tool_call.get("name")
                print(f"[MarketAgent] Executing tool: {tool_name} with args: {tool_call.get('args')}")
                output = search_for_comparable_properties.invoke(tool_call.get('args'))
                tool_outputs.append(ToolMessage(content=str(output), tool_call_id=tool_call['id']))
            
            print("[MarketAgent] Calling LLM again with all tool outputs and forcing JSON...")
            history = [ai_msg] + tool_outputs
            final_response = await asyncio.to_thread(self.structured_llm.invoke, history)
            
            print("[MarketAgent] Process finished successfully with structured output.")
            return final_response.dict()
            
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