from typing import Dict, Any, List, Optional
import json
import asyncio
import traceback
from agents.base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.pydantic_v1 import BaseModel as LangchainBaseModel, Field as LangchainField
from core.config import get_settings

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
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]

class MarketAnalysisAgent(BaseAgent):
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
    5.  **Preserve and Populate ALL Fields**: For each idea, you MUST populate EVERY field defined in the `MarketAdjustedIdea` schema.
    6.  **Calculate After Repair Value (ARV)**: ARV = (Avg price/sqft) * (Subject sqft).
    7.  **Adjust Financials**: estimated_value_add = ARV - Original Price.
    8.  **Recalculate ROI**: ((ARV - Original Price - Medium Cost) / Medium Cost) * 100.
    9.  **Rental Analysis**: For rental units, estimate rent and cap rate. Else, null.
    10. **Find Local Contractors**: For top idea, find 2-3 pros.

    **FINAL INSTRUCTION**: Ensure a single valid JSON object that matches the schema.
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

            response_dict = response.dict()

            clean_ideas = []
            for idea in response_dict.get("market_adjusted_ideas", []):
                if idea.get("estimated_cost") and not isinstance(idea["estimated_cost"], dict):
                    idea["estimated_cost"] = Cost(**idea["estimated_cost"]).dict()
                if idea.get("estimated_value_add") and not isinstance(idea["estimated_value_add"], dict):
                    idea["estimated_value_add"] = ValueAdd(**idea["estimated_value_add"]).dict()
                clean_ideas.append(idea)

            response_data = {
                "market_adjusted_ideas": clean_ideas,
                "market_summary": response_dict.get("market_summary", ""),
                "comparable_properties": response_dict.get("comparable_properties", []),
                "recommended_contractors": response_dict.get("recommended_contractors", [])
            }

            print("[MarketAgent] Process finished successfully with structured output.")
            return response_data

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