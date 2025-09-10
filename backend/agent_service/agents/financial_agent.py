# backend/agent_service/agents/financial_agent.py
import json
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone

from .base import BaseAgent
from models.property_model import PropertyDetails
from models.renovation import RenovationProject, RenovationCost, RenovationValueAdd

def safe_parse_int(value: Any) -> int:
    """Best-effort parse of ints that may be strings like '$1,234' or None."""
    if value is None:
        return 0
    try:
        cleaned = re.sub(r"[^\d\-]", "", str(value))
        return int(cleaned) if cleaned else 0
    except (ValueError, TypeError):
        return 0

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

    def _determine_property_value(
        self, property_data: PropertyDetails, comps: List[Dict[str, Any]]
    ) -> int:
        """
        Waterfall to determine subject property value:
        1) List Price (property_data.price)
        2) Recent Sale (within ~365 days) from priceHistory if present
        3) Redfin estimate (property_data.estimate)
        4) Average of comparable sale/list prices if available
        """
        # 1) List price
        list_price = safe_parse_int(getattr(property_data, "price", None))
        if list_price > 0:
            print(f"[FinancialAgent] Using List Price: ${list_price:,}")
            return list_price

        # 2) Recent sale price
        try:
            events = getattr(property_data, "priceHistory", None) or []
            latest_sale_price = 0
            latest_sale_date: Optional[datetime] = None
            for ev in events:
                ev_event = (ev or {}).get("event", "") or ""
                if ev_event.lower() != "sold":
                    continue
                ev_date_raw = (ev or {}).get("date")
                if not ev_date_raw:
                    continue
                try:
                    # Normalize date to timezone-aware
                    ev_date = datetime.fromisoformat(str(ev_date_raw).replace("Z", "+00:00"))
                except Exception:
                    # Fallback: attempt loose parsing (YYYY-MM-DD)
                    try:
                        ev_date = datetime.strptime(str(ev_date_raw)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
                    except Exception:
                        continue
                if latest_sale_date is None or ev_date > latest_sale_date:
                    latest_sale_date = ev_date
                    latest_sale_price = safe_parse_int((ev or {}).get("price"))
            if latest_sale_date and latest_sale_date > datetime.now(timezone.utc) - timedelta(days=365):
                if latest_sale_price > 0:
                    print(f"[FinancialAgent] Using Recent Sale Price: ${latest_sale_price:,}")
                    return latest_sale_price
        except Exception as e:
            print(f"[FinancialAgent] priceHistory evaluation warning: {e}")

        # 3) Redfin estimate
        redfin_estimate = safe_parse_int(getattr(property_data, "estimate", None))
        if redfin_estimate > 0:
            print(f"[FinancialAgent] Using Redfin Estimate: ${redfin_estimate:,}")
            return redfin_estimate

        # 4) Average of comps (sale_price or price)
        comp_prices: List[int] = []
        for c in comps or []:
            if isinstance(c, dict):
                iterable = [c]
            else:
                # try to convert pydantic or other object to dict
                try:
                    iterable = [c.model_dump()]
                except Exception:
                    continue
            for item in iterable:
                for key in ("sale_price", "price", "list_price"):
                    v = safe_parse_int((item or {}).get(key))
                    if v > 0:
                        comp_prices.append(v)
                        break
        if comp_prices:
            avg = int(sum(comp_prices) / len(comp_prices))
            print(f"[FinancialAgent] Using Average of Comps: ${avg:,}")
            return avg

        print("[FinancialAgent] ERROR: Could not determine a valid property value.")
        return 0

    def _extract_json_list(self, text: str) -> List[Dict[str, Any]]:
        """
        Extract a JSON array from LLM text. Supports fenced blocks or raw arrays/objects.
        Always returns a list (wraps single objects).
        """
        if not text:
            return []

        # 1) fenced ```json ... ```
        m = re.search(r"```(?:json)?\s*(\[.*?\]|\{.*?\})\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        candidate = m.group(1) if m else None

        # 2) first JSON-looking region
        if not candidate:
            start = None
            for ch in ("[", "{"):
                idx = text.find(ch)
                if idx != -1:
                    start = idx if start is None else min(start, idx)
            if start is not None:
                # try to capture until last matching bracket/brace
                tail = text[start:]
                # crude trim to last closing bracket/brace
                end_idx = max(tail.rfind("]"), tail.rfind("}"))
                if end_idx != -1:
                    candidate = tail[: end_idx + 1]

        if not candidate:
            return []

        try:
            data = json.loads(candidate)
        except Exception:
            # attempt to remove trailing commas
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

        # Accept both snake_case and camelCase for cost/value_add
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
            # compute if missing
            roi = 0.0
            if cost.medium > 0:
                roi = max(0.0, round((value_add.medium - cost.medium) / float(cost.medium) * 100.0, 2))

        feasibility = item.get("feasibility") or None
        timeline = item.get("timeline") or None

        # Derived fields expected by RenovationProject
        arv = float(max(0, property_value) + value_add.medium)
        adjusted_roi = roi  # keep simple
        new_total_sqft = int(sqft or 0)
        new_price_per_sqft = float((arv / new_total_sqft) if new_total_sqft > 0 else 0.0)

        normalized: Dict[str, Any] = {
            "name": name,
            "description": description,
            "estimated_cost": cost,
            "estimated_value_add": value_add,
            "roi": float(roi),
            "feasibility": feasibility,
            "timeline": timeline,
            # Optional extras with defaults
            "buyer_profile": item.get("buyer_profile"),
            "roadmap_steps": item.get("roadmap_steps") or [],
            "potential_risks": item.get("potential_risks") or [],
            "after_repair_value": arv,
            "adjusted_roi": adjusted_roi,
            "market_demand": item.get("market_demand"),
            "local_trends": item.get("local_trends"),
            "estimated_monthly_rent": safe_parse_int(item.get("estimated_monthly_rent")),
            "new_total_sqft": new_total_sqft,
            "new_price_per_sqft": new_price_per_sqft,
        }
        return normalized

    async def process(
        self,
        property_data: PropertyDetails,
        renovation_ideas: List[Dict[str, Any]],
        comps: List[Dict[str, Any]],
    ) -> List[RenovationProject]:
        """
        Analyze renovation ideas and return validated RenovationProject objects.
        """
        print("[FinancialAgent] Process started.")
        property_value = self._determine_property_value(property_data, comps)
        if property_value <= 0:
            print("[FinancialAgent] ERROR: No property value. Skipping financial analysis.")
            return []

        # ensure list of dicts
        ideas_dicts: List[Dict[str, Any]] = []
        for idea in renovation_ideas or []:
            if isinstance(idea, dict):
                ideas_dicts.append(idea)
            else:
                try:
                    ideas_dicts.append(idea.model_dump())
                except Exception:
                    try:
                        ideas_dicts.append(idea.dict())
                    except Exception:
                        pass

        renovation_json = json.dumps(ideas_dicts, indent=2)
        prompt = self.PROMPT_TEMPLATE.format(
            property_value=property_value,
            current_estimate=safe_parse_int(getattr(property_data, "estimate", None)),
            price_per_sqft=safe_parse_int(getattr(property_data, "estimatePerSqft", None)),
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
        sqft = getattr(property_data, "sqft", None)

        projects: List[RenovationProject] = []
        for item in raw_items:
            try:
                data = self._normalize_item(item, property_value=property_value, sqft=sqft)
                projects.append(RenovationProject(**data))
            except Exception as e:
                print(f"[FinancialAgent] Skipping item due to validation error: {e}")

        print(f"[FinancialAgent] Process finished. {len(projects)} project(s) produced.")
        return projects
