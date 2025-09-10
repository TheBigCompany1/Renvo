# backend/agent_service/agents/contractor_agent.py
from typing import Dict, Any, List, Optional
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from models.contractor_model import Contractor

class Contractor(BaseModel):
    name: str = Field(description="The name of the contracting company.")
    specialty: str = Field(description="The specific specialty of the contractor (e.g., ADU Construction, Kitchen Remodeling).")
    contact_info: str = Field(description="A phone number or email address for the contractor.")
    url: Optional[str] = Field(None, description="The contractor's website URL, if available.")

class ContractorOutput(BaseModel):
    recommended_contractors: List[Contractor]

class ContractorSearchAgent(BaseAgent):
    """An agent specialized in finding local contractors."""
    PROMPT_TEMPLATE = """
    You are a local business researcher. Your sole task is to find 2-3 reputable, local contractors for a specific renovation project.

    **Project Type:** {project_name}
    **Location:** {address}

    **Instructions:**
    1.  Use the 'google_search' tool to find contractors who specialize in the given project type in the specified location.
    2.  For each contractor, provide their name, specialty, and contact information.
    3.  Format the output as a single, valid JSON object that perfectly matches the `ContractorOutput` schema.

    **Example Search Query:**
    - "ADU construction contractors in Los Angeles CA"
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
