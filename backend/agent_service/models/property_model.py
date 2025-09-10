# backend/agent_service/models/property.py
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict, Any, Union

# Define structures for history entries
class PriceHistoryEntry(BaseModel):
    date: Optional[str] = None # Keep date flexible (YYYY-MM-DD or other formats)
    price: Optional[int] = None
    event: Optional[str] = None

class TaxHistoryEntry(BaseModel):
    year: Optional[int] = None
    taxAmount: Optional[int] = None
    assessment: Optional[int] = None

class PropertyDetails(BaseModel):
    """Data model for the core property details. Renamed from Property to PropertyDetails."""
    # --- Existing & Previously Added Fields ---
    address: Optional[str] = None
    price: Optional[Union[int, str]] = None # Allow int or formatted string
    beds: Optional[float] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    yearBuilt: Optional[int] = None
    lotSize: Optional[str] = None
    homeType: Optional[str] = None
    description: Optional[str] = None
    hoaFee: Optional[str] = None
    propertyTax: Optional[Union[int, str]] = None # Latest tax amount (allow int or formatted string)
    images: List[HttpUrl] = Field(default_factory=list)
    source: Optional[str] = None
    url: Optional[HttpUrl] = None
    timestamp: Optional[str] = None
    error: Optional[str] = None
    estimate: Optional[int] = None
    estimatePerSqft: Optional[int] = None
    interiorFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    parkingFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    communityFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    additionalDetails: Optional[Dict[str, Any]] = Field(default_factory=dict) # Keep this catch-all

    # --- NEW FIELDS ---
    priceHistory: List[PriceHistoryEntry] = Field(default_factory=list)
    taxHistory: List[TaxHistoryEntry] = Field(default_factory=list)
    daysOnMarket: Optional[int] = None
    constructionDetails: Optional[Dict[str, Any]] = Field(default_factory=dict) # Roof, Foundation, Materials, Exterior
    utilityDetails: Optional[Dict[str, Any]] = Field(default_factory=dict) # Water, Sewer
    listingAgent: Optional[str] = None
    listingBrokerage: Optional[str] = None

    class Config:
        pass # Keep previous config settings if any