from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
from .property_model import PropertyDetails
from .renovation import RenovationProject, QuickInsights
from .comp import ComparableProperty
from .contractor import Contractor

class FullReport(BaseModel):
    """
    The final, validated data structure for a complete renovation report.
    This model combines all necessary fields for status tracking and detailed reporting,
    ensuring data integrity from the AI pipeline to the user.
    """
    # Core Report Data
    property_details: PropertyDetails
    renovation_projects: List[RenovationProject] = Field(default_factory=list)
    comparable_properties: List[ComparableProperty] = Field(default_factory=list)
    recommended_contractors: List[Contractor] = Field(default_factory=list)
    market_summary: str = ""
    investment_thesis: str = ""
    
    # Status and Metadata
    report_id: Optional[str] = None
    status: str = "completed"  # processing, completed, failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Quick Insights & Error Handling
    quick_insights: Optional[QuickInsights] = None
    error: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True

