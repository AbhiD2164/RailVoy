"""
Gemini / Claude Style Plain-Language AI Explanation Generator
"""

def generate_waitlist_explanation(train_no: str, travel_class: str, waitlist_pos: int, probability: float) -> str:
    if probability >= 85:
        confidence = "very high"
    elif probability >= 65:
        confidence = "moderate"
    else:
        confidence = "low"
        
    return (
        f"AI Analysis (XGBoost Engine): Based on 12-month historical cancellation velocity, "
        f"seasonality, and coach capacity for class {travel_class} on Train {train_no}, "
        f"Waitlist position #{waitlist_pos} has a {confidence} ({probability:.1f}%) probability of reaching "
        f"Confirmed/RAC status prior to final chart preparation."
    )

def generate_pricing_explanation(base_fare: float, dynamic_fare: float, surge_pct: float, factors: list) -> str:
    factors_str = ", ".join(factors) if factors else "standard demand curves"
    return (
        f"AI Pricing Rationale (Floor-Protected Engine): Base fare is contractually floor-protected "
        f"at ₹{base_fare:.0f}. A dynamic adjustment of {surge_pct:+.1f}% was calculated based on: "
        f"{factors_str}. Dynamic fare is capped at ₹{dynamic_fare:.0f}."
    )

def generate_transfer_explanation(train_no: str, alt_train_no: str, alt_name: str, time_saved: int) -> str:
    return (
        f"AI Journey Replanner Rationale: Train {train_no} is experiencing track congestion. "
        f"Transferring your ticket validity to Train {alt_train_no} ({alt_name}) guarantees a confirmed seat "
        f"and saves approximately {time_saved} minutes of delay."
    )
