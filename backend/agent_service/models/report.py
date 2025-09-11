from pydantic import BaseModel, Field, HttpUrl
from typing import List, Optional

# Import the foundational models from their correct locations
from .property_model import PropertyDetails
from .renovation import RenovationProject

# --- DEFINITIVE FIX: Define all dependent models in one place for simplicity ---

class ComparableProperty(BaseModel):
    """Data model for a single comparable property."""
    address: str
    url: Optional[HttpUrl] = None
    price: int
    beds: float
    baths: float
    sqft: int
    year_built: Optional[int] = None
    property_type: Optional[str] = None

class Contractor(BaseModel):
    """Data model for a single recommended contractor."""
    name: str
    specialty: str
    url: Optional[HttpUrl] = None
    phone: Optional[str] = None

class FullReport(BaseModel):
    """
    The final, validated data structure for a complete renovation report.
    This model ensures data integrity from the AI pipeline to the user-facing template.
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

