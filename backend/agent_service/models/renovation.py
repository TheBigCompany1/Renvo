# backend/agent_service/models/renovation.py
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Back-compat model kept from your previous code
# -----------------------------------------------------------------------------
class RenovationOpportunity(BaseModel):
    """
    Lightweight opportunity object some older code paths referenced.
    Kept for backward compatibility; not used by the structured pipeline.
    """
    name: str
    # These used to be camelCase in some places; alias to snake_case for v2 style.
    estimatedCost: int = Field(..., alias="estimated_cost")
    estimatedValueAdd: int = Field(..., alias="estimated_value_add")
    estimatedRoi: float = Field(..., alias="estimated_roi")

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True


# -----------------------------------------------------------------------------
# Canonical cost/value-add blocks used by RenovationProject
# -----------------------------------------------------------------------------
class RenovationCost(BaseModel):
    """Tri-band cost estimate in dollars."""
    low: int = 0
    medium: int = 0
    high: int = 0


class RenovationValueAdd(BaseModel):
    """Tri-band value-add estimate in dollars."""
    low: int = 0
    medium: int = 0
    high: int = 0


# Aliases to cover previous type names used in annotations (e.g., ValueAdd/Cost)
Cost = RenovationCost
ValueAdd = RenovationValueAdd


# -----------------------------------------------------------------------------
# Main model validated downstream by the agents/orchestrator
# -----------------------------------------------------------------------------
class RenovationProject(BaseModel):
    # Core fields
    name: str
    description: str = ""

    # Structured estimates
    estimated_cost: RenovationCost
    estimated_value_add: RenovationValueAdd

    # Summary metrics
    roi: float = 0.0
    feasibility: Optional[str] = None               # e.g., "Easy", "Moderate", "Difficult"
    timeline: Optional[str] = None                  # e.g., "3–6 months"

    # Narrative / optional context
    buyer_profile: Optional[str] = None
    roadmap_steps: List[str] = Field(default_factory=list)
    potential_risks: List[str] = Field(default_factory=list)

    # Derived / downstream-calculated fields
    after_repair_value: float = 0.0                 # ARV
    adjusted_roi: float = 0.0
    market_demand: Optional[str] = None
    local_trends: Optional[str] = None
    estimated_monthly_rent: Optional[int] = None

    # For scenarios that model sqft changes or price-per-sqft outputs
    new_total_sqft: int = 0
    new_price_per_sqft: float = 0.0


# Optional: explicit export control
__all__ = [
    "RenovationOpportunity",
    "RenovationCost",
    "RenovationValueAdd",
    "Cost",
    "ValueAdd",
    "RenovationProject",
]
