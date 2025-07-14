# backend/agent_service/agents/market_agent.py
from typing import Dict, Any, List, Optional
import json
import asyncio
import re
import traceback
from agents.base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.pydantic_v1 import BaseModel as LangchainBaseModel, Field as LangchainField
from core.config import get_settings

# --- START: Define the JSON Output Structure ---
class Cost(LangchainBaseModel):
    low: int
    medium: int
    high: int

class ValueAdd(LangchainBaseModel):
    low: int
    medium: int
    high: int

class MarketAdjustedIdea(LangchainBaseModel):
    name: str = LangchainField(description="The name of the renovation idea, preserved from the initial analysis.")
    description: str = LangchainField(description="The detailed description of the project, preserved from the initial analysis.")
    estimated_cost: Cost = LangchainField(description="The cost estimates, preserved from the initial analysis.")
    cost_source: str = LangchainField(description="The cost source, preserved from the initial analysis.")
    estimated_value_add: ValueAdd
    roi: float = LangchainField(description="The original ROI calculation, preserved for reference.")
    feasibility: str = LangchainField(description="The feasibility assessment, preserved from the initial analysis.")
    timeline: str = LangchainField(description="The project timeline, preserved from the initial analysis.")
    buyer_profile: str = LangchainField(description="The ideal buyer profile, preserved and potentially refined by market analysis.")
    roadmap_steps: List[str] = LangchainField(description="The project roadmap, preserved from the initial analysis.")
    potential_risks: List[str] = LangchainField(description="The potential risks, preserved from the initial analysis.")

    after_repair_value: float = LangchainField(description="The estimated After Repair Value (ARV) of the property after the renovation, based on price per square foot analysis.")
    adjusted_roi: float = LangchainField(description="The ROI recalculated based on the ARV.")
    market_demand: str = LangchainField(description="The current market demand for this type of project.")
    local_trends: str = LangchainField(description="Specific local market trends relevant to the project.")
    estimated_monthly_rent: Optional[int] = LangchainField(None, description="The estimated monthly rent for new units, if applicable.")
    capitalization_rate: Optional[float] = LangchainField(None, description="The calculated capitalization rate for rental projects, if applicable.")


class ComparableProperty(LangchainBaseModel):
    address: str
    sale_price: float
    price_per_sqft: float = LangchainField(description="The calculated price per square foot for this comparable property.")
    brief_summary: str
    url: str

class Contractor(LangchainBaseModel):
    name: str
    specialty: str
    contact_info: str
    url: Optional[str] = None

class MarketAnalysisOutput(LangchainBaseModel):
    """The final JSON object containing market-adjusted ideas, comps, and contractors."""
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]
# --- END: Define the JSON Output Structure ---

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends with guaranteed JSON output."""

    # ** THE FIX: The prompt is now much more explicit about required fields. **
    PROMPT_TEMPLATE = """
    You are a senior real estate investment analyst. Your task is to perform a detailed market and financial analysis for the property at {address} with a square footage of {sqft}. The original purchase price is ${price}.

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS - A TWO-STEP PROCESS:**

    **STEP 1: COMPARABLE PROPERTY ANALYSIS (COMPS)**
    1.  **Find Comps**: Use the 'google_search' tool to find 2-3 real, recently sold properties that are truly comparable to the subject property.
    2.  **Comp Criteria**: Your search must be specific. Find properties in the same neighborhood or zip code that have sold in the last 12 months and are similar in bed/bath count, square footage, and amenities.
    3.  **Price Per Square Foot**: For EACH comp you find, you MUST calculate and include its `price_per_sqft`.
    4.  **Calculate Average**: Determine the average price per square foot from all the comps you found.

    **STEP 2: FINANCIAL PROJECTIONS FOR EACH RENOVATION IDEA**
    5.  **Preserve and Populate ALL Fields**: For each idea, you MUST populate EVERY field defined in the `MarketAdjustedIdea` schema. This includes preserving all original data (`name`, `description`, `roi`, etc.) and adding all new analysis fields (`after_repair_value`, `adjusted_roi`, `market_demand`, `local_trends`, etc.). DO NOT OMIT ANY FIELDS.
    6.  **Calculate After Repair Value (ARV)**: Calculate the `after_repair_value` using the formula: `ARV = (Average Price Per Square Foot from Step 4) * (Subject Property's Square Footage)`.
    7.  **Adjust Financials**: The `estimated_value_add` should be a dictionary calculated as `ARV - (Original Property Price)`.
    8.  **Recalculate ROI**: Recalculate the ROI and place it in the `adjusted_roi` field. The formula is: `((ARV - Original Property Price - Medium Cost) / Medium Cost) * 100`.
    9.  **Rental Analysis**: For any idea creating a rentable unit (e.g., ADU), find the average monthly rent and calculate the `capitalization_rate`. If not applicable, set these fields to null.
    10. **Find Local Professionals**: For the top recommendation, find 2-3 local contractors.

    **FINAL INSTRUCTION**: Before finishing, double-check your entire response to ensure it is a single, valid JSON object that perfectly matches the `MarketAnalysisOutput` schema, including all required fields for every object in the lists.
    """

    def __init__(self, llm):
        super().__init__(llm)
        settings = get_settings()
        self.structured_llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-pro-latest",
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        ).with_structured_output(MarketAnalysisOutput)

    async def process(self, property_data: Dict[str, Any], renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market trends with guaranteed JSON output."""
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            address = property_data.get('address', 'Unknown Address')
            sqft = property_data.get('sqft', 0)
            price = property_data.get('price', 0.0)

            try: sqft = float(sqft)
            except (ValueError, TypeError): sqft = 0
            try: price = float(price)
            except (ValueError, TypeError): price = 0

            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                address=address,
                sqft=sqft,
                price=price,
                renovation_json=renovation_json
            )

            print("\n--- [MarketAgent] PROMPT SENT TO LLM ---")
            print(prompt)
            print("--- END OF PROMPT ---\n")
            
            print("[MarketAgent] Initial call to LLM...")
            response = await self.structured_llm.ainvoke(prompt)
            
            print("[MarketAgent] Process finished successfully with structured output.")
            return response.dict()
            
        except Exception as e:
            print(f"[MarketAgent] General error in process: {str(e)}")
            print(f"[MarketAgent] Traceback: {traceback.format_exc()}")
            return {
                "market_adjusted_ideas": [],
                "market_summary": "Market analysis could not be completed due to a processing error.",
                "comparable_properties": [],
                "recommended_contractors": [],
                "error": str(e)
            }
