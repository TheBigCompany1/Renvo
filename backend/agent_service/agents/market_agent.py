# backend/agent_service/agents/market_agent.py
from typing import Dict, Any, List, Optional
import json
import asyncio
import re
from agents.base import BaseAgent
from pydantic import BaseModel, Field
from langchain_core.messages import ToolMessage
import google.generativeai as genai
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
    """The final JSON object containing market-adjusted ideas, comps, and contractors."""
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]
# --- END: Define the JSON Output Structure ---

class MarketAnalysisAgent(BaseAgent):
    """Agent for analyzing market trends with guaranteed JSON output."""
    
    PROMPT_TEMPLATE = """
    You are a senior real estate investment analyst. Your task is to perform a detailed market and financial analysis for the property at {address} with a square footage of {sqft}. The original purchase price is ${price}.

    **IDEAS TO ANALYZE:**
    {renovation_json}

    **YOUR TASKS - A TWO-STEP PROCESS:**

    **STEP 1: COMPARABLE PROPERTY ANALYSIS (COMPS)**
    1.  **Find Comps**: Use the 'Google Search' tool to find 2-3 recently sold properties that are truly comparable to the subject property.
    2.  **Comp Criteria**: Your search must be specific. Find properties in the same neighborhood or zip code that have sold in the last 12 months and are similar in bed/bath count, square footage, and amenities.
    3.  **Price Per Square Foot**: For EACH comp you find, you MUST calculate and include its `price_per_sqft` (sale price / square footage).
    4.  **Calculate Average**: Determine the average price per square foot from all the comps you found.

    **STEP 2: FINANCIAL PROJECTIONS FOR EACH RENOVATION IDEA**
    5.  **Preserve Original Data**: First, ensure that all original fields from the ideas (`name`, `description`, `estimated_cost`, etc.) are preserved in your final output.
    6.  **Calculate After Repair Value (ARV)**: For each renovation idea, calculate the potential `after_repair_value` (ARV). The formula is: `ARV = (Average Price Per Square Foot from Step 4) * (Subject Property's Square Footage)`.
    7.  **Adjust Financials**: The `estimated_value_add` should now be calculated as `ARV - (Original Property Price)`.
    8.  **Recalculate ROI**: Recalculate the ROI based on this new data and place it in the `adjusted_roi` key. The formula is: `((ARV - Original Property Price - Medium Cost) / Medium Cost) * 100`.
    9.  **Rental Analysis**: For any idea creating a rentable unit (ADU, duplex), find the average monthly rent in that city. If you find rental data, calculate the Capitalization Rate (Cap Rate) using the formula: `Cap Rate = ((Monthly Rent * 12) * 0.6) / Medium Estimated Cost`.
    10. **Find Local Professionals**: For the top recommendation, use the search tool to find 2-3 top-rated architects or general contractors in the same city as the property.

    After your analysis, you MUST format your final response as a single, valid JSON object conforming to the required schema.
    """
    
    def __init__(self, llm):
        super().__init__(llm)
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        # **THE FIX**: We remove the 'tools' argument from here.
        self.genai_model = genai.GenerativeModel('gemini-pro')

    async def process(self, property_data: Dict[str, Any], renovation_ideas: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze market trends with guaranteed JSON output."""
        try:
            print("[MarketAgent] Process started.")
            renovation_json = json.dumps(renovation_ideas, indent=2)
            address = property_data.get('address', 'Unknown Address')
            sqft = property_data.get('sqft', 0)
            price = property_data.get('price', 0)

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
            
            print("[MarketAgent] Initial call to LLM with tools...")
            # **THE FIX**: We put the correctly formatted 'tools' argument here.
            response = self.genai_model.generate_content(
                prompt,
                tools=[{"Google Search": {}}]
            )
            
            print("[MarketAgent] Process finished successfully with structured output.")
            cleaned_response = response.text.replace("```json", "").replace("```", "")
            return json.loads(cleaned_response)
            
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