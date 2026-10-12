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
        # Base fare per km rules by train type (synchronized with fare_rules.json)
        self.base_rates = {
            "Passenger": 0.45, "Local": 0.40, "Mail": 0.55,
            "Express": 0.65, "Superfast": 0.75, "Shatabdi": 1.10,
            "Rajdhani": 1.20, "Duronto": 1.15,
            "Vande Bharat": 1.35, "Tejas": 1.30,
            "Garib Rath": 0.50, "Sachkhand": 0.55
        }
        self.facility_multipliers = {
            "Passenger": 0.85, "Local": 0.80, "Mail": 1.0,
            "Express": 1.05, "Superfast": 1.15, "Shatabdi": 1.30,
            "Rajdhani": 1.40, "Duronto": 1.35,
            "Vande Bharat": 1.50, "Tejas": 1.45,
            "Garib Rath": 1.00, "Sachkhand": 1.00
        }
        self.class_multipliers = {
            "1A": 3.2, "2A": 2.1, "3A": 1.5, "SL": 0.6, "CC": 1.1, "EC": 2.4, "GS": 0.35, "3E": 1.3
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

    def _check_meal_window(self, dep_time: str, arr_time: str) -> bool:
        def time_to_mins(t):
            h, m = map(int, t.split(':'))
            return h * 60 + m
        
        try:
            dep_m = time_to_mins(dep_time)
            arr_m = time_to_mins(arr_time)
            if arr_m < dep_m:
                arr_m += 24 * 60
            
            # Windows: 7-10 (420-600), 12-14 (720-840), 19-21 (1140-1260)
            windows = [(420, 600), (720, 840), (1140, 1260)]
            
            for w_start, w_end in windows:
                if (dep_m <= w_end and arr_m >= w_start):
                    return True
            return False
        except Exception:
            return False

    def calculate_fare(
        self, train_no: str, train_type: str, travel_class: str,
        distance_km: float, booking_count: int, occupancy_rate: float,
        travel_date: str, meal_category: str = "No Meal",
        train_name: str = None, departure_time: str = '08:00', arrival_time: str = '18:00'
    ) -> dict:
        
        # Load fare_rules.json
        dataset_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dataset'))
        fare_rules_path = os.path.join(dataset_dir, 'fare_rules.json')
        fare_rules_db = []
        try:
            with open(fare_rules_path, 'r', encoding='utf-8') as f:
                fare_rules_db = json.load(f)
        except Exception as e:
            pass
        
        # Detect category from train_name
        effective_type = train_type
        if train_name:
            name_upper = train_name.upper()
            for rule in fare_rules_db:
                tt = rule.get("trainType", "")
                if tt.upper() in name_upper:
                    effective_type = tt
                    break
        
        base_rate = self.base_rates.get(effective_type, 0.75)
        facility_mult = self.facility_multipliers.get(effective_type, 1.15)
        cls_mult = self.class_multipliers.get(travel_class, 1.0)
        
        # Override rules from DB if found
        rule_record = next((r for r in fare_rules_db if r.get("trainType") == effective_type), None)
        if rule_record:
            base_rate = rule_record.get("baseFarePerKm", base_rate)
            facility_mult = rule_record.get("facilityMultiplier", facility_mult)
            cls_mult = rule_record.get("classMultipliers", {}).get(travel_class, cls_mult)
        
        # Base Fare calculation
        base_fare = round((distance_km * base_rate * cls_mult * facility_mult) + 30.0)
        
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

        surge_mult = min(2.2, surge_mult)
        calc_dynamic = round(base_fare * surge_mult)
        dynamic_fare = max(base_fare, calc_dynamic)
        
        # Meal Pricing Logic
        meal_price = 0
        meal_included = False
        if meal_category != "No Meal":
            if travel_class == "GS" or (rule_record and travel_class in rule_record.get("noMealClasses", [])):
                meal_price = 0
            elif not self._check_meal_window(departure_time, arrival_time):
                meal_price = 0
            elif effective_type in ["Rajdhani", "Duronto"]:
                if travel_class == "1A":
                    prices = {"Veg": 260, "Jain": 260, "Non-Veg": 310, "Continental": 350}
                elif travel_class == "2A":
                    prices = {"Veg": 225, "Jain": 225, "Non-Veg": 275, "Continental": 320}
                else:
                    prices = {"Veg": 195, "Jain": 195, "Non-Veg": 240, "Continental": 285}
                # Fix key format if needed
                key = meal_category.replace("-", "") if "-" in meal_category else meal_category
                if key == "NonVeg": key = "Non-Veg"
                meal_price = prices.get(meal_category, 0)
                if meal_price == 0 and key == "NonVeg": meal_price = prices.get("Non-Veg", 0) # Fallback
                meal_included = True
            else:
                if rule_record:
                    meal_prices_db = rule_record.get("mealPrices", {})
                    meal_included = rule_record.get("mealIncluded", False)
                    key = meal_category.replace("-", "")
                    meal_price = meal_prices_db.get(key, 0)
                else:
                    meal_prices = {"Veg": 140, "Jain": 140, "NonVeg": 180, "Continental": 220}
                    meal_price = meal_prices.get(meal_category.replace("-", ""), 0)
                    meal_included = False
        
        if meal_included:
            final_fare = dynamic_fare
        else:
            final_fare = dynamic_fare + meal_price
            
        surge_pct = round((surge_mult - 1.0) * 100, 1)

        explanation = generate_pricing_explanation(base_fare, dynamic_fare, surge_pct, factors)

        return {
            "baseFare": base_fare,
            "dynamicFare": dynamic_fare,
            "mealPrice": meal_price,
            "mealIncluded": meal_included,
            "finalFare": final_fare,
            "surgePercentage": surge_pct,
            "detectedEvents": [e["name"] for e in events],
            "explanation": explanation
        }

pricing_engine = DynamicPricingEngine()
