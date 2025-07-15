# backend/agent_service/agents/comp_agent.py
from typing import Dict, Any, List, Optional
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from core.config import get_settings

class ComparableProperty(BaseModel):
    address: str = Field(description="The full street address of the comparable property.")
    sale_price: float = Field(description="The final sale price of the property.")
    price_per_sqft: float = Field(description="The calculated price per square foot for this comparable property.")
    brief_summary: str = Field(description="A one-sentence summary including bed, bath, and sqft.")
    url: str = Field(description="The direct URL to the property listing (e.g., Redfin, Zillow).")

class CompAnalysisOutput(BaseModel):
    comparable_properties: List[ComparableProperty]

class CompAnalysisAgent(BaseAgent):
    """An agent specialized in finding accurate comparable properties."""
    PROMPT_TEMPLATE = """
    You are a meticulous real estate analyst. Your sole task is to find recently sold comparable properties ("comps") for a subject property.

    Subject Property Address: {address}

    **Instructions:**
    1.  **Find Recent Comps**: Use the 'google_search' tool to find 2-3 comparable properties that have **sold in the last 6 months**.
    2.  **Strict Location Criteria**: You MUST prioritize properties in the **exact same zip code** as the subject property.
    3.  **Verify Comps**: For EACH comp you find, you MUST verify that the URL you provide links directly to the property at the listed address. **Do not provide a URL that does not match the address.**
    4.  **Calculate Price/SqFt**: For each comp, you MUST calculate and include its `price_per_sqft`.
    5.  **Format Output**: Return a single, valid JSON object that perfectly matches the `CompAnalysisOutput` schema.

    **Example Search Queries:**
    - "recently sold homes in Los Angeles CA 90066"
    - "4250 Mildred Ave, Los Angeles, CA 90066 sale price"
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        self.structured_llm = self.llm.with_structured_output(CompAnalysisOutput)

    async def process(self, address: str) -> Dict[str, Any]:
        """Finds comparable properties for a given address."""
        print("[CompAgent] Process started.")
        prompt = self._create_prompt(self.PROMPT_TEMPLATE, address=address)
        response = await self.structured_llm.ainvoke(prompt)
        print("[CompAgent] Process finished.")
        return response.dict()
