# backend/agent_service/agents/comp_agent.py
from typing import Dict, Any, List, Optional
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

class ComparableProperty(BaseModel):
    address: str = Field(description="The full street address of the comparable property.")
    sale_price: float = Field(description="The final sale price or current list price of the property.")
    price_per_sqft: float = Field(description="The calculated price per square foot for this comparable property.")
    brief_summary: str = Field(description="A one-sentence summary including status (Sold or For Sale), bed, bath, and sqft.")
    url: str = Field(description="The direct URL to the property listing (e.g., Redfin, Zillow).")

class CompAnalysisOutput(BaseModel):
    comparable_properties: List[ComparableProperty]

class CompAnalysisAgent(BaseAgent):
    """An agent that finds and analyzes comparable properties."""

    STRICT_PROMPT_TEMPLATE = """
    You are a comps specialist. Given the subject address:
    {address}
    1.  **Find ACTIVE or SOLD Comps**: Use the 'google_search' tool mentally to select 3–5 truly comparable properties nearby (±20% sqft, similar beds/baths, within ~1–3 miles, recent sales if possible).
    2.  **Return JSON ONLY** with keys: address, sale_price, price_per_sqft, brief_summary, url.
    """

    EXPANDED_PROMPT_TEMPLATE = """
    If strict search yields poor results, broaden radius (up to ~5 miles) and loosen filters slightly, still prioritizing similarity.
    Return the same JSON structure as STRICT.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        # Ask the LLM to return a Pydantic-validated structure
        self.structured_llm = self.llm.with_structured_output(CompAnalysisOutput)

    async def process(self, address: str, search_mode: str = "strict") -> Dict[str, Any]:
        """
        Finds comparable properties for a given address using either a 'strict' or 'expanded' search mode.
        """
        print(f"[CompAgent] Process started in '{search_mode}' mode.")
        
        if search_mode == 'expanded':
            prompt_template = self.EXPANDED_PROMPT_TEMPLATE
        else:
            prompt_template = self.STRICT_PROMPT_TEMPLATE
            
        prompt = self._create_prompt(prompt_template, address=address)
        response = await self.structured_llm.ainvoke(prompt)
        print(f"[CompAgent] Process finished for '{search_mode}' mode.")
        return response.dict()
