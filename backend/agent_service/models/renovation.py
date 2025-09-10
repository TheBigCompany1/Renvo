from pydantic import BaseModel, Field
from typing import Dict, List, Optional

# --- Models from your existing file (untouched to prevent regressions) ---

class RenovationOpportunity(BaseModel):
    """Model for a single renovation opportunity, likely for an external API."""
    name: str
    estimatedCost: int = Field(..., alias="estimated_cost")
    estimatedValueAdd: int = Field(..., alias="estimated_value_add")
    estimatedRoi: float = Field(..., alias="estimated_roi")
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True


class QuickInsights(BaseModel):
    """Model for quick insights, likely for an external API."""
    potentialScore: float = Field(..., alias="potential_score")
    estimatedBudget: int = Field(..., alias="estimated_budget")
    potentialValueAdd: int = Field(..., alias="potential_value_add")
    topOpportunities: List[RenovationOpportunity] = Field(..., alias="top_opportunities")
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True


# --- NEW Models required by the internal AI agent pipeline ---

class Cost(BaseModel):
    """Data model for estimated cost ranges."""
    low: int
    medium: int
    high: int

class ValueAdd(BaseModel):
    """Data model for estimated value-add ranges."""
    low: int
    medium: int
    high: int

class RenovationProject(BaseModel):
    """
    The definitive, final data model for a single, financially analyzed renovation project.
    This is the missing blueprint that the FullReport model depends on.
    """
    name: str
    description: str
    estimated_cost: Cost
    cost_source: Optional[str] = None
    estimated_value_add: ValueAdd
    roi: float
    feasibility: Optional[str] = None
    timeline: Optional[str] = None
    buyer_profile: Optional[str] = None
    roadmap_steps: List[str] = Field(default_factory=list)
    potential_risks: List[str] = Field(default_factory=list)
    after_repair_value: float
    adjusted_roi: float
    market_demand: Optional[str] = None
    local_trends: Optional[str] = None
    estimated_monthly_rent: Optional[int] = None
    new_total_sqft: int
    new_price_per_sqft: float

