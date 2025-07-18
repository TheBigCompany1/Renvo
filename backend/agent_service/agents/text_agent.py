# agents/text_agent.py
from typing import Dict, Any, List
import json
import asyncio
import re
import traceback
from agents.base import BaseAgent
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.pydantic_v1 import BaseModel as LangchainBaseModel, Field as LangchainField
from core.config import get_settings

# --- DEFINES THE GUARANTEED JSON OUTPUT STRUCTURE ---
class Cost(LangchainBaseModel):
    low: int = LangchainField(description="The low-end estimated cost.")
    medium: int = LangchainField(description="The medium estimated cost.")
    high: int = LangchainField(description="The high-end estimated cost.")

class ValueAdd(LangchainBaseModel):
    low: int = LangchainField(description="The low-end estimated value add.")
    medium: int = LangchainField(description="The medium estimated value add.")
    high: int = LangchainField(description="The high-end estimated value add.")

class RenovationIdea(LangchainBaseModel):
    name: str = LangchainField(description="Name of the renovation project.")
    description: str = LangchainField(description="Detailed description of the large-scale project.")
    estimated_cost: Cost
    cost_source: str = LangchainField(description="Source of the cost data, e.g., 'National Association of Realtors 2025 Report'")
    estimated_value_add: ValueAdd
    roi: float = LangchainField(description="The calculated Return on Investment as a number.")
    feasibility: str = LangchainField(description="Feasibility assessment (e.g., 'Moderate/Difficult').")
    timeline: str = LangchainField(description="Estimated project timeline (e.g., '6-12 months').")
    buyer_profile: str = LangchainField(description="The ideal buyer profile for this renovation.")
    roadmap_steps: List[str] = LangchainField(description="A list of 3-5 key actions to start the project.")
    potential_risks: List[str] = LangchainField(description="A list of 2-3 potential hurdles.")

class RenovationIdeasOutput(LangchainBaseModel):
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
    2.  **Research Local Costs**: For EACH idea, you MUST use the `google_search` tool to find localized construction costs. Example search query: "average cost to build an ADU in Los Angeles County".
    3.  **Provide Sourced Estimates**: Use the search results to provide an accurate `estimated_cost`. You MUST also add a `cost_source` key citing the source of your cost data.
    4.  **Actionable Steps & Risks**: For each idea, create a `roadmap_steps` list with 3-5 key actions the user should take to start the project (e.g., "Consult an architect specializing in local code," "Secure financing via a HELOC or construction loan."). It is critical that you populate this list for every idea.
    5.  **Identify Risks**: For each idea, create a `potential_risks` list identifying 2-3 potential hurdles (e.g., "Permitting delays in this city are common," "Budget may increase due to foundation issues in older homes."). It is critical that you populate this list for every idea.
    6.  **Ensure Financial Accuracy**: Calculate the ROI precisely using the formula: ((medium value add - medium cost) / medium cost) * 100.

    After using your tools and analyzing the results, you MUST format your final response as a single, valid JSON object conforming to the required schema.
    """

    def __init__(self, llm):
        super().__init__(llm)
        settings = get_settings()
        # ** THE FIX: Using the correct, high-performing model name 'gemini-1.5-pro-latest' **
        self.structured_llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro", 
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        ).with_structured_output(RenovationIdeasOutput)


    async def process(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate renovation ideas using a robust, tool-calling LangChain flow."""
        print("[TextAgent] Process started.")
        try:
            property_json = json.dumps(property_data, indent=2)
            prompt = self._create_prompt(self.PROMPT_TEMPLATE, property_json=property_json)

            # ** ADDED LOGGING **
            print("\n--- [TextAgent] PROMPT SENT TO LLM ---")
            print(prompt)
            print("--- END OF PROMPT ---\n")

            print("[TextAgent] Initial call to LLM...")
            response = await self.structured_llm.ainvoke(prompt)
            
            print("[TextAgent] Process finished successfully with structured output.")
            return response.dict()

        except Exception as e:
            print(f"[TextAgent] General error in process: {str(e)}")
            print(f"[TextAgent] Traceback: {traceback.format_exc()}")
            return {"renovation_ideas": [], "error": f"General TextAgent error: {str(e)}"}
