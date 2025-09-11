# backend/agent_service/agents/orchestrator.py
from __future__ import annotations

import asyncio
from typing import Any, Dict

from config.settings import settings

# LangChain LLMs
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

# Import your agents
from .text_agent import TextAnalysisAgent
from .financial_agent import FinancialAnalysisAgent
# If you have separate agents for comps/images, import them here
try:
    from .comp_agent import CompAnalysisAgent
except Exception:
    CompAnalysisAgent = None  # optional

try:
    from .image_agent import ImageAnalysisAgent
except Exception:
    ImageAnalysisAgent = None  # optional


class OrchestratorAgent:
    """
    Builds the LLM once (Gemini preferred), then orchestrates all analysis steps.
    """

    def __init__(self) -> None:
        # Decide which LLM to use based on env vars
        provider = settings.LLM_PROVIDER

        if provider == "gemini":
            # CRITICAL: pass the API key explicitly so it does NOT try ADC
            self.llm = ChatGoogleGenerativeAI(
                model=settings.GOOGLE_GEMINI_MODEL,
                google_api_key=settings.GOOGLE_API_KEY,
                temperature=0.2,
            )
            print(f"[Orchestrator] LLM = Gemini ({settings.GOOGLE_GEMINI_MODEL})")
        elif provider == "openai":
            self.llm = ChatOpenAI(
                model=settings.OPENAI_MODEL,
                api_key=settings.OPENAI_API_KEY,
                temperature=0.2,
            )
            print(f"[Orchestrator] LLM = OpenAI ({settings.OPENAI_MODEL})")
        else:
            raise RuntimeError(
                "No LLM credentials found. Set GEMINI_API_KEY/GOOGLE_API_KEY or OPENAI_API_KEY."
            )

        # Create sub-agents, passing the LLM where required
        # (Guard against agents that don’t accept llm in __init__)
        def _make(agent_cls):
            if agent_cls is None:
                return None
            try:
                return agent_cls(llm=self.llm)
            except TypeError:
                return agent_cls()

        self.text_agent = _make(TextAnalysisAgent)
        self.comp_agent = _make(CompAnalysisAgent) if CompAnalysisAgent else None
        self.image_agent = _make(ImageAnalysisAgent) if ImageAnalysisAgent else None
        self.financial_agent = FinancialAnalysisAgent()  # no LLM needed here

    async def generate_full_report(self, property_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Runs all agents in sequence and returns a dict the Flask app can render.
        Keep names generic so app.py doesn’t need to know classes.
        """
        print("[Orchestrator] Successfully validated incoming property data.")

        # 1) Text understanding / initial ideas
        print("[Orchestrator] Calling TextAnalysisAgent...")
        initial_ideas = await self.text_agent.process(property_payload)

        # 2) Comps (optional, depending on your implementation)
        comps = []
        if self.comp_agent:
            print("[Orchestrator] Calling CompAnalysisAgent...")
            comps = await self.comp_agent.process(property_payload)
            print(f"[Orchestrator] Found {len(comps)} comps.")

        # 3) Image analysis (optional)
        print("[Orchestrator] Calling ImageAnalysisAgent...")
        images_out = None
        if self.image_agent:
            images_out = await self.image_agent.process(
                property_payload, initial_ideas=initial_ideas
            )
        else:
            images_out = initial_ideas

        # 4) Financials — must NOT block on missing sqft/value anymore
        print("[Orchestrator] Calling FinancialAnalysisAgent...")
        fin = self.financial_agent.process(property_payload, comps or [])
        if not fin.get("subject_value"):
            # Don’t crash the whole report—leave a warning and keep going
            print("[Orchestrator] WARNING: Financials could not compute subject_value.")
            fin.setdefault("warnings", []).append(
                "Could not determine property value; please verify sqft/comp data."
            )

        # Assemble the final payload dict (app.py will normalize/serialize)
        return {
            "property_details": property_payload,
            "renovation_projects": images_out.get("renovation_projects") if isinstance(images_out, dict) else [],
            "comparable_properties": comps,
            "recommended_contractors": initial_ideas.get("recommended_contractors") if isinstance(initial_ideas, dict) else [],
            "market_summary": initial_ideas.get("market_summary") if isinstance(initial_ideas, dict) else "",
            "investment_thesis": initial_ideas.get("investment_thesis") if isinstance(initial_ideas, dict) else "",
            "financials": fin,
            "error": None,
        }
