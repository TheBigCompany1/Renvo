from pydantic import BaseModel, Field
from typing import List, Optional
from .property_model import PropertyDetails
from .renovation import RenovationProject
from .comp import ComparableProperty
from .contractor import Contractor

class FullReport(BaseModel):
    """
    The final, validated data structure for a complete renovation report.
    This model ensures data integrity from the AI pipeline all the way to the user-facing template.
    """
    property_details: PropertyDetails
    renovation_projects: List[RenovationProject] = Field(default_factory=list)
    comparable_properties: List[ComparableProperty] = Field(default_factory=list)
    recommended_contractors: List[Contractor] = Field(default_factory=list)
    market_summary: str = ""
    investment_thesis: str = ""
    error: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True

