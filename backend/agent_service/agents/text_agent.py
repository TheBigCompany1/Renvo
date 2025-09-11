# backend/agent_service/agents/text_agent.py
from typing import Any, Dict, List, Union
import json
import traceback

from agents.base import BaseAgent
from pydantic import BaseModel, Field
from langchain_google_genai import ChatGoogleGenerativeAI


# -------------------- Structured output schema -------------------- #

class Cost(BaseModel):
    low: int = Field(description="Low-end estimated cost in dollars.")
    medium: int = Field(description="Medium estimated cost in dollars.")
    high: int = Field(description="High-end estimated cost in dollars.")

class ValueAdd(BaseModel):
    low: int = Field(description="Low-end estimated value add in dollars.")
    medium: int = Field(description="Medium estimated value add in dollars.")
    high: int = Field(description="High-end estimated value add in dollars.")

class RenovationIdea(BaseModel):
    name: str
    description: str
    new_total_sqft: int = Field(description="New total livable square footage after completing this idea.")
    estimated_cost: Cost
    cost_source: str
    estimated_value_add: ValueAdd
    roi: float
    feasibility: str
    timeline: str
    buyer_profile: str
    roadmap_steps: List[str]
    potential_risks: List[str]

class RenovationIdeasOutput(BaseModel):
    renovation_ideas: List[RenovationIdea]


class TextAnalysisAgent(BaseAgent):
    """Generates initial renovation ideas with guaranteed JSON output."""

    PROMPT_TEMPLATE = """
You are an expert real estate developer and analyst. Review the subject property JSON:

{property_json}

Tasks:
1) Generate 3–5 large, transformative renovation ideas tailored to the subject (e.g., ADU, adding a level, duplex conversion).
2) For EACH idea, estimate the new_total_sqft (original sqft plus any additions; never the lot sqft).
3) Provide sourced local costs and a cost_source string (cite a realistic publication or index).
4) Provide an estimated_value_add band and compute roi = ((medium value add - medium cost) / medium cost) * 100.
5) Include feasibility, timeline, buyer_profile, 3–6 roadmap_steps, and 2–4 potential_risks.

Output ONLY a JSON object that matches this schema exactly:
{{
  "renovation_ideas": [
    {{
      "name": "...",
      "description": "...",
      "new_total_sqft": 0,
      "estimated_cost": {{ "low": 0, "medium": 0, "high": 0 }},
      "cost_source": "...",
      "estimated_value_add": {{ "low": 0, "medium": 0, "high": 0 }},
      "roi": 0,
      "feasibility": "...",
      "timeline": "...",
      "buyer_profile": "...",
      "roadmap_steps": ["..."],
      "potential_risks": ["..."]
    }}
  ]
}}
"""

    def __init__(self, llm: ChatGoogleGenerativeAI):
        super().__init__(llm)

    def _to_plain_dict(self, obj: Union[Dict[str, Any], BaseModel, Any]) -> Dict[str, Any]:
        """Convert Pydantic v2 models or plain dicts into a JSON-serializable dict."""
        if isinstance(obj, dict):
            return obj
        # Pydantic v2
        try:
            return obj.model_dump()
        except Exception:
            pass
        # Pydantic v1 or other object with .dict()
        try:
            return obj.dict()
        except Exception:
            pass
        # Fallback: best-effort via json round-trip for simple objects
        try:
            return json.loads(json.dumps(obj, default=lambda o: getattr(o, '__dict__', str(o))))
        except Exception:
            return {}

    async def process(self, property_data: Union[Dict[str, Any], BaseModel]) -> Dict[str, Any]:
        """Return a dict with key 'renovation_ideas'. Accepts dict or Pydantic model."""
        print("[TextAgent] Process started.")
        prop_dict = self._to_plain_dict(property_data)
        property_json = json.dumps(prop_dict, indent=2)

        prompt = self._create_prompt(self.PROMPT_TEMPLATE, property_json=property_json)

        try:
            structured_llm = self.llm.with_structured_output(RenovationIdeasOutput)
            result = await structured_llm.ainvoke(prompt)
            if not result:
                raise ValueError("LLM returned empty result")
            print("[TextAgent] LLM structured call succeeded.")
            return result.model_dump()
        except Exception as e:
            print(f"[TextAgent] LLM failed: {e}")
            print(traceback.format_exc())
            # Graceful fallback: return empty structure so pipeline can continue
            return {"renovation_ideas": []}
