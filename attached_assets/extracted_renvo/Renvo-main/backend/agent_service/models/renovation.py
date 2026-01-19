from pydantic import BaseModel, Field
from typing import Dict, List, Optional

class RenovationOpportunity(BaseModel):
    """Model for a single renovation opportunity."""
    name: str
    estimatedCost: int = Field(..., alias="estimated_cost")
    estimatedValueAdd: int = Field(..., alias="estimated_value_add")
    estimatedRoi: float = Field(..., alias="estimated_roi")
    
    class Config:
        populate_by_name = True

class QuickInsights(BaseModel):
    """Model for quick insights returned to the Chrome extension."""
    potentialScore: float = Field(..., alias="potential_score")
    estimatedBudget: int = Field(..., alias="estimated_budget")
    potentialValueAdd: int = Field(..., alias="potential_value_add")
    topOpportunities: List[RenovationOpportunity] = Field(..., alias="top_opportunities")
    
    class Config:
        populate_by_name = True