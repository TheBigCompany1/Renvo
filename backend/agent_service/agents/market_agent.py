from typing import Dict, Any, List, Optional
import json
import traceback
import re
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from core.config import get_settings
import datetime

# --- START: Define the JSON Output Structure ---
class Cost(BaseModel):
    low: int
    medium: int
    high: int

class ValueAdd(BaseModel):
    low: int
    medium: int
    high: int

# FIX: Made several fields optional to make the model more robust
class MarketAdjustedIdea(BaseModel):
    name: str = Field(description="The name of the renovation idea, preserved from the initial analysis.")
    description: str = Field(description="The detailed description of the project, preserved from the initial analysis.")
    estimated_cost: Cost = Field(description="The cost estimates, preserved from the initial analysis.")
    cost_source: Optional[str] = Field(None, description="The cost source, preserved from the initial analysis.")
    estimated_value_add: ValueAdd
    roi: float = Field(description="The original ROI calculation, preserved for reference.")
    feasibility: Optional[str] = Field(None, description="The feasibility assessment, preserved from the initial analysis.")
    timeline: Optional[str] = Field(None, description="The project timeline, preserved from the initial analysis.")
    buyer_profile: Optional[str] = Field(None, description="The ideal buyer profile, preserved and potentially refined by market analysis.")
    roadmap_steps: List[str] = Field(description="The project roadmap, preserved from the initial analysis.")
    potential_risks: List[str] = Field(description="The potential risks, preserved from the initial analysis.")
    after_repair_value: float = Field(description="The estimated After Repair Value (ARV) of the property after the renovation, based on price per square foot analysis.")
    adjusted_roi: float = Field(description="The ROI recalculated based on the ARV.")
    market_demand: Optional[str] = Field(None, description="The current market demand for this type of project.")
    local_trends: Optional[str] = Field(None, description="Specific local market trends relevant to the project.")
    estimated_monthly_rent: Optional[int] = Field(None, description="The estimated monthly rent for new units, if applicable.")
    capitalization_rate: Optional[float] = Field(None, description="The calculated capitalization rate for rental projects, if applicable.")
    new_total_sqft: int = Field(description="The new total square footage of the property after the renovation.")
    new_price_per_sqft: float = Field(description="The new price per square foot of the property after the renovation.")

class ComparableProperty(BaseModel):
    address: str
    sale_price: float
    price_per_sqft: float = Field(description="The calculated price per square foot for this comparable property.")
    brief_summary: str
    url: str

class Contractor(BaseModel):
    name: str
    specialty: str
    contact_info: str
    url: Optional[str] = None

class MarketAnalysisOutput(BaseModel):
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]

# --- END: Define the JSON Output Structure ---

class MarketAnalysisAgent(BaseAgent):
    # FIX: Simplified prompt to be more reliable
    PROMPT_TEMPLATE = """
    You are a meticulous senior real estate investment analyst. Your task is to perform a detailed market and financial analysis for the property at {address}. The original purchase price is ${price}.

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS:**
    1.  **Find Comps**: Use the 'google_search' tool to find 2-3 recently sold properties in the same zip code as {address}. These are your comparable properties or "comps".
    2.  **Calculate Average Price/SqFt**: From the comps you found, calculate the average price per square foot.
    3.  **Analyze Each Idea**: For each renovation idea provided, you MUST perform the following calculations:
        a. Calculate the `after_repair_value` (ARV) using the formula: `ARV = (Average Price Per Square Foot from Step 2) * (New Total Square Footage)`.
        b. Recalculate the ROI and place it in the `adjusted_roi` field using the formula: `((ARV - Original Property Price - Medium Cost) / Medium Cost) * 100`.
    4.  **Find Contractors**: For the top idea (highest `adjusted_roi`), find 2 local contractors.
    5.  **Format Output**: Return a single, valid JSON object that perfectly matches the `MarketAnalysisOutput` schema. You must preserve all original data from the ideas and populate all new fields.

    **Example Search Queries:**
    - "recently sold homes in Los Angeles CA 90066"
    - "general contractors in Los Angeles CA"
    """

    def __init__(self, llm):
        super().__init__(llm)
        settings = get_settings()
        self.structured_llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash-latest",
            google_api_key=settings.gemini_api_key,
            convert_system_message_to_human=True
        ).with_structured_output(MarketAnalysisOutput)

    async def process(self, property_data: Dict[str, Any], renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            address = property_data.get('address', 'Unknown Address')
            sqft = float(property_data.get('sqft', 0) or 0)
            
            price_str = property_data.get('price')
            price = 0.0
            if isinstance(price_str, (int, float)):
                price = float(price_str)
            elif isinstance(price_str, str):
                try:
                    cleaned_str = re.sub(r'[$,\s]', '', price_str)
                    price = float(cleaned_str)
                except (ValueError, TypeError):
                    print(f"[MarketAgent] Warning: Could not convert price string '{price_str}' to float.")
                    price = 0.0

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
