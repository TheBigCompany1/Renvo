import logging
from typing import List, Optional
from langchain_core.tools import Tool
from langchain_core.pydantic_v1 import BaseModel, Field
from langchain.output_parsers.openai_tools import JsonOutputKeyToolsParser
from langchain_core.runnables import RunnableLambda

from agents.base_agent import BaseAgent
from tools.search_tool import run_google_search
from utils.llm_utils import get_openai_function_llm

logger = logging.getLogger(__name__)

# ----------------------------
# Pydantic Schemas
# ----------------------------

class Cost(BaseModel):
    low: float
    medium: float
    high: float

class ValueAdd(BaseModel):
    low: float
    medium: float
    high: float

class MarketAdjustedIdea(BaseModel):
    name: str
    description: str
    estimated_cost: Cost
    estimated_value_add: ValueAdd
    roi: float
    feasibility: str
    timeline: str
    image_insights: Optional[str]
    roadmap_steps: List[str]
    potential_risks: List[str]
    new_total_sqft: Optional[float] = None
    new_price_per_sqft: Optional[float] = None
    after_repair_value: Optional[float] = None
    adjusted_roi: Optional[float] = None

class ComparableProperty(BaseModel):
    address: str
    price: float
    sqft: float
    price_per_sqft: float
    source: str
    url: Optional[str] = None

class Contractor(BaseModel):
    name: str
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    specialties: Optional[str] = None

class MarketAnalysisOutput(BaseModel):
    market_adjusted_ideas: List[MarketAdjustedIdea]
    market_summary: str
    comparable_properties: List[ComparableProperty]
    recommended_contractors: List[Contractor]

# ----------------------------
# Prompt Template
# ----------------------------

def build_market_analysis_prompt(property_data: dict, renovation_ideas: List[dict]) -> str:
    prompt = f"""
You are a meticulous senior real estate investment analyst. Your task is to perform a detailed market and financial analysis for the property at {property_data['address']} with a square footage of {property_data['sqft']}. The original purchase price is ${property_data.get('price', 0)}.

**IDEAS TO ANALYZE:**
{renovation_ideas}

**YOUR TASKS - A TWO-STEP PROCESS:**

**STEP 1: HYPER-LOCAL COMPARABLE PROPERTY ANALYSIS (COMPS)**
1.  **Find Comps**: Use the 'google_search' tool to find 2-3 recently sold properties.
2.  **Strict Comp Criteria**: You MUST prioritize properties in the **exact same zip code** as the subject property ({property_data['address']}). Only if you find zero results should you expand to adjacent neighborhoods. The comps must be similar in bed/bath count, square footage, and amenities.
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
    return prompt

# ----------------------------
# Agent Definition
# ----------------------------

class MarketAnalysisAgent(BaseAgent):
    def __init__(self):
        tools = [
            Tool(
                name="google_search",
                func=run_google_search,
                description="Useful for finding hyper-local data like construction costs, recent home sales, or local professionals."
            )
        ]

        structured_llm = (
            get_openai_function_llm(tools)
            .with_config({"run_name": "MarketAnalysisLLM"})
            .with_structured_output(MarketAnalysisOutput)
        )

        self.structured_llm = structured_llm

    async def process(self, property_data: dict, renovation_ideas: List[dict]) -> dict:
        prompt = build_market_analysis_prompt(property_data, renovation_ideas)

        try:
            response = await self.structured_llm.ainvoke(prompt)
            return response.dict()
        except Exception as e:
            logger.error("[MarketAgent] General error in process: %s", str(e), exc_info=True)
            return {
                "market_adjusted_ideas": [],
                "market_summary": "Market analysis could not be completed due to a processing error.",
                "comparable_properties": [],
                "recommended_contractors": [],
                "error": str(e)
            }
