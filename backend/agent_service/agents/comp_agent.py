# backend/agent_service/agents/comp_agent.py
from typing import Dict, Any, List
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

class ComparableProperty(BaseModel):
    address: str = Field(description="Full street address of the comparable property.")
    sale_price: float = Field(description="Final sale price or current list price.")
    price_per_sqft: float = Field(description="Calculated price per square foot.")
    brief_summary: str = Field(description="One-sentence summary including status, beds/baths, and sqft.")
    url: str = Field(description="Direct URL to the property listing (Redfin/Zillow, etc.).")

class CompAnalysisOutput(BaseModel):
    comparable_properties: List[ComparableProperty]

class CompAnalysisAgent(BaseAgent):
    """Finds and analyzes comparable properties."""

    STRICT_PROMPT_TEMPLATE = """
    You are a comps specialist. Given the subject address:
    {address}
    1) Select 3–5 nearby comparable properties (±20% sqft, similar beds/baths, within ~1–3 miles, recent sales preferred).
    2) Return JSON ONLY with keys: address, sale_price, price_per_sqft, brief_summary, url.
    """

    EXPANDED_PROMPT_TEMPLATE = """
    If strict search yields poor results, broaden radius (up to ~5 miles) and loosen filters slightly, still prioritizing similarity.
    Return the same JSON structure as STRICT.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        # Ask the LLM to return a Pydantic-validated structure
        self.structured_llm = self.llm.with_structured_output(CompAnalysisOutput)

    async def process(self, address: str, search_mode: str = "strict") -> List[Dict[str, Any]]:
        """
        Finds comparable properties for a given address using either a 'strict' or 'expanded' search mode.
        Returns a list of dicts for downstream consumers.
        """
        print(f"[CompAgent] Process started in '{search_mode}' mode.")
        prompt_template = self.EXPANDED_PROMPT_TEMPLATE if search_mode == "expanded" else self.STRICT_PROMPT_TEMPLATE
        prompt = self._create_prompt(prompt_template, address=address)
        result = await self.structured_llm.ainvoke(prompt)
        comps = [c.model_dump() for c in result.comparable_properties]
        print(f"[CompAgent] Process finished in '{search_mode}' mode with {len(comps)} comps.")
        return comps
