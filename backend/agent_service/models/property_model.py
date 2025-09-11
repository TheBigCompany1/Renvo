# backend/agent_service/models/property_model.py
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
import re

_number = re.compile(r"[-+]?[0-9]*\.?[0-9]+")

def _parse_number(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        # strip commas and text like "5,600 sq ft"
        s = val.replace(",", " ")
        m = _number.findall(s)
        if not m:
            return None
        try:
            # Prefer the largest-looking token for sqft strings like "5,600 sq ft"
            nums = [float(x) for x in m]
            # choose the max as a heuristic for composite strings
            return max(nums)
        except Exception:
            return None
    return None

def _parse_int(val: Any) -> Optional[int]:
    f = _parse_number(val)
    return int(f) if f is not None else None

class PropertyDetails(BaseModel):
    address: Optional[str] = None
    price: Optional[float] = None
    estimate: Optional[float] = None
    estimatePerSqft: Optional[float] = Field(default=None, description="Estimated price per square foot")
    beds: Optional[float] = None
    baths: Optional[float] = None
    sqft: Optional[int] = Field(default=None, description="Livable square footage (NOT lot)")
    yearBuilt: Optional[int] = None
    lotSize: Optional[str] = None
    homeType: Optional[str] = None
    description: Optional[str] = None
    images: List[str] = Field(default_factory=list)
    source: Optional[str] = None
    url: Optional[str] = None

    @classmethod
    def from_raw(cls, raw: Dict[str, Any]) -> "PropertyDetails":
        """
        Accepts either the direct Node payload, or a dict with 'property_data'.
        Normalizes common synonyms and stringified numbers.
        """
        src = raw.get("property_data") if isinstance(raw.get("property_data"), dict) else raw

        sqft = (
            _parse_int(src.get("sqft"))
            or _parse_int(src.get("livingArea"))
            or _parse_int(src.get("living_sqft"))
            or _parse_int(src.get("size"))
        )

        epsf = (
            _parse_number(src.get("estimatePerSqft"))
            or _parse_number(src.get("pricePerSqft"))
            or _parse_number(src.get("ppsf"))
        )

        price = _parse_number(src.get("price"))
        estimate = _parse_number(src.get("estimate"))

        beds = _parse_number(src.get("beds"))
        baths = _parse_number(src.get("baths"))
        year_built = _parse_int(src.get("yearBuilt") or src.get("year_built"))
        address = src.get("address") or src.get("fullAddress")

        images = src.get("images") or src.get("imageUrls") or []
        if isinstance(images, str):
            images = [images]

        return cls(
            address=address,
            price=price,
            estimate=estimate,
            estimatePerSqft=epsf,
            beds=beds,
            baths=baths,
            sqft=sqft,
            yearBuilt=year_built,
            lotSize=src.get("lotSize") or src.get("lot_size"),
            homeType=src.get("homeType"),
            description=src.get("description"),
            images=images if isinstance(images, list) else [],
            source=src.get("source"),
            url=src.get("url"),
        )
