# backend/agent_service/agents/financial_agent.py
import json
import re
from typing import Any, Dict, List, Optional, Union
from datetime import datetime, timedelta, timezone

from .base import BaseAgent
from models.property_model import PropertyDetails
from models.renovation import RenovationProject, RenovationCost, RenovationValueAdd


# ------------------------ parsing helpers ------------------------ #

def safe_parse_int(value: Any) -> int:
    """Parse ints from numbers/strings like '1,234' or '$1,234'."""
    if value is None:
        return 0
    try:
        cleaned = re.sub(r"[^\d\-]", "", str(value))
        return int(cleaned) if cleaned else 0
    except (ValueError, TypeError):
        return 0

def safe_parse_float(value: Any) -> float:
    """Parse floats from numbers/strings like '1,447.75' or '1,447'."""
    if value is None:
        return 0.0
    try:
        cleaned = re.sub(r"[^\d\.\-]", "", str(value))
        return float(cleaned) if cleaned not in ("", ".", "-", "-.") else 0.0
    except (ValueError, TypeError):
        return 0.0

def _as_dict(obj: Any) -> Dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    for attr in ("model_dump", "dict"):
        try:
            return getattr(obj, attr)()
        except Exception:
            pass
    try:
        return json.loads(json.dumps(obj, default=lambda o: getattr(o, "__dict__", str(o))))
    except Exception:
        return {}

def get_field(obj: Union[Dict[str, Any], Any], *names: str) -> Any:
    """
    Robustly fetch a field from either a dict or a Pydantic model
    trying multiple candidate names (synonyms).
    """
    # direct attribute checks
    for n in names:
        try:
            v = getattr(obj, n)
            if v is not None:
                return v
        except Exception:
            pass
    # dict-based checks
    data = obj if isinstance(obj, dict) else _as_dict(obj)
    for n in names:
        if n in data and data[n] is not None:
            return data[n]
    return None


