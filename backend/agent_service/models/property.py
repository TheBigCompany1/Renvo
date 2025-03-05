# app/models/property.py
from pydantic import BaseModel, Field
from typing import List, Optional

class PropertyDetails(BaseModel):
    """Property data model for API requests."""
    url: Optional[str] = None
    address: str
    price: Optional[str] = None
    beds: Optional[int] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    yearBuilt: Optional[int] = Field(None, alias="year_built")
    lotSize: Optional[str] = Field(None, alias="lot_size")
    homeType: Optional[str] = Field(None, alias="property_type")
    images: List[str] = []
    
    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "url": "https://www.zillow.com/homes/123-main-st...",
                "address": "123 Main St, Anytown, USA",
                "price": "$450,000",
                "beds": 3,
                "baths": 2,
                "sqft": 1800,
                "yearBuilt": 1985,
                "lotSize": "0.25 acres",
                "homeType": "Single Family",
                "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]
            }
        }