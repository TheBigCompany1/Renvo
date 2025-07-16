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
    """An agent specialized in finding accurate comparable properties."""
    
    # --- FIX: Overhauled prompts with stricter criteria for accuracy ---
    STRICT_PROMPT_TEMPLATE = """
    You are a meticulous real estate analyst. Your sole task is to find recently sold comparable properties ("comps") for a subject property.

    Subject Property Address: {address}

    **Instructions:**
    1.  **Find Recent SOLD Comps**: Use the 'google_search' tool to find 2-3 comparable properties that have **SOLD in the last 6 months**.
    2.  **Strict Location Criteria**: You MUST prioritize properties in the **exact same zip code** as the subject property.
    3.  **Verify Comps**: For EACH comp you find, you MUST verify that the URL you provide links directly to the property at the listed address. **Do not provide a URL that does not match the address.**
    4.  **Calculate Price/SqFt**: For each comp, you MUST calculate and include its `price_per_sqft`.
    5.  **Format Output**: Return a single, valid JSON object that perfectly matches the `CompAnalysisOutput` schema.
    """

    EXPANDED_PROMPT_TEMPLATE = """
    You are a flexible real estate analyst. Your primary search for recently sold comps failed. Your task is to EXPAND your search to find the best available comparable properties.

    Subject Property Address: {address}

    **Instructions:**
    1.  **Find ACTIVE or SOLD Comps**: Use the 'google_search' tool to find 2-3 comparable properties. These can be **currently for sale OR sold in the last 12 months**.
    2.  **Expanded Location Criteria**: You may search in the subject property's zip code AND adjacent zip codes or neighborhoods.
    3.  **Verify Comps**: For EACH comp you find, you MUST verify that the URL you provide links directly to the property at the listed address.
    4.  **Calculate Price/SqFt**: For each comp, you MUST calculate and include its `price_per_sqft`.
    5.  **Format Output**: Return a single, valid JSON object that perfectly matches the `CompAnalysisOutput` schema.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        self.structured_llm = self.llm.with_structured_output(CompAnalysisOutput)

    async def process(self, address: str, search_mode: str = 'strict') -> Dict[str, Any]:
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
