# backend/agent_service/agents/financial_agent.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel
from models.property_model import PropertyDetails

def _num(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).replace(",", "")
        return float(s)
    except Exception:
        return None

def _avg_ppsf_from_comps(comps: List[Dict[str, Any]]) -> Optional[float]:
    ppsf_vals: List[float] = []
    for c in comps or []:
        # Accept either 'price_per_sqft' or compute from price & sqft
        ppsf = _num(c.get("price_per_sqft") or c.get("ppsf"))
        price = _num(c.get("price") or c.get("sale_price"))
        sqft = _num(c.get("sqft") or c.get("livingArea") or c.get("living_sqft"))
        if ppsf is None and price and sqft and sqft > 0:
            ppsf = price / sqft
        if ppsf and ppsf > 0:
            ppsf_vals.append(ppsf)
    if not ppsf_vals:
        return None
    return sum(ppsf_vals) / len(ppsf_vals)

class RenovationValueAdd(BaseModel):
    low: Optional[float] = None
    high: Optional[float] = None

class RenovationCost(BaseModel):
    low: Optional[float] = None
    high: Optional[float] = None

class RenovationProject(BaseModel):
    name: str
    description: Optional[str] = None
    estimated_cost: RenovationCost = RenovationCost()
    estimated_value_add: RenovationValueAdd = RenovationValueAdd()
    priority: Optional[str] = None

class FinancialAnalysisOutput(BaseModel):
    property_value: Optional[float] = None
    assumed_ppsf: Optional[float] = None
    rationale: str = ""
    renovation_projects: List[RenovationProject] = []

class FinancialAnalysisAgent:
    """
    Computes a property value using the following hierarchy:

    1) price (if present)
    2) estimate (if present)
    3) sqft * estimatePerSqft (if both present)
    4) sqft * avg_ppsf_from_comps (if comps present and sqft present)

    If nothing is available, returns no ideas but does NOT raise.
    """

    async def process(
        self,
        property_details: PropertyDetails,
        comps: List[Dict[str, Any]],
        initial_ideas: List[Dict[str, Any]],
    ) -> FinancialAnalysisOutput:
        pd = property_details.model_dump() if hasattr(property_details, "model_dump") else dict(property_details)
        subject_sqft = _num(pd.get("sqft")) or 0
        epsf = _num(pd.get("estimatePerSqft"))
        price = _num(pd.get("price"))
        estimate = _num(pd.get("estimate"))

        avg_ppsf = _avg_ppsf_from_comps(comps)
        assumed_ppsf = None
        value = None
        rationale_lines = []

        if price and price > 0:
            value = price
            rationale_lines.append("Used current list price.")
        elif estimate and estimate > 0:
            value = estimate
            rationale_lines.append("Used property estimate.")
        elif subject_sqft and subject_sqft > 0 and epsf and epsf > 0:
            value = subject_sqft * epsf
            assumed_ppsf = epsf
            rationale_lines.append("Used subject sqft × estimatePerSqft.")
        elif subject_sqft and subject_sqft > 0 and avg_ppsf and avg_ppsf > 0:
            value = subject_sqft * avg_ppsf
            assumed_ppsf = avg_ppsf
            rationale_lines.append("Used subject sqft × avg PPSF from comps.")
        else:
            rationale_lines.append(
                "Insufficient data to compute property value (missing price, estimate, and PPSF/sqft combination)."
            )

        print(
            f"[FinancialAgent] DEBUG: subject_sqft={subject_sqft} "
            f"estimatePerSqft={epsf} avg_ppsf={avg_ppsf} → property_value={value}"
        )

        projects: List[RenovationProject] = []
        if value and value > 0:
            # Keep it simple: create modest placeholder projects based on value bands.
            # (Your Text/Image agents can refine/augment later.)
            budget = max(15000.0, min(value * 0.05, 100000.0))
            projects = [
                RenovationProject(
                    name="Kitchen refresh",
                    description="Update countertops, repaint cabinets, modern fixtures.",
                    estimated_cost=RenovationCost(low=budget * 0.4, high=budget * 0.6),
                    estimated_value_add=RenovationValueAdd(low=budget * 0.6, high=budget),
                    priority="high",
                ),
                RenovationProject(
                    name="Bathroom improvements",
                    description="New vanity, tile regrout, lighting, and hardware.",
                    estimated_cost=RenovationCost(low=budget * 0.2, high=budget * 0.35),
                    estimated_value_add=RenovationValueAdd(low=budget * 0.3, high=budget * 0.6),
                    priority="medium",
                ),
                RenovationProject(
                    name="Curb appeal & paint",
                    description="Exterior paint touch-ups, landscaping, and staging polish.",
                    estimated_cost=RenovationCost(low=budget * 0.1, high=budget * 0.2),
                    estimated_value_add=RenovationValueAdd(low=budget * 0.2, high=budget * 0.4),
                    priority="medium",
                ),
            ]

        return FinancialAnalysisOutput(
            property_value=value,
            assumed_ppsf=assumed_ppsf,
            rationale=" ".join(rationale_lines),
            renovation_projects=projects,
        )
