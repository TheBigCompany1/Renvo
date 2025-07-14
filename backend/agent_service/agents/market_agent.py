from typing import Dict, Any, List, Optional
import json
import traceback
import re # Import the regular expression module
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from core.config import get_settings

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
    name: str = Field(description="The name of the renovation idea, preserved from the initial analysis.")
    description: str = Field(description="The detailed description of the project, preserved from the initial analysis.")
    estimated_cost: Cost = Field(description="The cost estimates, preserved from the initial analysis.")
    cost_source: str = Field(description="The cost source, preserved from the initial analysis.")
    estimated_value_add: ValueAdd
    roi: float = Field(description="The original ROI calculation, preserved for reference.")
    feasibility: str = Field(description="The feasibility assessment, preserved from the initial analysis.")
    timeline: str = Field(description="The project timeline, preserved from the initial analysis.")
    buyer_profile: str = Field(description="The ideal buyer profile, preserved and potentially refined by market analysis.")
    roadmap_steps: List[str] = Field(description="The project roadmap, preserved from the initial analysis.")
    potential_risks: List[str] = Field(description="The potential risks, preserved from the initial analysis.")
    after_repair_value: float = Field(description="The estimated After Repair Value (ARV) of the property after the renovation, based on price per square foot analysis.")
    adjusted_roi: float = Field(description="The ROI recalculated based on the ARV.")
    market_demand: str = Field(description="The current market demand for this type of project.")
    local_trends: str = Field(description="Specific local market trends relevant to the project.")
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
    PROMPT_TEMPLATE = """
    You are a meticulous senior real estate investment analyst. Your task is to perform a detailed market and financial analysis for the property at {address} with a square footage of {sqft}. The original purchase price is ${price}.

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS - A TWO-STEP PROCESS:**

    **STEP 1: HYPER-LOCAL COMPARABLE PROPERTY ANALYSIS (COMPS)**
    1.  **Find Comps**: Use the 'google_search' tool to find 2-3 recently sold properties.
    2.  **Strict Comp Criteria**: You MUST prioritize properties in the **exact same zip code** as the subject property ({address}). Only if you find zero results should you expand to adjacent neighborhoods. The comps must be similar in bed/bath count, square footage, and amenities.
    3.  **Price Per Square Foot**: For EACH comp you find, you MUST calculate and include its `price_per_sqft`.
    4.  **Calculate Average**: Determine the average price per square foot from all the valid comps you found.

    **STEP 2: FINANCIAL PROJECTIONS FOR EACH RENOVATION IDEA**
    5.  **Preserve and Populate ALL Fields**: For each idea, you MUST populate EVERY field defined in the `MarketAdjustedIdea` schema. This includes preserving all original data (`name`, `description`, `roadmap_steps`, `potential_risks`, etc.) and adding all new analysis fields. DO NOT OMIT ANY FIELDS.
    6.  **Square Footage Analysis**: For each renovation idea, calculate the `new_total_sqft`. Then, calculate the `new_price_per_sqft` by dividing the `after_repair_value` by the `new_total_sqft`.
    7.  **Calculate After Repair Value (ARV)**: Calculate the `after_repair_value` using the formula: `ARV = (Average Price Per Square Foot from Step 4) * (New Total Square Footage)`.
    8.  **Recalculate ROI**: Recalculate the ROI and place it in the `adjusted_roi` field. The formula is: `((ARV - Original Property Price - Medium Cost) / Medium Cost) * 100`.
    9.  **Find Local Professionals**: For the top recommendation, find 2-3 local contractors.

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
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            address = property_data.get('address', 'Unknown Address')
            sqft = float(property_data.get('sqft', 0) or 0)
            
            # =========== FIX START ===========
            # This block handles various formats for the 'price' field.
            # It cleans the string of currency symbols and commas before conversion.
            price_str = property_data.get('price')
            price = 0.0
            if isinstance(price_str, (int, float)):
                price = float(price_str)
            elif isinstance(price_str, str):
                try:
                    # Remove '$', ',', and spaces before converting to float
                    cleaned_str = re.sub(r'[$,\s]', '', price_str)
                    price = float(cleaned_str)
                except (ValueError, TypeError):
                    # Log a warning if conversion fails, and default to 0.0
                    print(f"[MarketAgent] Warning: Could not convert price string '{price_str}' to float.")
                    price = 0.0
            # =========== FIX END ===========

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
