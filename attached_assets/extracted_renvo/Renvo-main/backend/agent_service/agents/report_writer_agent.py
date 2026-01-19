# backend/agent_service/agents/report_writer_agent.py
from typing import Dict, Any, List
from .base import BaseAgent
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
import json

class ReportTextOutput(BaseModel):
    investment_thesis: str = Field(description="A concise, one-paragraph investment thesis for the top renovation opportunity. It should be written in a professional, engaging tone.")
    market_summary: str = Field(description="A brief, one-paragraph summary of the local real estate market based on the provided data.")

class ReportWriterAgent(BaseAgent):
    """An agent specialized in writing the final report summaries."""
    PROMPT_TEMPLATE = """
    You are a professional real estate writer. You will be given a complete set of structured data about a property analysis. Your sole task is to write the final human-readable summaries.

    **FULL ANALYSIS DATA:**
    {full_data_json}

    **Instructions:**
    1.  Review all the provided data.
    2.  Write a concise, one-paragraph `investment_thesis` for the top renovation opportunity (the first one in the list).
    3.  Write a brief, one-paragraph `market_summary` based on the comparable properties and local trends.
    4.  Format the output as a single, valid JSON object that perfectly matches the `ReportTextOutput` schema. Do NOT use any tools.
    """

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)
        self.structured_llm = self.llm.with_structured_output(ReportTextOutput)

    async def process(self, full_analysis_data: Dict[str, Any]) -> Dict[str, Any]:
        """Writes the final report summaries."""
        print("[ReportWriterAgent] Process started.")
        prompt = self._create_prompt(
            self.PROMPT_TEMPLATE,
            full_data_json=json.dumps(full_analysis_data, indent=2)
        )
        response = await self.structured_llm.ainvoke(prompt)
        print("[ReportWriterAgent] Process finished.")
        return response.dict()
