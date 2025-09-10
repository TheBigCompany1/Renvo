# backend/agent_service/models/property_model.py
from __future__ import annotations

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict


# ---- History entry types -----------------------------------------------------

class PriceHistoryEntry(BaseModel):
    date: Optional[str] = None  # ISO string preferred, keep flexible
    price: Optional[Union[int, str]] = None
    event: Optional[str] = None  # e.g., "Sold", "Listed", etc.


class TaxHistoryEntry(BaseModel):
    year: Optional[int] = None
    taxAmount: Optional[Union[int, str]] = None
    assessment: Optional[Union[int, str]] = None


# ---- Core property payload ---------------------------------------------------

class PropertyDetails(BaseModel):
    """
    Canonical model for property details coming from the Node scraper.
    IMPORTANT:
      - We declare all known fields the scraper may send so Pydantic v2
        doesn't drop them.
      - We also allow extra fields to avoid future truncation.
    """
    # Primary facts
    address: Optional[str] = None
    price: Optional[Union[int, str]] = None           # on-market price (may be null/off-market)
    beds: Optional[Union[int, float]] = None
    baths: Optional[Union[int, float]] = None
    sqft: Optional[Union[int, str]] = None            # livable sqft
    yearBuilt: Optional[int] = None
    lotSize: Optional[Union[int, str]] = None
    homeType: Optional[str] = None
    description: Optional[str] = None

    # Images and source
    images: List[str] = Field(default_factory=list)
    source: Optional[str] = None                      # e.g., "redfin"
    url: Optional[str] = None
    timestamp: Optional[str] = None                   # ISO string from scraper

    # Estimates
    estimate: Optional[Union[int, str]] = None        # site estimate value (may be null)
    estimatePerSqft: Optional[Union[int, float, str]] = None

    # Nested/auxiliary details
    interiorFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    parkingFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    communityFeatures: Optional[Dict[str, Any]] = Field(default_factory=dict)
    constructionDetails: Optional[Dict[str, Any]] = Field(default_factory=dict)
    utilityDetails: Optional[Dict[str, Any]] = Field(default_factory=dict)
    additionalDetails: Optional[Dict[str, Any]] = Field(default_factory=dict)

    # Financial/timeline details
    hoaFee: Optional[Union[int, str]] = None
    propertyTax: Optional[Union[int, str]] = None
    daysOnMarket: Optional[int] = None

    # Agent/broker info
    listingAgent: Optional[str] = None
    listingBrokerage: Optional[str] = None

    # Histories
    priceHistory: List[PriceHistoryEntry] = Field(default_factory=list)
    taxHistory: List[TaxHistoryEntry] = Field(default_factory=list)

    # Pydantic v2 config: keep unknown fields rather than dropping them
    model_config = ConfigDict(
        extra="allow",
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
