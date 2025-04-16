from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from models.property import PropertyDetails
from models.renovation import QuickInsights, RenovationOpportunity
from datetime import datetime

class DetailedRenovationIdea(BaseModel):
    """Model for a detailed renovation idea."""
    name: str
    description: str
    estimated_cost: Dict[str, float]
    estimated_value_add: Dict[str, float]
    adjusted_roi: float
    feasibility: str
    timeline: str
    market_demand: Optional[str] = None
    local_trends: Optional[str] = None
    image_insights: Optional[str] = None
    buyer_profile: Optional[str] = None

class DetailedReport(BaseModel):
    """Model for a complete renovation report."""
    property: PropertyDetails
    renovation_ideas: List[DetailedRenovationIdea]
    additional_suggestions: Optional[List[Dict[str, Any]]] = None
    market_summary: Optional[str] = None
    total_budget: Dict[str, float]
    potential_value_increase: Dict[str, float]
    average_roi: float

class ReportStatus(BaseModel):
    """Model for tracking report status."""
    report_id: str
    status: str = "processing"  # processing, completed, failed
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    property: PropertyDetails
    quick_insights: Optional[QuickInsights] = None
    detailed_report: Optional[DetailedReport] = None
    error: Optional[str] = None
    
class ReportStatus(BaseModel):
    """Model for tracking report status."""
    report_id: str
    status: str = "processing"  # processing, completed, failed
    progress: Optional[str] = None  # To track processing stage
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    property: PropertyDetails
    quick_insights: Optional[QuickInsights] = None
    detailed_report: Optional[DetailedReport] = None
    error: Optional[str] = None