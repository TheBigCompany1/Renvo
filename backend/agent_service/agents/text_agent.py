# agents/text_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
from agents.base import BaseAgent
from tools.search_tools import search_for_comparable_properties
from langchain_core.messages import ToolMessage
from pydantic import BaseModel, Field

# --- DEFINES THE GUARANTEED JSON OUTPUT STRUCTURE ---
class Cost(BaseModel):
    low: int = Field(description="The low-end estimated cost.")
    medium: int = Field(description="The medium estimated cost.")
    high: int = Field(description="The high-end estimated cost.")

class ValueAdd(BaseModel):
    low: int = Field(description="The low-end estimated value add.")
    medium: int = Field(description="The medium estimated value add.")
    high: int = Field(description="The high-end estimated value add.")

class RenovationIdea(BaseModel):
    name: str = Field(description="Name of the renovation project.")
    description: str = Field(description="Detailed description of the large-scale project.")
    estimated_cost: Cost
    cost_source: str = Field(description="Source of the cost data, e.g., 'National Association of Realtors 2025 Report'")
    estimated_value_add: ValueAdd
    roi: float = Field(description="The calculated Return on Investment as a number.")
    feasibility: str = Field(description="Feasibility assessment (e.g., 'Moderate/Difficult').")
    timeline: str = Field(description="Estimated project timeline (e.g., '6-12 months').")
    buyer_profile: str = Field(description="The ideal buyer profile for this renovation.")
    roadmap_steps: List[str] = Field(description="A list of 3-5 key actions to start the project.")
    potential_risks: List[str] = Field(description="A list of 2-3 potential hurdles.")

class RenovationIdeasOutput(BaseModel):
    """The final JSON object containing a list of renovation ideas."""
    renovation_ideas: List[RenovationIdea]
# --- END OF JSON STRUCTURE DEFINITION ---


class TextAnalysisAgent(BaseAgent):
    """Agent for generating renovation ideas with sourced cost data and guaranteed JSON output."""

    PROMPT_TEMPLATE = """
    You are an expert real estate developer and financial strategist. Your primary goal is to identify the highest and best use for a property.

    First, review all the details of the property provided in the JSON below.

    PROPERTY DATA TO ANALYZE:
    {property_json}

    INSTRUCTIONS:
    1.  **Generate Big Ideas**: Create 3-5 transformative, large-scale project recommendations (e.g., ADU, duplex conversion, demolish and rebuild). Do not suggest minor cosmetic upgrades.
    2.  **Research Local Costs**: For EACH idea, you MUST use the `search_for_comparable_properties` tool to find localized construction costs. Example search query: "average cost to build an ADU in Los Angeles County".
    3.  **Provide Sourced Estimates**: Use the search results to provide an accurate `estimated_cost`. You MUST also add a `cost_source` key citing the source of your cost data.
    4.  **Actionable Steps & Risks**: For each idea, create a `roadmap_steps` list with 3-5 key actions the user should take to start the project (e.g., "Consult an architect specializing in local code," "Secure financing via a HELOC or construction loan.").
    5.  **Identify Risks**: For each idea, create a `potential_risks` list identifying 2-3 potential hurdles (e.g., "Permitting delays in this city are common," "Budget may increase due to foundation issues in older homes.").
    6.  **Ensure Financial Accuracy**: Calculate the ROI precisely using the formula: ((medium value add - medium cost) / medium cost) * 100.

    After using your tools and analyzing the results, you MUST format your final response as a single, valid JSON object conforming to the required schema. Your output MUST NOT contain any other text, greetings, or markdown formatting. It must start with '{{' and end with '}}'.
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        self.llm_with_tools = self.llm.bind_tools([search_for_comparable_properties])
        # This line forces the final output to match the RenovationIdeasOutput schema
        self.structured_llm = self.llm.with_structured_output(RenovationIdeasOutput)

    async def process(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renovation ideas, handling tool calls and ensuring structured JSON output."""
        print("[TextAgent] Process started.")
        try:
            property_json = json.dumps(property_data, indent=2)
            prompt = self._create_prompt(self.PROMPT_TEMPLATE, property_json=property_json)
            
            print("[TextAgent] Initial call to LLM with tools...")
            ai_msg = await asyncio.to_thread(self.llm_with_tools.invoke, prompt)
            
            tool_calls = getattr(ai_msg, 'tool_calls', []) or []
            
            if not tool_calls:
                print("[TextAgent] No tool call was requested. Forcing structured output on initial prompt.")
                response = await asyncio.to_thread(self.structured_llm.invoke, prompt)
                return response.dict()

            print(f"[TextAgent] LLM requested to use {len(tool_calls)} tool(s).")
            tool_outputs = []
            for tool_call in tool_calls:
                tool_name = tool_call.get("name")
                print(f"[TextAgent] Executing tool: {tool_name} with args: {tool_call.get('args')}")
                output = search_for_comparable_properties.invoke(tool_call.get('args'))
                tool_outputs.append(ToolMessage(content=str(output), tool_call_id=tool_call['id']))

            print("[TextAgent] Calling LLM again with all tool outputs and forcing JSON...")
            history = [ai_msg] + tool_outputs
            final_response = await asyncio.to_thread(self.structured_llm.invoke, history)
            
            print("[TextAgent] Process finished successfully with structured output.")
            return final_response.dict()

        except Exception as e:
            import traceback
            print(f"[TextAgent] General error in process: {str(e)}")
            print(f"[TextAgent] Traceback: {traceback.format_exc()}")
            return {"renovation_ideas": [], "error": f"General TextAgent error: {str(e)}"}