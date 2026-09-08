"""
Advanced Floor-Protected Dynamic Pricing Engine with Google Calendar & Event Intelligence
"""
from datetime import datetime
import os
import urllib.request
import json
from explanation import generate_pricing_explanation

class DynamicPricingEngine:
    def __init__(self):
        # Base fare per km rules by train type
        self.base_rates = {
            "Passenger": 0.45, "Local": 0.40, "Mail": 0.55,
            "Express": 0.65, "Superfast": 0.75, "Shatabdi": 1.10,
            "Rajdhani": 1.20, "Duronto": 1.15
        }
        self.class_multipliers = {
            "1A": 3.2, "2A": 2.1, "3A": 1.5, "SL": 0.6, "CC": 1.1
        }
        
        # Comprehensive Indian Festival and Event Calendar Knowledge Base
        self.calendar_events = {
            "01-01": {"name": "New Year Day", "surge": 0.20, "category": "New Year"},
            "01-14": {"name": "Makar Sankranti / Pongal", "surge": 0.25, "category": "Festival"},
            "01-26": {"name": "Republic Day", "surge": 0.15, "category": "National Holiday"},
            "03-08": {"name": "Maha Shivratri", "surge": 0.15, "category": "Festival"},
            "03-25": {"name": "Holi Festival of Colors", "surge": 0.35, "category": "Festival"},
            "04-11": {"name": "Eid-ul-Fitr", "surge": 0.30, "category": "Festival"},
            "08-15": {"name": "Independence Day Long Weekend", "surge": 0.25, "category": "National Holiday"},
            "08-19": {"name": "Raksha Bandhan Rush", "surge": 0.25, "category": "Festival"},
            "09-07": {"name": "Ganesh Chaturthi", "surge": 0.25, "category": "Festival"},
            "10-02": {"name": "Gandhi Jayanti Extended Holiday", "surge": 0.20, "category": "Holiday"},
            "10-12": {"name": "Dussehra / Durga Puja Navratri", "surge": 0.35, "category": "Festival"},
            "10-24": {"name": "ICC World Cup / IPL Tournament Season", "surge": 0.30, "category": "Mega Event"},
            "10-31": {"name": "Diwali Festival Peak Travel", "surge": 0.40, "category": "Festival"},
            "11-01": {"name": "Diwali & Govardhan Puja", "surge": 0.40, "category": "Festival"},
            "11-07": {"name": "Chhath Puja Peak Movement", "surge": 0.45, "category": "Festival"},
            "12-25": {"name": "Christmas Holidays", "surge": 0.25, "category": "Holiday"},
            "12-30": {"name": "New Year Eve Surge", "surge": 0.30, "category": "New Year"},
            "12-31": {"name": "New Year Eve Peak", "surge": 0.35, "category": "New Year"}
        }

    def _check_google_calendar_events(self, travel_date: str) -> list:
        """
        Query Google Calendar API or rich event engine for festival/holiday events on date.
        """
        detected_events = []
        try:
            date_obj = datetime.strptime(travel_date, "%Y-%m-%d")
        except Exception:
            try:
                date_obj = datetime.strptime(travel_date.split("T")[0], "%Y-%m-%d")
            except Exception:
                date_obj = datetime.now()

        month_day = date_obj.strftime("%m-%d")
        month = date_obj.month
        day_of_week = date_obj.weekday() # 0 = Mon, 5 = Sat, 6 = Sun

        # 1. Check Google Calendar API if API Key is configured in environment
        gcal_api_key = os.getenv("GOOGLE_CALENDAR_API_KEY")
        if gcal_api_key:
            try:
                # Public Indian Holiday calendar ID
                cal_id = "en.indian%23holiday%40group.v.calendar.google.com"
                time_min = f"{travel_date}T00:00:00Z"
                time_max = f"{travel_date}T23:59:59Z"
                url = f"https://www.googleapis.com/calendar/v3/calendars/{cal_id}/events?timeMin={time_min}&timeMax={time_max}&key={gcal_api_key}"
                req = urllib.request.Request(url, headers={'User-Agent': 'RailVoy-AI/1.0'})
                with urllib.request.urlopen(req, timeout=1.5) as response:
                    data = json.loads(response.read().decode())
                    for item in data.get('items', []):
                        summary = item.get('summary', 'Official Holiday')
                        detected_events.append({
                            "name": summary,
                            "surge": 0.30,
                            "category": "Google Calendar Verified Event"
                        })
            except Exception:
                pass

        # 2. Check curated Festival & Event Calendar
        if month_day in self.calendar_events:
            detected_events.append(self.calendar_events[month_day])

        # 3. Summer Vacation Period (May 1 to June 30)
        if month in [5, 6]:
            detected_events.append({
                "name": "Summer Vacation Peak Holiday Season",
                "surge": 0.20,
                "category": "Vacation"
            })

        # 4. Winter / Year-End Vacation Period (Dec 20 to Jan 5)
        if (month == 12 and date_obj.day >= 20) or (month == 1 and date_obj.day <= 5):
            if month_day not in ["01-01", "12-30", "12-31"]:
                detected_events.append({
                    "name": "Winter Holiday Travel Wave",
                    "surge": 0.15,
                    "category": "Vacation"
                })

        # 5. Weekend Travel Patterns (Friday, Saturday, Sunday)
        if day_of_week in [4, 5, 6]:
            day_name = ["Friday", "Saturday", "Sunday"][day_of_week - 4]
            detected_events.append({
                "name": f"{day_name} Weekend Travel Demand",
                "surge": 0.12,
                "category": "Weekend"
            })

        return detected_events

    def calculate_fare(
        self, train_no: str, train_type: str, travel_class: str,
        distance_km: float, booking_count: int, occupancy_rate: float,
        travel_date: str, meal_category: str = "No Meal"
    ) -> dict:
        base_rate = self.base_rates.get(train_type, 0.65)
        cls_mult = self.class_multipliers.get(travel_class, 1.0)
        
        # Base Fare calculation (Floor Limit)
        base_fare = round((distance_km * base_rate * cls_mult) + 30.0)
        
        factors = []
        surge_mult = 1.0

        # 1. Traffic Congestion & Route Occupancy Factors
        if occupancy_rate >= 0.85:
            surge_mult += 0.25
            factors.append(f"Heavy Track Congestion & High Occupancy ({int(occupancy_rate*100)}%)")
        elif occupancy_rate >= 0.65:
            surge_mult += 0.15
            factors.append(f"Moderate Route Traffic Load ({int(occupancy_rate*100)}%)")

        # 2. Google Calendar, Festivals, Vacations & Events
        events = self._check_google_calendar_events(travel_date)
        for ev in events:
            surge_mult += ev["surge"]
            factors.append(f"{ev['name']} (+{int(ev['surge']*100)}%)")

        # Dynamic fare before floor protection (capped at reasonable ceiling of 2.2x base)
        surge_mult = min(2.2, surge_mult)
        calc_dynamic = round(base_fare * surge_mult)
        
        # Floor Protection Constraint: Dynamic fare CANNOT be lower than base fare
        dynamic_fare = max(base_fare, calc_dynamic)
        
        # Meal Add-on price (transparently bundled into final fare)
        meal_prices = {
            "Veg": 140, "Jain": 140, "Non-Veg": 180, "Continental": 220, "No Meal": 0
        }
        meal_price = meal_prices.get(meal_category, 0)
        final_fare = dynamic_fare + meal_price
        surge_pct = round((surge_mult - 1.0) * 100, 1)

        explanation = generate_pricing_explanation(base_fare, dynamic_fare, surge_pct, factors)

        return {
            "baseFare": base_fare,
            "dynamicFare": dynamic_fare,
            "mealPrice": meal_price,
            "finalFare": final_fare,
            "surgePercentage": surge_pct,
            "detectedEvents": [e["name"] for e in events],
            "explanation": explanation
        }

pricing_engine = DynamicPricingEngine()
