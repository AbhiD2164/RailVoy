from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from predictor import predictor
from pricing import pricing_engine
from delay_replanner import delay_replanner

app = FastAPI(
    title="RailVoy AI Microservice",
    description="XGBoost Waitlist Prediction, Bounded Dynamic Pricing, and Delay Replanning API",
    version="1.0.0"
)

cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WaitlistRequest(BaseModel):
    trainNo: str
    travelClass: str
    waitlistPos: int
    travelDate: str
    occupancyRate: Optional[float] = 0.80

class PricingRequest(BaseModel):
    trainNo: str
    trainType: str
    travelClass: str
    distanceKm: float
    bookingCount: int
    occupancyRate: float
    travelDate: str
    mealCategory: Optional[str] = "No Meal"
    trainName: Optional[str] = None
    departureTime: Optional[str] = '08:00'
    arrivalTime: Optional[str] = '18:00'
    passengerCount: Optional[int] = 1
    waitlistPosition: Optional[int] = 0

class DelayRequest(BaseModel):
    trainNo: str
    currentDelayMinutes: int
    routeCode: Optional[str] = "MAIN_LINE"

start_time = datetime.now()

@app.get("/")
def read_root():
    return {
        "status": "active",
        "service": "RailVoy AI FastAPI Microservice",
        "models": ["XGBoost Waitlist Classifier", "Floor-Protected Dynamic Pricing", "NetworkX Delay Replanner"]
    }

@app.get('/health')
def health_check():
    return {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'models': {
            'waitlist_classifier': predictor.engine_name,
            'pricing_engine': 'Dynamic Surge v2.0',
            'delay_replanner': 'NetworkX route graph + Q-learning policy'
        },
        'uptime_seconds': int((datetime.now() - start_time).total_seconds())
    }

@app.post("/predict-waitlist")
def predict_waitlist_endpoint(req: WaitlistRequest):
    return predictor.predict(req.trainNo, req.travelClass, req.waitlistPos, req.travelDate, occupancy_rate=req.occupancyRate)


@app.post("/calculate-fare")
def calculate_fare_endpoint(req: PricingRequest):
    return pricing_engine.calculate_fare(
        train_no=req.trainNo,
        train_type=req.trainType,
        travel_class=req.travelClass,
        distance_km=req.distanceKm,
        booking_count=req.bookingCount,
        occupancy_rate=req.occupancyRate,
        travel_date=req.travelDate,
        meal_category=req.mealCategory,
        train_name=req.trainName,
        departure_time=req.departureTime,
        arrival_time=req.arrivalTime
    )

@app.post("/delay-replan")
def delay_replan_endpoint(req: DelayRequest):
    return delay_replanner.evaluate_delay_and_replan(req.trainNo, req.currentDelayMinutes, req.routeCode)

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("AI_SERVICE_HOST", "0.0.0.0")
    port = int(os.getenv("AI_SERVICE_PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
