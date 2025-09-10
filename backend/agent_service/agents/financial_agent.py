import json
from agents.base import BaseAgent
from models.property_model import Property
from models.renovation import RenovationProject, RenovationCost, RenovationValueAdd
import re
from datetime import datetime, timedelta, timezone

def safe_parse_int(value):
    if value is None:
        return 0
    try:
        cleaned_string = re.sub(r'[^\d-]', '', str(value))
        return int(cleaned_string) if cleaned_string else 0
    except (ValueError, TypeError):
        return 0

class FinancialAnalysisAgent(BaseAgent):
    """Agent for performing financial analysis on renovation ideas."""

    PROMPT_TEMPLATE = """
    Analyze the financial viability of these renovation ideas for a property valued at ${property_value:,.2f}.
    The property's current estimated value is ${current_estimate:,.2f} and the price per square foot is ${price_per_sqft:,.2f}.

    Renovation Ideas:
    {renovation_json}

    Your tasks:
    1. For each idea, provide a detailed cost breakdown (low, medium, high).
    2. Estimate the value add for each (low, medium, high).
    3. Calculate the Return on Investment (ROI) for the medium estimates.
    4. Provide a feasibility score (Easy, Moderate, Difficult) and an estimated timeline.

    Return a JSON object containing a list of financially analyzed renovation ideas.
    Example for ONE idea:
    {{
      "name": "Kitchen Remodel",
      "description": "...",
      "estimated_cost": {{"low": 15000, "medium": 25000, "high": 35000}},
      "estimated_value_add": {{"low": 30000, "medium": 50000, "high": 70000}},
      "roi": 100,
      "feasibility": "Moderate",
      "timeline": "4-6 weeks"
    }}
    """
    
    def _determine_property_value(self, property_data: Property, comps: list[dict]) -> int:
        """
        Determines the property value using a waterfall logic:
        1. List Price
        2. Last Sold Price (if within 1 year)
        3. Comps-based Estimate
        4. Redfin Estimate
        """
        # 1. Check for a valid list price first
        list_price = safe_parse_int(property_data.price)
        if list_price > 0:
            print(f"[FinancialAgent] Using List Price as property value: ${list_price:,}")
            return list_price

        # 2. If no list price, check for a recent sale
        if property_data.priceHistory:
            sold_events = [event for event in property_data.priceHistory if event.get('event', '').lower() == 'sold' and event.get('date')]
            if sold_events:
                latest_sale = None
                latest_sale_date = datetime.min.replace(tzinfo=timezone.utc)

                for event in sold_events:
                    try:
                        # Ensure date string is in the correct ISO format and timezone-aware
                        date_str = event['date'].replace('Z', '+00:00')
                        current_sale_date = datetime.fromisoformat(date_str)
                        if current_sale_date.tzinfo is None:
                            current_sale_date = current_sale_date.replace(tzinfo=timezone.utc)
                        
                        if current_sale_date > latest_sale_date:
                            latest_sale_date = current_sale_date
                            latest_sale = event
                    except (ValueError, KeyError, TypeError):
                        print(f"[FinancialAgent] Warning: Skipping price history event with invalid date format: {event.get('date')}")
                        continue
                
                if latest_sale:
                    # Compare timezone-aware dates
                    if latest_sale_date > datetime.now(timezone.utc) - timedelta(days=365):
                        sold_price = safe_parse_int(latest_sale.get('price'))
                        if sold_price > 0:
                            print(f"[FinancialAgent] Using recent Sale Price as property value: ${sold_price:,}")
                            return sold_price

        # 3. If no recent sale, use comps to calculate value
        if comps and property_data.sqft and property_data.sqft > 0:
            total_price_per_sqft = 0
            valid_comps = 0
            for comp in comps:
                price = safe_parse_int(comp.get('price'))
                sqft = safe_parse_int(comp.get('sqft'))
                if price > 0 and sqft > 0:
                    total_price_per_sqft += price / sqft
                    valid_comps += 1
            
            if valid_comps > 0:
                avg_price_per_sqft = total_price_per_sqft / valid_comps
                comps_based_value = int(avg_price_per_sqft * property_data.sqft)
                print(f"[FinancialAgent] Using Comps-Based Value as property value: ${comps_based_value:,}")
                return comps_based_value

        # 4. As a final fallback, use the property's own estimate
        estimate = safe_parse_int(property_data.estimate)
        if estimate > 0:
            print(f"[FinancialAgent] WARNING: Using property estimate as a fallback: ${estimate:,}")
            return estimate

        print("[FinancialAgent] ERROR: Could not determine a valid property value.")
        return 0

    def process(self, property_data: Property, renovation_ideas: list[dict], comps: list[dict]) -> list[RenovationProject]:
        print("[FinancialAgent] Process started.")
        
        property_value = self._determine_property_value(property_data, comps)

        if property_value <= 0:
            print("[FinancialAgent] ERROR: Could not determine property value. Cannot perform financial analysis.")
            return []

        renovation_ideas_dicts = [idea.dict() if isinstance(idea, RenovationProject) else idea for idea in renovation_ideas]
        renovation_json = json.dumps(renovation_ideas_dicts, indent=2)
        
        prompt = self.PROMPT_TEMPLATE.format(
            property_value=property_value,
            current_estimate=safe_parse_int(property_data.estimate),
            price_per_sqft=safe_parse_int(property_data.estimatePerSqft),
            renovation_json=renovation_json
        )

        response_text = self.llm.invoke(prompt).content.strip()
        
        try:
            # First, try to find a JSON block wrapped in markdown
            json_match = re.search(r'