class FinancialAnalysisAgent(BaseAgent):
    """Agent for performing financial analysis on renovation ideas."""

    PROMPT_TEMPLATE = """
Analyze the financial viability of these renovation ideas for a property valued at ${property_value:,.2f}.
The property's current estimated value is ${current_estimate:,.2f} and the price per square foot is ${price_per_sqft:,.2f}.

Renovation Ideas (JSON list):
{renovation_json}

Your tasks:
1) For each idea, provide a detailed cost breakdown (low, medium, high) as integers.
2) Estimate the value add for each (low, medium, high) as integers.
3) Calculate the ROI for the medium estimates as a percent (0-100, can be float).
4) Provide a feasibility score (Easy, Moderate, Difficult) and an estimated timeline string.

Return ONLY a JSON array, no commentary. Each item must include:
- name (str)
- description (str)
- estimated_cost {{ "low": int, "medium": int, "high": int }}
- estimated_value_add {{ "low": int, "medium": int, "high": int }}
- roi (float or int)
- feasibility (str)
- timeline (str)
"""

    # --------------------------- pricing waterfall --------------------------- #
    def _recent_sale_within_year(self, property_data: PropertyDetails) -> int:
        """Return most-recent SOLD price within 365 days, else 0."""
        try:
            events = get_field(property_data, "priceHistory") or []
            latest_sale_price = 0
            latest_sale_date: Optional[datetime] = None
            for ev in events:
                ev = _as_dict(ev)
                if (ev.get("event") or "").lower() != "sold":
                    continue
                ev_date_raw = ev.get("date")
                if not ev_date_raw:
                    continue
                try:
                    ev_date = datetime.fromisoformat(str(ev_date_raw).replace("Z", "+00:00"))
                except Exception:
                    try:
                        ev_date = datetime.strptime(str(ev_date_raw)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except Exception:
                        continue
                if latest_sale_date is None or ev_date > latest_sale_date:
                    latest_sale_date = ev_date
                    latest_sale_price = safe_parse_int(ev.get("price"))
            if latest_sale_date and latest_sale_date > datetime.now(timezone.utc) - timedelta(days=365):
                if latest_sale_price > 0:
                    print(f"[FinancialAgent] Using Recent Sale Price (<=365d): ${latest_sale_price:,}")
                    return latest_sale_price
        except Exception as e:
            print(f"[FinancialAgent] priceHistory evaluation warning: {e}")
        return 0

    def _avg_ppsf_from_comps(self, comps: List[Dict[str, Any]]) -> float:
        """
        Average price_per_sqft from comps.
        If missing, derive PPSF as price/sqft when both present.
        """
        ppsf_vals: List[float] = []
        for c in comps or []:
            item = c if isinstance(c, dict) else _as_dict(c)

            # direct PPSF
            v = item.get("price_per_sqft") or item.get("ppsf") or item.get("pricePerSqft")
            p = safe_parse_float(v)
            if p > 0:
                ppsf_vals.append(p)
                continue

            # derive PPSF from price and sqft if available
            price = safe_parse_float(item.get("sale_price") or item.get("price") or item.get("list_price"))
            sqft = safe_parse_int(item.get("sqft") or item.get("livingArea") or item.get("livableSqft"))
            if price > 0 and sqft > 0:
                ppsf_vals.append(price / float(sqft))

        if ppsf_vals:
            avg_ppsf = sum(ppsf_vals) / len(ppsf_vals)
            print(f"[FinancialAgent] Using Avg PPSF from comps: ${avg_ppsf:,.2f}")
            return avg_ppsf
        return 0.0

    def _determine_property_value(
        self, property_data: PropertyDetails, comps: List[Dict[str, Any]]
    ) -> int:
        """
        Waterfall to determine subject property value (off-market safe):

        1) List Price (property_data.price)
        2) Last SOLD within the last 365 days (priceHistory)
        3) Redfin estimate (property_data.estimate)
        4) Avg PPSF from comps × subject livable sqft
        5) Fallback: estimatePerSqft (or pricePerSqft) × subject sqft
        6) Else 0
        """
        # 1) List price
        list_price = safe_parse_int(get_field(property_data, "price"))
        if list_price > 0:
            print(f"[FinancialAgent] Using List Price: ${list_price:,}")
            return list_price

        # 2) Recent sale within a year
        recent_sale = self._recent_sale_within_year(property_data)
        if recent_sale > 0:
            return recent_sale

        # 3) Redfin estimate
        redfin_estimate = safe_parse_int(get_field(property_data, "estimate"))
        if redfin_estimate > 0:
            print(f"[FinancialAgent] Using Redfin Estimate: ${redfin_estimate:,}")
            return redfin_estimate

        # Subject sqft and PPSF (with synonyms)
        subject_sqft = safe_parse_int(
            get_field(
                property_data,
                "sqft", "livingArea", "livableSqft", "interiorSqft", "totalLivableArea", "floorArea",
            )
        )

        # 4) Avg PPSF from comps × subject sqft
        avg_ppsf = self._avg_ppsf_from_comps(comps)
        if subject_sqft > 0 and avg_ppsf > 0:
            derived = int(round(subject_sqft * avg_ppsf))
            print(f"[FinancialAgent] Using Comps PPSF × Sqft: {subject_sqft} × ${avg_ppsf:,.2f} = ${derived:,}")
            return derived

        # 5) Fallback PPSF from property: estimatePerSqft / pricePerSqft / estPpsf × sqft
        ppsf_fallback = safe_parse_float(get_field(property_data, "estimatePerSqft", "pricePerSqft", "estPpsf"))
        if subject_sqft > 0 and ppsf_fallback > 0:
            derived = int(round(subject_sqft * ppsf_fallback))
            print(f"[FinancialAgent] Using fallback PPSF × Sqft: {subject_sqft} × ${ppsf_fallback:,.2f} = ${derived:,}")
            return derived

        print(f"[FinancialAgent] DEBUG: subject_sqft={subject_sqft}, avg_ppsf={avg_ppsf}, ppsf_fallback={ppsf_fallback}")
        print("[FinancialAgent] ERROR: Could not determine a valid property value.")
        return 0
    # ------------------------- end pricing waterfall ------------------------ #

    def _extract_json_list(self, text: str) -> List[Dict[str, Any]]:
        """Extract a JSON array/object from LLM text. Always returns a list."""
        if not text:
            return []
        m = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        candidate = m.group(1) if m else None
        if not candidate:
            start = None
            for ch in ("[", "{"):
                idx = text.find(ch)
                if idx != -1:
                    start = idx if start is None else min(start, idx)
            if start is not None:
                tail = text[start:]
                end_idx = max(tail.rfind("]"), tail.rfind("}"))
                if end_idx != -1:
                    candidate = tail[: end_idx + 1]
        if not candidate:
            return []
        try:
            data = json.loads(candidate)
        except Exception:
            candidate2 = re.sub(r",\s*([\]\}])", r"\1", candidate)
            data = json.loads(candidate2)
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return data
        return []

    def _normalize_item(
        self,
        item: Dict[str, Any],
        property_value: int,
        sqft: Optional[int],
    ) -> Dict[str, Any]:
        """Normalize one raw item into fields expected by RenovationProject."""
        name = str(item.get("name") or "Renovation")
        description = str(item.get("description") or "")

        cost_raw = item.get("estimated_cost") or item.get("estimatedCost") or {}
        value_raw = item.get("estimated_value_add") or item.get("estimatedValueAdd") or {}

        cost = RenovationCost(
            low=safe_parse_int(cost_raw.get("low")),
            medium=safe_parse_int(cost_raw.get("medium")),
            high=safe_parse_int(cost_raw.get("high")),
        )
        value_add = RenovationValueAdd(
            low=safe_parse_int(value_raw.get("low")),
            medium=safe_parse_int(value_raw.get("medium")),
            high=safe_parse_int(value_raw.get("high")),
        )

        roi_medium = item.get("roi")
        try:
            roi = float(roi_medium)
        except Exception:
            roi = 0.0
            if cost.medium > 0:
                roi = max(0.0, round((value_add.medium - cost.medium) / float(cost.medium) * 100.0, 2))

        feasibility = item.get("feasibility") or None
        timeline = item.get("timeline") or None

        arv = float(max(0, property_value) + value_add.medium)
        new_total_sqft = int(sqft or 0)
        new_price_per_sqft = float((arv / new_total_sqft) if new_total_sqft > 0 else 0.0)

        return {
            "name": name,
            "description": description,
            "estimated_cost": cost,
            "estimated_value_add": value_add,
            "roi": float(roi),
            "feasibility": feasibility,
            "timeline": timeline,
            "buyer_profile": item.get("buyer_profile"),
            "roadmap_steps": item.get("roadmap_steps") or [],
            "potential_risks": item.get("potential_risks") or [],
            "after_repair_value": arv,
            "adjusted_roi": roi,
            "market_demand": item.get("market_demand"),
            "local_trends": item.get("local_trends"),
            "estimated_monthly_rent": safe_parse_int(item.get("estimated_monthly_rent")),
            "new_total_sqft": new_total_sqft,
            "new_price_per_sqft": new_price_per_sqft,
        }

    async def process(
        self,
        property_data: PropertyDetails,
        renovation_ideas: List[Dict[str, Any]],
        comps: List[Dict[str, Any]],
    ) -> List[RenovationProject]:
        """Analyze renovation ideas and return validated RenovationProject objects."""
        print("[FinancialAgent] Process started.")
        property_value = self._determine_property_value(property_data, comps)
        if property_value <= 0:
            print("[FinancialAgent] ERROR: No property value. Skipping financial analysis.")
            return []

        # Normalize ideas to dicts
        ideas_dicts: List[Dict[str, Any]] = []
        for idea in renovation_ideas or []:
            if isinstance(idea, dict):
                ideas_dicts.append(idea)
            else:
                for getter in ("model_dump", "dict"):
                    try:
                        ideas_dicts.append(getattr(idea, getter)())
                        break
                    except Exception:
                        pass

        renovation_json = json.dumps(ideas_dicts, indent=2)
        prompt = self.PROMPT_TEMPLATE.format(
            property_value=property_value,
            current_estimate=safe_parse_int(get_field(property_data, "estimate")),
            price_per_sqft=safe_parse_float(get_field(property_data, "estimatePerSqft", "pricePerSqft", "estPpsf")),
            renovation_json=renovation_json,
        )

        # Invoke LLM
        try:
            ai_msg = await self.llm.ainvoke(prompt)
            response_text = getattr(ai_msg, "content", "") or ""
        except Exception as e:
            print(f"[FinancialAgent] LLM invocation failed: {e}")
            response_text = ""

        raw_items = self._extract_json_list(response_text)
        sqft = safe_parse_int(
            get_field(property_data, "sqft", "livingArea", "livableSqft", "interiorSqft", "totalLivableArea", "floorArea")
        )

        projects: List[RenovationProject] = []
        for item in raw_items:
            try:
                data = self._normalize_item(item, property_value=property_value, sqft=sqft)
                projects.append(RenovationProject(**data))
            except Exception as e:
                print(f"[FinancialAgent] Skipping item due to validation error: {e}")

        print(f"[FinancialAgent] Process finished. {len(projects)} project(s) produced.")
        return projects
