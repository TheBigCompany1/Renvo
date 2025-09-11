# backend/agent_service/agents/orchestrator.py
from __future__ import annotations
import os
import json
from typing import Any, Dict, List

from models.property_model import PropertyDetails
from agents.text_agent import TextAnalysisAgent
from agents.comp_agent import CompAnalysisAgent
from agents.image_agent import ImageAnalysisAgent
from agents.financial_agent import FinancialAnalysisAgent

def _as_dict(obj: Any) -> Dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        fn = getattr(obj, attr, None)
        if callable(fn):
            try:
                return fn()
            except Exception:
                pass
    try:
        return json.loads(json.dumps(obj, default=lambda o: getattr(o, "__dict__", str(o))))
    except Exception:
        return {}

class OrchestratorAgent:
    """
    High-level pipeline coordinator. Normalizes incoming payload, then
    calls Text → Comps → Image → Financial. Always tries to return a
    FullReport-shaped dict even if some stages are missing.
    """

    def __init__(self) -> None:
        # Agents may use their own model configuration internally.
        # Keeping init lightweight to avoid env dependency failures.
        self.text_agent = TextAnalysisAgent()
        self.comp_agent = CompAnalysisAgent()
        self.image_agent = ImageAnalysisAgent()
        self.financial_agent = FinancialAnalysisAgent()

    # ---- Normalization ----
    def _normalize_payload(self, raw: Dict[str, Any]) -> PropertyDetails:
        src = raw.get("property_data") if isinstance(raw.get("property_data"), dict) else raw

        # Debug the raw keys and the specific sqft/epsf values we care about
        try:
            print(f"[Orchestrator] [DEBUG] Normalized payload keys: {sorted(list(src.keys()))}")
            print(f"[Orchestrator] [DEBUG] Normalized payload values → sqft={src.get('sqft')} estimatePerSqft={src.get('estimatePerSqft')}")
        except Exception:
            pass

        return PropertyDetails.from_raw(raw)

    # ---- Pipeline ----
    async def generate_full_report(self, property_payload: Dict[str, Any]) -> Dict[str, Any]:
        print("--- generate_full_report started ---")
        # 1) Normalize & validate
        prop = self._normalize_payload(property_payload)
        print("[Orchestrator] Successfully validated incoming property data.")

        # 2) Text ideas
        print("[Orchestrator] Calling TextAnalysisAgent...")
        try:
            initial_ideas = await self.text_agent.process(prop)
            print("[TextAgent] Process started.")
            print("[TextAgent] LLM structured call succeeded.")
        except Exception as e:
            print(f"[TextAgent] ERROR: {e}")
            initial_ideas = []

        # 3) Comps (try strict then expanded)
        comps: List[Dict[str, Any]] = []
        try:
            print("[Orchestrator] Calling CompAnalysisAgent...")
            comps = await self.comp_agent.process(prop, mode="strict")
            print(f"[CompAgent] Process started in 'strict' mode.")
            print(f"[CompAgent] Process finished in 'strict' mode with {len(comps)} comps.")
            if not comps:
                print("[Orchestrator] Comp search (strict) failed. Expanding search...")
                comps = await self.comp_agent.process(prop, mode="expanded")
                print(f"[CompAgent] Process started in 'expanded' mode.")
                print(f"[CompAgent] Process finished in 'expanded' mode with {len(comps)} comps.")
        except Exception as e:
            print(f"[CompAgent] ERROR: {e}")
            comps = []

        if comps:
            print(f"[Orchestrator] Found {len(comps)} comps.")
        else:
            print("[Orchestrator] Found 0 comps.")

        # 4) Image analysis
        print("[Orchestrator] Calling ImageAnalysisAgent...")
        try:
            image_ideas = await self.image_agent.process(prop, initial_ideas, images=prop.images or [])
            print("[ImageAgent] Process started.")
            if not (prop.images or []):
                print("[ImageAgent] No images provided. Passing through initial ideas without changes.")
        except Exception as e:
            print(f"[ImageAgent] ERROR: {e}")
            image_ideas = initial_ideas

        # 5) Financial analysis (robust; does not raise on missing data)
        print("[Orchestrator] Calling FinancialAnalysisAgent...")
        try:
            fin = await self.financial_agent.process(prop, comps, image_ideas)
            print("[FinancialAgent] Process started.")
            if fin.assumed_ppsf:
                print(f"[FinancialAgent] Using Avg/Est PPSF: ${fin.assumed_ppsf:,.2f}")
            if not fin.property_value:
                print("[FinancialAgent] ERROR: No property value. Skipping financial analysis.")
        except Exception as e:
            print(f"[FinancialAgent] ERROR: {e}")
            fin = None

        # ---- Assemble FullReport-shaped dict ----
        full: Dict[str, Any] = {
            "property_details": _as_dict(prop),
            "renovation_projects": _as_dict(fin).get("renovation_projects", []) if fin else [],
            "comparable_properties": comps,
            "recommended_contractors": [],  # (optional; your Contractor agent can populate later)
            "market_summary": "",
            "investment_thesis": (_as_dict(fin).get("rationale") if fin else "") or "",
        }

        # If we couldn't compute a value, still return a “complete” report with partial content.
        if fin and fin.property_value:
            full["property_value"] = fin.property_value
            if fin.assumed_ppsf:
                full["assumed_ppsf"] = fin.assumed_ppsf

        return full
