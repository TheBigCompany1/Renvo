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
    # --- This is the key change to prevent data loss ---
    name: str = Field(description="The name of the renovation idea, preserved from the initial analysis.")
    description: str = Field(description="The detailed description of the project, preserved from the initial analysis.")
    estimated_cost: Cost = Field(description="The cost estimates, preserved from the initial analysis.")
    cost_source: str = Field(description="The cost source, preserved from the initial analysis.")
    estimated_value_add: ValueAdd # This will be adjusted by the market agent
    roi: float = Field(description="The original ROI calculation, preserved for reference.")
    feasibility: str = Field(description="The feasibility assessment, preserved from the initial analysis.")
    timeline: str = Field(description="The project timeline, preserved from the initial analysis.")
    buyer_profile: str = Field(description="The ideal buyer profile, preserved and potentially refined by market analysis.")
    roadmap_steps: List[str] = Field(description="The project roadmap, preserved from the initial analysis.")
    potential_risks: List[str] = Field(description="The potential risks, preserved from the initial analysis.")
    # --- End of preserved fields ---
    
    # --- Fields to be added or modified by this agent ---
    adjusted_roi: float = Field(description="The ROI recalculated based on market-adjusted value add.")
    market_demand: str = Field(description="The current market demand for this type of project.")
    local_trends: str = Field(description="Specific local market trends relevant to the project.")
    estimated_monthly_rent: Optional[int] = Field(None, description="The estimated monthly rent for new units, if applicable.")
    capitalization_rate: Optional[float] = Field(None, description="The calculated capitalization rate for rental projects, if applicable.")


class ComparableProperty(BaseModel):
    address: str
    sale_price: float
    brief_summary: str
    url: str

class Contractor(BaseModel):
    name: str
    specialty: str
    contact_info: str
    url: Optional[str] = None

class MarketAnalysisOutput(BaseModel):
    """The final JSON object containing market-adjusted ideas, comps, and contractors."""
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]
# --- END: Define the JSON Output Structure ---

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends with guaranteed JSON output."""
    
    PROMPT_TEMPLATE = """
    You are a real estate investment expert. Your task is to analyze renovation ideas based on local market data for the property at {address}.

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS:**
    1.  **Preserve Original Data**: First, ensure that all original fields from the ideas above (`name`, `description`, `estimated_cost`, `cost_source`, `roi`, `feasibility`, `timeline`, `buyer_profile`, `roadmap_steps`, `potential_risks`) are preserved in your final output.
    2.  **Find Real Comps**: Use the 'search_for_comparable_properties' tool to find 2-3 real, recently sold properties to validate potential value.
    3.  **Rental Analysis**: For any idea creating a rentable unit (ADU, duplex), use the search tool to find the average monthly rent in that specific city or neighborhood.
    4.  **Advanced Financials**: If you found rental data, calculate the Capitalization Rate (Cap Rate) using the formula: `Cap Rate = ((Monthly Rent * 12) * 0.6) / Medium Estimated Cost`.
    5.  **Adjust Financials**: Adjust the `estimated_value_add` based on your research of local comps.
    6.  **Recalculate ROI**: Recalculate the ROI and place it in the `adjusted_roi` key. Use the formula: `((Adjusted Medium Value Add - Medium Cost) / Medium Cost) * 100`.
    7.  **Find Local Professionals**: For the top recommendation, use the search tool to find 2-3 top-rated architects or general contractors in the same city as the property at "{address}".

    After your analysis, you MUST format your final response as a single, valid JSON object conforming to the required schema.
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        self.llm_with_tools = self.llm.bind_tools([search_for_comparable_properties])
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
                "recommended_contractors": [],
                "error": str(e)
            }