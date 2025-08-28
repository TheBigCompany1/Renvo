# backend/agent_service/agents/financial_agent.py
from typing import Dict, Any, List, Optional
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
import traceback
import json

# Pydantic models remain the same
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
    cost_source: Optional[str]
    estimated_value_add: ValueAdd
    roi: float
    feasibility: Optional[str]
    timeline: Optional[str]
    buyer_profile: Optional[str]
    roadmap_steps: List[str]
    potential_risks: List[str]
    after_repair_value: float
    adjusted_roi: float
    market_demand: Optional[str]
    local_trends: Optional[str]
    estimated_monthly_rent: Optional[int]
    new_total_sqft: int
    new_price_per_sqft: float

class FinancialAnalysisOutput(BaseModel):
    market_adjusted_ideas: List[MarketAdjustedIdea]
    average_price_per_sqft: float

class FinancialAnalysisAgent(BaseAgent):
    """An agent specialized in financial calculations for renovation projects."""
    
    PROMPT_TEMPLATE = """
    You are a precise financial analyst for real estate investments. Your sole task is to perform financial calculations on the provided data.

    **List Price:** ${price}
    **Comparable Properties Found:**
    {comps_json}

    **Renovation Ideas to Analyze:**
    {renovation_json}

    **Instructions:**
    1.  **Calculate Average Price/SqFt**: From the provided comparable properties, calculate the single average price per square foot (use $1,100 if no comps are provided).
    2.  **Analyze Each Idea**: For each renovation idea, you MUST perform the following calculations with precision:
        a. Calculate the `after_repair_value` (ARV) using the formula: `ARV = (Average Price Per Square Foot) * (New Total Square Footage)`.
        b. Calculate the `estimated_value_add` (medium value) using the formula: `Value Add = ARV - List Price`. Populate the `estimated_value_add` field with this.
        c. Recalculate the ROI and place it in the `adjusted_roi` field using the formula: `(ARV - List Price - Medium Cost) / Medium Cost`.
    3.  **Format Output**: Return a single, valid JSON object that perfectly matches the `FinancialAnalysisOutput` schema. Do NOT use any tools.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        self.structured_llm = self.llm.with_structured_output(FinancialAnalysisOutput)

    async def process(self, property_data: Dict[str, Any], renovation_ideas: List[Dict[str, Any]], comps: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Performs financial analysis on renovation ideas."""
        print("[FinancialAgent] Process started.")
        try:
            price = property_data.get('price', 0)
            
            # --- THIS IS THE FIX ---
            # Add a safety check to ensure the price is valid before proceeding.
            if not price or price == 0:
                raise ValueError("Cannot perform financial analysis on a property with a $0 list price.")

            prompt = self._create_prompt(
                self.PROMPT_TEMPLATE,
                price=price,
                renovation_json=json.dumps(renovation_ideas, indent=2),
                comps_json=json.dumps(comps, indent=2)
            )
            response = await self.structured_llm.ainvoke(prompt)
            print("[FinancialAgent] Process finished.")
            return response.dict()
        except Exception as e:
            print(f"[FinancialAgent] Error: {e}")
            print(traceback.format_exc())
            # Return the error so the orchestrator can handle it.
            return {"error": f"FinancialAgent error: {str(e)}"}