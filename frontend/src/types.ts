export interface Station {
  stationId: string;
  stationName: string;
  stationCode: string;
  state: string;
}

export interface FareInfo {
  baseFare: number;
  dynamicFare: number;
  mealPrice: number;
  finalFare: number;
  surgePercentage: number;
  explanation: string;
}

export interface TrainSearchResult {
  trainNo: string;
  trainName: string;
  trainType: string;
  source: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  fromStation: string;
  toStation: string;
  distanceKm: number;
  seatStatus: 'Available' | 'RAC' | 'Waitlist';
  availableSeats: number;
  waitlistPosition: number;
  confirmationProbability: number;
  aiExplanation: string;
  fare: FareInfo;
  currentDelayMinutes: number;
  travelClass?: string;
  travelDate?: string;
  coachComposition?: string[];
  cateringTier?: string;
}

export interface Passenger {
  name: string;
  age: number;
  gender: 'M' | 'F' | 'O';
  berthPreference: string;
  berthType?: string;
  seatNo?: string;
}

export interface FoodSelection {
  mealCategory: 'No Meal' | 'Veg' | 'Non-Veg' | 'Jain' | 'Continental';
  mealType: string;
  mealPrice: number;
}

export interface Booking {
  _id?: string;
  pnr: string;
  userEmail: string;
  trainNo: string;
  trainName: string;
  fromStation: string;
  toStation: string;
  travelDate: string;
  travelClass: string;
  coachPosition?: string;
  passengers: Passenger[];
  foodSelection: FoodSelection;
  couponCode?: string;
  discountAmount?: number;
  baseFare: number;
  dynamicFare: number;
  finalFare: number;
  paymentDetails: {
    gateway: string;
    transactionId: string;
    status: string;
    paidAt?: string;
  };
  status: 'Confirmed' | 'RAC' | 'Waitlisted' | 'Cancelled' | 'Transferred';
  waitlistPosition?: number;
  confirmationProbability?: number;
  explanationReason?: string;
  transferredFromPnr?: string;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'passenger' | 'admin';
  avatar?: string;
  bankAccountNo?: string;
  bankName?: string;
}

export interface Coupon {
  _id?: string;
  code: string;
  discountType?: 'flat' | 'percentage';
  discountValue: number;
  couponType?: 'food' | 'ticket' | 'all' | 'fare' | 'upgrade' | 'general';
  targetTier?: string;
  description?: string;
  minFare?: number;
  maxDiscount?: number;
  type?: 'FLAT' | 'PERCENT' | 'MEAL_FREE' | 'STUDENT' | 'TATKAL_OFF';
  minTicketValue?: number;
  applicableTrainTypes?: string[];
  applicableClasses?: string[];
  validUntil?: string | Date;
  isActive: boolean;
  timesUsed?: number;
  createdAt?: string | Date;
}

export interface CoachInfo {
  code: string;
  type: string;
  label: string;
  isPantry?: boolean;
  isEngine?: boolean;
}

export interface AlternativeTrain {
  trainNo: string;
  trainName: string;
  departure: string;
  arrival: string;
  availableSeats: number;
  timeSavedMinutes: number;
  explanation: string;
}

export interface LiveStatus {
  trainNo: string;
  trainName: string;
  trainType: string;
  currentDelayMinutes: number;
  status: string;
  currentStation: string;
  nextStation: string;
  currentSpeedKmH: number;
  platformNo: number;
  stops: Array<{
    sequence: number;
    stationCode: string;
    arrival: string;
    departure: string;
    distanceFromOriginKm: number;
    isCompleted: boolean;
    isCurrent: boolean;
  }>;
  aiReplanning: {
    isDelayed: boolean;
    delayMinutes: number;
    recommendationAvailable: boolean;
    alternativeTrains: AlternativeTrain[];
  };
}
