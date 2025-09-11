# backend/agent_service/models/property_model.py
from __future__ import annotations

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict


# ---------------- Price & Tax history entries ---------------- #

class PriceHistoryEntry(BaseModel):
    date: Optional[str] = None                 # ISO string preferred; keep flexible
    price: Optional[Union[int, str]] = None    # raw price; downstream will parse
    event: Optional[str] = None                # e.g., "Sold", "Listed"


class TaxHistoryEntry(BaseModel):
    year: Optional[int] = None
    taxAmount: Optional[Union[int, str]] = None
    assessment: Optional[Union[int, str]] = None


# ----------------------- Core payload ------------------------ #

class PropertyDetails(BaseModel):
    """
    Canonical model for property details coming from the Node scraper.
    IMPORTANT:
    - Declare known fields so Pydantic keeps them.
    - Allow extras so future scraper keys won't be dropped.
    """

    # Primary facts
    address: Optional[str] = None
    price: Optional[Union[int, str]] = None            # on-market price (may be null)
    beds: Optional[Union[int, float, str]] = None
    baths: Optional[Union[int, float, str]] = None
    sqft: Optional[Union[int, str]] = None             # livable sqft from scraper
    yearBuilt: Optional[int] = None
    lotSize: Optional[Union[int, str]] = None
    homeType: Optional[str] = None
    description: Optional[str] = None

    # Media & source
    images: List[str] = Field(default_factory=list)
    source: Optional[str] = None                       # e.g., "redfin"
    url: Optional[str] = None
    timestamp: Optional[str] = None                    # ISO string

    # Estimates
    estimate: Optional[Union[int, str]] = None
    estimatePerSqft: Optional[Union[int, float, str]] = None  # e.g., 1447 from Redfin

    # Nested/auxiliary maps
    interiorFeatures: Dict[str, Any] = Field(default_factory=dict)
    parkingFeatures: Dict[str, Any] = Field(default_factory=dict)
    communityFeatures: Dict[str, Any] = Field(default_factory=dict)
    constructionDetails: Dict[str, Any] = Field(default_factory=dict)
    utilityDetails: Dict[str, Any] = Field(default_factory=dict)
    additionalDetails: Dict[str, Any] = Field(default_factory=dict)

    # Financial/timeline
    hoaFee: Optional[Union[int, str]] = None
    propertyTax: Optional[Union[int, str]] = None
    daysOnMarket: Optional[int] = None

    # Agent/broker
    listingAgent: Optional[str] = None
    listingBrokerage: Optional[str] = None

    # Histories
    priceHistory: List[PriceHistoryEntry] = Field(default_factory=list)
    taxHistory: List[TaxHistoryEntry] = Field(default_factory=list)

    # Keep unknown fields instead of dropping them
    model_config = ConfigDict(
        extra="allow",              # <- critical: preserve fields like sqft, estimatePerSqft, etc.
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
