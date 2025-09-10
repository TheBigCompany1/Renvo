# backend/agent_service/agents/contractor_agent.py
from typing import Dict, Any, List, Optional
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

class Contractor(BaseModel):
    name: str = Field(description="The name of the contracting company.")
    specialty: str = Field(description="The specific specialty of the contractor (e.g., ADU Construction, Kitchen Remodeling).")
    contact_info: str = Field(description="A phone number or email address for the contractor.")
    url: Optional[str] = Field(None, description="The contractor's website URL, if available.")

class ContractorOutput(BaseModel):
    recommended_contractors: List[Contractor]

class ContractorSearchAgent(BaseAgent):
    """An agent that finds local contractors for the top-ranked renovation."""

    PROMPT_TEMPLATE = """
    You are a contractor matchmaker. For the project type:
    "{project_name}"
    near the property at:
    "{address}"
    return 2–3 reputable local contractors as pure JSON ONLY with keys:
    name, specialty, contact_info, url.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        self.structured_llm = self.llm.with_structured_output(ContractorOutput)

    async def process(self, project_name: str, address: str) -> Dict[str, Any]:
        """Finds local contractors for a given project type and location."""
        print("[ContractorAgent] Process started.")
        prompt = self._create_prompt(
            self.PROMPT_TEMPLATE,
            project_name=project_name,
            address=address
        )
        response = await self.structured_llm.ainvoke(prompt)
        print("[ContractorAgent] Process finished.")
        return response.dict()
