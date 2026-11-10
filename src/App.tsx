import React, { useState, useEffect, useRef, Component } from "react";
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { 
  Calendar as CalendarIcon, 
  Clock as ClockIcon, 
  MapPin, 
  Plus, 
  Minus,
  Trash2, 
  Check, 
  Mail, 
  Phone, 
  User, 
  ArrowRight, 
  Map as MapIcon, 
  Leaf, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Building,
  PlaneTakeoff,
  Sparkles,
  Users,
  Briefcase,
  Baby
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AdminDashboard } from "./components/AdminDashboard";
import { GoogleMapComponent } from "./components/GoogleMapComponent";

// Google Maps API Key setup
const API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  "AIzaSyD5HvwS3iht4LPHxb3OdmtGGrupuNy2EXQ";

const hasValidKey = Boolean(API_KEY) && API_KEY !== "YOUR_API_KEY" && API_KEY !== "";

// Error boundary component for Google Maps and markers to prevent entire application crashes
interface MapErrorBoundaryProps {
  children: React.ReactNode;
}

interface MapErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  public state: MapErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Map or Marker render error caught:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-slate-50 border border-slate-200 rounded-lg min-h-[350px] w-full">
          <div className="p-3 bg-red-100 text-red-600 rounded-full mb-3">
            <AlertCircle size={24} />
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Route Map Display Failed</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            The map component encountered an unexpected error. This is usually caused by an invalid or restricted Google Maps API key, or temporary connection issues.
          </p>
          {this.state.error && (
            <pre className="mt-3 p-2 bg-slate-100 text-slate-700 text-[10px] font-mono rounded max-w-xs overflow-x-auto border border-slate-200">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 px-4 py-2 bg-env-green hover:bg-emerald-800 text-white text-xs font-bold rounded-[6px] transition-colors"
          >
            Retry Loading Map
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}


// Rate constants as specified in the request
const SEDAN_RATE = 375; // $375 per mile
const SUV_RATE = 500;   // $500 per mile

// Extra Services Pricing (Placeholders - edit these values directly)
const MEET_AND_GREET_PRICE = 25.00; // placeholder price for Meet & Greet
const PET_CARRIER_PRICE = 30.00;    // placeholder price for Pet Carrier
const ICE_SERVICE_PRICE = 15.00;    // placeholder price for Ice

const VEHICLE_TYPES = [
  {
    id: "Sedan",
    name: "Sedan",
    tagline: "Professional Chauffeur Service",
    passengers: 3,
    luggage: 3,
    hourlyRate: 50,
    mileageRate: 3,
    image: "https://placehold.co/400x250/000000/FFFFFF?text=Sedan",
    isPriced: true,
  },
  {
    id: "Luxury SUV",
    name: "Luxury SUV",
    tagline: "Premium Chauffeur Service",
    passengers: 5,
    luggage: 5,
    hourlyRate: 65,
    mileageRate: 4,
    image: "https://placehold.co/400x250/000000/FFFFFF?text=Luxury+SUV",
    isPriced: true,
  },
  {
    id: "Luxury Sedan",
    name: "Luxury Sedan",
    tagline: "ULTRA-PREMIUM COMFORT",
    passengers: 3,
    luggage: 2,
    image: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&q=80&w=800",
    isPriced: false,
  },
  {
    id: "Stretch Limo",
    name: "Stretch Limo",
    tagline: "ELEGANT CELEBRATION CLASS",
    passengers: 8,
    luggage: 4,
    image: "https://images.unsplash.com/photo-1563720223185-11003d516935?auto=format&fit=crop&q=80&w=800",
    isPriced: false,
  },
  {
    id: "Sprinter Van",
    name: "Sprinter Van",
    tagline: "EXECUTIVE GROUP SHUTTLE",
    passengers: 14,
    luggage: 10,
    image: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?auto=format&fit=crop&q=80&w=800",
    isPriced: false,
  },
  {
    id: "Mini Van",
    name: "Mini Van",
    tagline: "VERSATILE FAMILY TRAVEL",
    passengers: 7,
    luggage: 5,
    image: "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&q=80&w=800",
    isPriced: false,
  },
  {
    id: "Charter Bus",
    name: "Charter Bus",
    tagline: "LARGE GROUP TRANSPORT",
    passengers: 50,
    luggage: 25,
    image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80&w=800",
    isPriced: false,
  }
];

// Updated Service Areas
const CITIES_SERVED = ["Whole USA"];

// Service Types
const SERVICES = [
  "Hourly Ride",
  "To Airport (Arrival)",
  "From Airport (Departure)",
  "Point to Point (Single Transfer)",
  "Group Transportation",
  "Limo Service",
  "Other",
];

// Helper to check if location is in service area
function isLocationInServiceArea(address: string): boolean {
  const addr = address.toLowerCase();
  const md = addr.includes("maryland") || addr.includes(", md");
  const va = addr.includes("virginia") || addr.includes(", va");
  const dc = addr.includes("district of columbia") || addr.includes("washington, dc") || addr.includes("washington dc") || addr.includes(", dc");
  
  return md || va || dc;
}

// Pricing formula based on new rules
interface FareBreakdown {
  billableHours: number;
  distance: number;
  outboundDistance?: number;
  returnDistance?: number;
  outboundTime?: number;
  returnTime?: number;
  hourlyCharge: number;
  mileageCharge: number;
  baseFare: number;
  meetAndGreet: number;
  addStops: number;
  childSeat: number;
  extras: number;
  subtotal: number;
  driverFee: number;
  salesTax: number;
  total: number;
}

function isStandardPricingArea(pickupAddr?: string, dropoffAddr?: string): boolean {
  if (!pickupAddr || !dropoffAddr) return false;
  return isLocationInServiceArea(pickupAddr) && isLocationInServiceArea(dropoffAddr);
}

function calculateFare(vehicleId: string, distance: number, travelTimeHours: number, extras: { meetAndGreet: boolean, addStops: number, childSeat: boolean }, isRoundTrip: boolean, serviceType: string = "To Airport (Arrival)", hourlyHours: number = 5): FareBreakdown {
  const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleId);
  const hourlyRate = vehicle?.hourlyRate || 0;
  const mileageRate = vehicle?.mileageRate || 0;
  
  const isHourly = serviceType === "Hourly Ride";

  if (isHourly) {
    const billableHours = hourlyHours;
    const hourlyCharge = hourlyRate * billableHours;
    const mileageCharge = 0;
    const baseFare = hourlyCharge;

    const meetAndGreetCost = extras.meetAndGreet ? 25 : 0;
    const addStopsCost = 0; // $0 for Hourly Ride
    const childSeatCost = extras.childSeat ? 25 : 0;
    const extrasCost = meetAndGreetCost + addStopsCost + childSeatCost;

    const subtotal = baseFare + extrasCost;
    const driverFee = subtotal * 0.20;
    const salesTax = (subtotal + driverFee) * 0.033;
    const total = Math.round((subtotal + driverFee + salesTax) * 100) / 100;

    return {
      billableHours,
      distance: 0,
      outboundDistance: 0,
      returnDistance: 0,
      outboundTime: 0,
      returnTime: 0,
      hourlyCharge,
      mileageCharge,
      baseFare,
      meetAndGreet: meetAndGreetCost,
      addStops: addStopsCost,
      childSeat: childSeatCost,
      extras: extrasCost,
      subtotal,
      driverFee,
      salesTax,
      total
    };
  }

  const outboundDistance = distance;
  const returnDistance = isRoundTrip ? distance : 0;
  const totalDistance = outboundDistance + returnDistance;
  
  const outboundTime = travelTimeHours;
  const returnTime = isRoundTrip ? travelTimeHours : 0;
  const totalTravelTime = outboundTime + returnTime;
  
  // Step 1: Billable Hours (Round UP to nearest hour)
  const billableHours = Math.ceil(totalTravelTime);
  
  // Step 1: Hourly Charge (fixed to 1 hour rate regardless of total hours)
  const hourlyCharge = hourlyRate;
  
  // Step 2: Mileage Charge
  const mileageCharge = totalDistance * mileageRate;
  
  // Step 3: Base Fare
  const baseFare = hourlyCharge + mileageCharge;
  
  // Step 4: Optional Services
  const meetAndGreetCost = extras.meetAndGreet ? 25 : 0;
  const addStopsCost = extras.addStops * 15;
  const childSeatCost = extras.childSeat ? 25 : 0;
  const extrasCost = meetAndGreetCost + addStopsCost + childSeatCost;
  
  // Step 5: Subtotal
  const subtotal = baseFare + extrasCost;
  
  // Step 6: Driver Fee (20% of Subtotal)
  const driverFee = subtotal * 0.20;
  
  // Step 7: Sales Tax (3.3% of Subtotal + Driver Fee)
  const salesTax = (subtotal + driverFee) * 0.033;
  
  // Step 8: Final Total
  const total = Math.round((subtotal + driverFee + salesTax) * 100) / 100;
  
  return {
    billableHours,
    distance: totalDistance,
    outboundDistance,
    returnDistance,
    outboundTime,
    returnTime,
    hourlyCharge,
    mileageCharge,
    baseFare,
    meetAndGreet: meetAndGreetCost,
    addStops: addStopsCost,
    childSeat: childSeatCost,
    extras: extrasCost,
    subtotal,
    driverFee,
    salesTax,
    total
  };
}

// Helper to calculate Haversine distance in miles between coordinates
function getHaversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


// Custom input wrapper for the modern Google Maps Places Autocomplete using the Places API (New) with fully resilient Classic fallback
interface PlaceAutocompleteInputProps {
  placeholder: string;
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
}

const PlaceAutocompleteInput: React.FC<PlaceAutocompleteInputProps> = ({
  placeholder,
  value,
  onChange,
}) => {
  const [inputValue, setInputValue] = useState(value || "");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value || "");
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchTimerRef = useRef<any>(null);

  const performSearch = async (val: string) => {
    const query = val.trim();
    if (!query) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      let suggestionsList: any[] = [];

      // 1. Try Google Places API proxy first
      try {
        const response = await fetch(`/api/places/autocomplete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: query })
        });
        if (response.ok) {
          const res = await response.json();
          if (res && res.suggestions) {
            suggestionsList = res.suggestions.map((s: any) => ({
              placeId: s.placePrediction?.placeId || s.placeId,
              description: s.placePrediction?.text?.text || s.placePrediction?.description || s.description,
              isGoogle: true
            }));
          }
        }
      } catch (err) {
        console.warn("[Autocomplete] Google Places proxy failed, falling back to Nominatim", err);
      }

      // 2. If Google returned no suggestions or failed, fallback to Nominatim search
      if (suggestionsList.length === 0) {
        try {
          const nomRes = await fetch(`/api/nominatim/search?q=${encodeURIComponent(query)}`);
          if (nomRes.ok) {
            const nomData = await nomRes.json();
            if (nomData && nomData.suggestions) {
              suggestionsList = nomData.suggestions.map((s: any) => ({
                placeId: s.placeId,
                description: s.description,
                lat: s.lat,
                lng: s.lng,
                isGoogle: false
              }));
            }
          }
        } catch (err2) {
          console.warn("[Autocomplete] Nominatim proxy failed, trying direct nominatim", err2);
          try {
            const directRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`, {
              headers: { 'User-Agent': 'EnviroRide-App/1.0' }
            });
            if (directRes.ok) {
              const directData = await directRes.json();
              suggestionsList = directData.map((item: any) => ({
                placeId: item.place_id,
                description: item.display_name,
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                isGoogle: false
              }));
            }
          } catch (err3) {
            console.error("[Autocomplete] All location search methods failed:", err3);
          }
        }
      }

      setSuggestions(suggestionsList);
      setIsOpen(suggestionsList.length > 0);
    } catch (err) {
      console.error("Places Autocomplete search failed:", err);
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    onChange(val, undefined, undefined);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => performSearch(val), 300);
  };

  const handleSelect = async (item: any) => {
    setInputValue(item.description);
    setIsOpen(false);
    
    if (!item.isGoogle && item.lat !== undefined && item.lng !== undefined) {
      onChange(item.description, item.lat, item.lng);
      return;
    }

    try {
      const res = await fetch("/api/places/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: item.placeId })
      });
      const details = await res.json();
      if (details.location) {
        onChange(item.description, details.location.latitude, details.location.longitude);
      } else if (item.lat !== undefined && item.lng !== undefined) {
        onChange(item.description, item.lat, item.lng);
      } else {
        onChange(item.description, undefined, undefined);
      }
    } catch (err) {
      console.error("Place details fetch failed:", err);
      if (item.lat !== undefined && item.lng !== undefined) {
        onChange(item.description, item.lat, item.lng);
      } else {
        onChange(item.description, undefined, undefined);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2.5 px-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto bg-white border border-[#CBD5E1] rounded-[6px] shadow-lg">
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              onClick={() => handleSelect(suggestion)}
              className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors font-sans"
            >
              {suggestion.description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Sub-component for autocomplete stop input using modern autocomplete
interface StopInputProps {
  index: number;
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  onRemove: () => void;
}

const StopInput: React.FC<StopInputProps> = ({
  index,
  value,
  onChange,
  onRemove,
}) => {
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="text-slate-400 shrink-0">
        <MapPin size={16} />
      </div>
      <div className="flex-grow">
        <PlaceAutocompleteInput
          placeholder={`Additional Stop #${index + 1}`}
          value={value}
          onChange={onChange}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-2 text-red-500 hover:text-red-750 hover:bg-red-50 rounded-[6px] transition-colors duration-150 border border-red-100 cursor-pointer shrink-0"
        title="Remove stop"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

// Inner Content Component loaded inside APIProvider
function BookingSystemContent() {
  // Step state (1: Quote Request, 2: Vehicle Selection, 3: Confirmation Screen)
  const [step, setStep] = useState(1);

  // Booking fields
  const [serviceType, setServiceType] = useState("To Airport (Arrival)");
  const [customServiceType, setCustomServiceType] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [tripType, setTripType] = useState<"Single Trip" | "Round Trip">("Single Trip");
  
  // Format current date + 3 days as default pickup date
  const getDefaultDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  
  const [pickupDate, setPickupDate] = useState(getDefaultDate());
  const [pickupTime, setPickupTime] = useState("11:00");
  const [returnDate, setReturnDate] = useState(getDefaultDate());
  const [returnTime, setReturnTime] = useState("17:00");

  // Locations state
  const [pickup, setPickup] = useState<{ address: string; lat?: number; lng?: number } | null>(null);
  const [dropoff, setDropoff] = useState<{ address: string; lat?: number; lng?: number } | null>(null);
  const [stops, setStops] = useState<{ id: string; address: string; lat?: number; lng?: number }[]>([]);

  // Distance in miles
  const [distance, setDistance] = useState<number>(0);
  const [travelTime, setTravelTime] = useState<number>(0);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routesApiError, setRoutesApiError] = useState<string | null>(null);

  // Step 2 selection
  const [selectedVehicle, setSelectedVehicle] = useState<string>("Sedan");
  const [customRideRequest, setCustomRideRequest] = useState<string | null>(null);

  // Passenger & Luggage selection
  const [numPassengers, setNumPassengers] = useState<number>(1);
  const [numLuggage, setNumLuggage] = useState<number>(0);
  const [needCarSeat, setNeedCarSeat] = useState<boolean>(false);
  const [carSeatType, setCarSeatType] = useState<string>("Infant Seat");
  const [hourlyHours, setHourlyHours] = useState<number>(4);

  // Sync dropoff with pickup for Hourly Ride
  useEffect(() => {
    if (serviceType === "Hourly Ride" && pickup) {
      setDropoff(pickup);
    }
  }, [serviceType, pickup]);

  // Ensure default vehicle for Group Transportation is a group vehicle
  useEffect(() => {
    if (serviceType === "Group Transportation") {
      const activeVehicle = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
      if (!activeVehicle || activeVehicle.isPriced !== false) {
        const firstGroupVehicle = VEHICLE_TYPES.find(v => v.isPriced === false);
        if (firstGroupVehicle) {
          setSelectedVehicle(firstGroupVehicle.id);
        }
      }
    }
  }, [serviceType]);

  // Additional Services toggles
  const [meetAndGreet, setMeetAndGreet] = useState<boolean>(false);

  // Clamp passenger & luggage values when selected vehicle changes
  useEffect(() => {
    const activeVehicle = VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[0];
    if (numPassengers > activeVehicle.passengers) {
      setNumPassengers(activeVehicle.passengers);
    }
    if (numLuggage > activeVehicle.luggage) {
      setNumLuggage(activeVehicle.luggage);
    }
  }, [selectedVehicle]);

  // Client Details Form
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientMessage, setClientMessage] = useState("");

  // UI States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingResponse, setBookingResponse] = useState<{ bookingId: string; simulated?: boolean } | null>(null);

  // Reset distance on location address changes so the map can compute a fresh road distance
  useEffect(() => {
    setDistance(0);
    setIsCalculatingRoute(true);
  }, [pickup?.address, dropoff?.address, stops]);

  // Recalculate distance whenever locations change
  useEffect(() => {
    if (
      !pickup || 
      !dropoff || 
      pickup.lat === undefined || 
      pickup.lng === undefined || 
      dropoff.lat === undefined || 
      dropoff.lng === undefined
    ) {
      setDistance(0);
      return;
    }

    // Only compute straight line as a quick initial estimate if distance is 0.
    // This prevents overwriting the accurate road distance computed by the Google Routes API.
  }, [pickup, dropoff, stops, distance]);

  // Construct complete map coordinates array for drawing
  const getRouteCoordinates = (): google.maps.LatLngLiteral[] => {
    if (
      !pickup || 
      !dropoff || 
      pickup.lat === undefined || 
      pickup.lng === undefined || 
      dropoff.lat === undefined || 
      dropoff.lng === undefined
    ) return [];
    const pts: google.maps.LatLngLiteral[] = [{ lat: pickup.lat, lng: pickup.lng }];
    
    stops.forEach((s) => {
      if (s.lat !== undefined && s.lng !== undefined) {
        pts.push({ lat: s.lat, lng: s.lng });
      }
    });

    pts.push({ lat: dropoff.lat, lng: dropoff.lng });
    return pts;
  };

  const handleAddStop = () => {
    setStops([...stops, { id: Math.random().toString(), address: "" }]);
  };

  const handleRemoveStop = (id: string) => {
    setStops(stops.filter((s) => s.id !== id));
  };

  const handleStopChange = (id: string, address: string, lat?: number, lng?: number) => {
    setStops(
      stops.map((s) => (s.id === id ? { ...s, address, lat, lng } : s))
    );
  };

  const handleGetQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (serviceType === "Other" && !customServiceType.trim()) {
      setErrorMsg("Please specify your custom service type.");
      return;
    }
    if (!pickup || pickup.lat === undefined || pickup.lng === undefined) {
      setErrorMsg("Please select a valid pickup address from the dropdown list.");
      return;
    }
    if (!dropoff || dropoff.lat === undefined || dropoff.lng === undefined) {
      setErrorMsg("Please select a valid drop-off address from the dropdown list.");
      return;
    }

    if (serviceType === "Hourly Ride") {
      if (!pickup || !dropoff || pickup.address !== dropoff.address) {
        setErrorMsg("Hourly Ride requires the pickup and drop-off locations to be the same. Please use the same location for both.");
        return;
      }
    }
    
    // Ensure all stops are filled out if they exist
    const unfilledStop = stops.find((s) => !s.address || s.lat === undefined);
    if (unfilledStop) {
      setErrorMsg("Please select a valid address for all additional stops.");
      return;
    }

    setErrorMsg(null);
    setStep(2);
  };

  const hasStandardPricing = isStandardPricingArea(pickup?.address, dropoff?.address);

  const getExtrasTotal = () => {
    let total = 0;
    if (meetAndGreet) total += 25;
    return total;
  };

  // Pricing formula helper
  const calculatePrice = (vehicleId: string) => {
    const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleId);
    if (!vehicle) return 0;
    
    const roundedDistance = Math.round(distance * 100) / 100;
    const travelTimeHours = travelTime > 0 ? (travelTime / 60) : (roundedDistance / 30);
    
    // Calculate fare based on rules
    const fare = calculateFare(vehicleId, roundedDistance, travelTimeHours, {
      meetAndGreet,
      addStops: stops.filter(s => s.address && s.address.trim() !== "").length,
      childSeat: needCarSeat
    }, tripType === "Round Trip", serviceType, hourlyHours);
    
    return fare.total;
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientEmail.trim() || !clientPhone.trim()) {
      setErrorMsg("Please fill in all contact details to finalize your reservation.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    // Calculate total price based on vehicle (0 if outside standard pricing region)
    const price = hasStandardPricing ? calculatePrice(selectedVehicle) : 0;

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceType: serviceType === "Other" ? `Other: ${customServiceType}` : serviceType,
          tripType,
          pickupDate,
          pickupTime,
          returnDate: tripType === "Round Trip" ? returnDate : undefined,
          returnTime: tripType === "Round Trip" ? returnTime : undefined,
          pickupAddress: pickup?.address,
          dropoffAddress: dropoff?.address,
          stops: stops.map((s) => s.address),
          selectedVehicle,
          distance,
          totalPrice: price,
          customRideRequest,
          clientEmail,
          clientName,
          clientPhone,
          clientMessage,
          flightNumber: serviceType.includes("Airport") ? flightNumber : undefined,
          // New options
          numPassengers,
          numLuggage,
          needCarSeat,
          carSeatType: needCarSeat ? carSeatType : "None",
          meetAndGreet,
          hourlyHours: serviceType === "Hourly Ride" ? hourlyHours : undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setBookingResponse(data);
        setStep(3);
      } else {
        setErrorMsg(`${data.message || "An error occurred while creating your reservation."}${data.error ? ` Details: ${data.error}` : ""}`);
      }
    } catch (err) {
      setErrorMsg("Failed to connect to server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      {/* Top Hero & Discount Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="bg-gradient-to-b from-env-green-light/40 to-white border-b border-slate-200/80 py-8 md:py-10 px-4 text-center relative overflow-hidden"
      >
        <motion.div
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-100/30 to-transparent pointer-events-none"
        />
        <div className="max-w-4xl mx-auto space-y-3 relative z-10">
          <motion.div
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-env-green/10 rounded-full text-env-green text-xs font-mono font-bold tracking-wider uppercase shadow-xs"
          >
            <Leaf size={14} className="animate-pulse" />
            PROUDLY SERVING GREEN TRAVEL IN: Whole USA
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, x: -120 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight"
          >
            Get <span className="text-env-green">5% OFF</span> Your First Ride
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="text-sm md:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed font-sans"
          >
            Complete the form below to receive your personalized quote and claim your exclusive discount today!
          </motion.p>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Main Flow Grid */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Form Card (8 cols) */}
              <div id="form_section" className="lg:col-span-7 bg-white rounded-xl shadow-soft overflow-hidden border border-env">
                <div className="border-b border-env p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2 items-center">
                      <div className="w-6 h-6 rounded-full bg-env-green text-white flex items-center justify-center text-[10px] font-bold">1</div>
                      <span className="text-xs font-bold uppercase tracking-wider text-env-dark">Quote Details</span>
                      <div className="h-[1px] w-8 bg-slate-200"></div>
                      <div className="flex gap-1.5 items-center opacity-40">
                        <div className="w-6 h-6 rounded-full bg-slate-300 text-white flex items-center justify-center text-[10px] font-bold">2</div>
                        <span className="text-xs font-bold uppercase tracking-wider text-env-text">Book</span>
                      </div>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-env-dark">
                        Ride Configuration
                      </h2>
                      <p className="text-xs text-slate-500 font-sans mt-0.5">Step 1: Configure your custom route & view estimates</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-env-green-light/50 border border-env-green/20 rounded-full">
                      <span className="w-2 h-2 rounded-full bg-env-green animate-pulse" />
                      <span className="text-xs font-mono font-bold text-env-green">ONLINE</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleGetQuote} className="p-6 md:p-8 space-y-6">
                  {errorMsg && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                      <p className="text-sm text-red-800 font-sans font-medium">{errorMsg}</p>
                    </div>
                  )}

                  {/* Trip Type and Service Type Selectors */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                        Service Type
                      </label>
                      <select
                        value={serviceType}
                        onChange={(e) => {
                          setServiceType(e.target.value);
                          if (e.target.value !== "Other") {
                            setCustomServiceType("");
                          }
                          if (!e.target.value.includes("Airport")) {
                            setFlightNumber("");
                          }
                        }}
                        className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 px-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-medium font-sans cursor-pointer"
                      >
                        {SERVICES.map((serv) => (
                          <option key={serv} value={serv}>
                            {serv}
                          </option>
                        ))}
                      </select>

                      {serviceType === "Other" && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={customServiceType}
                            onChange={(e) => setCustomServiceType(e.target.value)}
                            placeholder="Specify custom service (e.g. Winery Tour, Road Trip)"
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 px-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
                            required
                          />
                        </div>
                      )}

                      {(serviceType.includes("Airport")) && (
                        <div className="mt-2">
                          <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                            Flight Number
                          </label>
                          <input
                            type="text"
                            value={flightNumber}
                            onChange={(e) => setFlightNumber(e.target.value)}
                            placeholder="e.g. UA123"
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 px-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
                            required
                          />
                        </div>
                      )}
                    </div>

                    {serviceType === "Hourly Ride" ? (
                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          Hours (4 to 12)
                        </label>
                        <select
                          value={hourlyHours}
                          onChange={(e) => setHourlyHours(Number(e.target.value))}
                          className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 px-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-medium font-sans cursor-pointer"
                        >
                          {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                            <option key={h} value={h}>
                              {h} Hours
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-500 font-sans mt-2 leading-relaxed">
                          Note: If you need additional hours beyond your selected time, extra hours will be charged at the applicable hourly rate (Sedan = $50/hour extra, Luxury SUV = $65/hour extra).
                        </p>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          Trip Type
                        </label>
                        <div className="bg-[#E2E8F0] rounded-[20px] p-1 inline-flex w-full">
                          <button
                            type="button"
                            onClick={() => setTripType("Single Trip")}
                            className={`flex-1 py-1 px-4 text-xs font-semibold rounded-[16px] transition-all duration-150 cursor-pointer ${
                              tripType === "Single Trip"
                                ? "bg-white text-env-dark shadow-xs"
                                : "text-env-text hover:text-env-dark"
                            }`}
                          >
                            Single Trip
                          </button>
                          <button
                            type="button"
                            onClick={() => setTripType("Round Trip")}
                            className={`flex-1 py-1 px-4 text-xs font-semibold rounded-[16px] transition-all duration-150 cursor-pointer ${
                              tripType === "Round Trip"
                                ? "bg-white text-env-dark shadow-xs"
                                : "text-env-text hover:text-env-dark"
                            }`}
                          >
                            Round Trip
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Date and Time Selectors */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          Pickup Date
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <CalendarIcon size={16} />
                          </div>
                          <input
                            type="date"
                            value={pickupDate}
                            onChange={(e) => setPickupDate(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans cursor-pointer"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          Pickup Time
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                            <ClockIcon size={16} />
                          </div>
                          <input
                            type="time"
                            value={pickupTime}
                            onChange={(e) => setPickupTime(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans cursor-pointer"
                          />
                        </div>
                      </div>
                    </div>

                    {tripType === "Round Trip" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                            Return Date
                          </label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                              <CalendarIcon size={16} />
                            </div>
                            <input
                              type="date"
                              value={returnDate}
                              onChange={(e) => setReturnDate(e.target.value)}
                              className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans cursor-pointer"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                            Return Time
                          </label>
                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                              <ClockIcon size={16} />
                            </div>
                            <input
                              type="time"
                              value={returnTime}
                              onChange={(e) => setReturnTime(e.target.value)}
                              className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Locations Form Section */}
                  <div className="space-y-4 pt-2 border-t border-env">
                    {/* Location Type Label Bar */}
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-400 mb-1 tracking-wider">
                      <span>LOCATION DETAILS</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-1.5 py-0.5 bg-env-green-light/50 text-env-green rounded font-bold font-sans">
                          United States
                        </span>
                      </div>
                    </div>

                    {/* Pickup Field */}
                    <div>
                      <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                        * Pickup Address
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="text-env-green shrink-0">
                          <MapPin size={16} />
                        </div>
                        <div className="flex-grow">
                          <PlaceAutocompleteInput
                            placeholder="Enter BWI airport, hotel, office, or residence address"
                            value={pickup?.address || ""}
                            onChange={(address, lat, lng) => {
                              if (lat !== undefined && lng !== undefined) {
                                setPickup({
                                  address,
                                  lat,
                                  lng
                                });
                              }
                              else if (!address.trim()) {
                                setPickup(null);
                              }
                              else {
                                setPickup(previous =>
                                  previous
                                    ? {
                                          ...previous,
                                          address
                                      }
                                    : {
                                          address,
                                          lat: undefined,
                                          lng: undefined
                                      }
                                );
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Additional Stops list */}
                    {stops.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          Additional Stops
                        </label>
                        {stops.map((stop, index) => (
                          <StopInput
                            key={stop.id}
                            index={index}
                            value={stop.address}
                            onChange={(address, lat, lng) => 
                              handleStopChange(stop.id, address, lat, lng)
                            }
                            onRemove={() => handleRemoveStop(stop.id)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Add Stop Button */}
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        onClick={handleAddStop}
                        className="text-[10px] font-bold text-env-green hover:text-emerald-800 flex items-center gap-1.5 px-3 py-1.5 bg-env-green-light/40 rounded-[6px] transition-colors border border-[#DCFCE7] cursor-pointer"
                      >
                        <Plus size={14} />
                        + ADD STOP
                      </button>
                      <p className="text-[11px] text-slate-500 font-sans italic mt-1 text-right">
                        {serviceType === "Hourly Ride" ? "Additional stops are free of charge for Hourly Rides." : "Each additional stop adds $15 to your total fare."}
                      </p>
                    </div>

                    {/* Drop-off Field */}
                    <div>
                      <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                        * Drop-off Address
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="text-red-500 shrink-0">
                          <MapPin size={16} />
                        </div>
                        <div className="flex-grow">
                          <PlaceAutocompleteInput
                            placeholder="Enter destination street address, airport, or landmark"
                            value={dropoff?.address || ""}
                            onChange={(address, lat, lng) => {
                              if (lat !== undefined && lng !== undefined) {
                                setDropoff({
                                  address,
                                  lat,
                                  lng
                                });
                              }
                              else if (!address.trim()) {
                                setDropoff(null);
                              }
                              else {
                                setDropoff(previous =>
                                  previous
                                    ? {
                                          ...previous,
                                          address
                                      }
                                    : {
                                          address,
                                          lat: undefined,
                                          lng: undefined
                                      }
                                );
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-env">
                    <button
                      type="button"
                      onClick={() => {
                        setPickup(null);
                        setDropoff(null);
                        setStops([]);
                      }}
                      className="w-full sm:w-auto text-slate-600 hover:text-slate-850 font-sans text-xs font-bold py-2.5 px-5 bg-slate-100 hover:bg-slate-200 rounded-[6px] transition-colors text-center cursor-pointer uppercase tracking-wider"
                    >
                      Clear All
                    </button>

                    <button
                      type="submit"
                      className="w-full sm:w-auto text-white font-semibold text-xs tracking-wider uppercase py-3 px-8 bg-env-green hover:bg-emerald-800 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-soft hover:shadow-lg"
                    >
                      <span>GET A QUOTE</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              </div>

              {/* Map Card (4 cols) */}
              <div id="map_section" className="lg:col-span-5 bg-white rounded-xl shadow-soft overflow-hidden border border-env self-stretch flex flex-col min-h-[420px] lg:min-h-0">
                <div className="border-b border-env p-6 flex items-center gap-2 bg-white">
                  <MapIcon size={18} className="text-env-green" />
                  <h2 className="text-sm font-bold tracking-wider text-env-dark uppercase">
                    ROUTE MAP
                  </h2>
                </div>                 <div className="flex-grow relative bg-env-bg flex flex-col justify-center items-center w-full h-[400px]">
                  <div className="w-full h-full flex-grow relative">
                    <MapErrorBoundary>
                      <GoogleMapComponent 
    pickup={pickup && pickup.lat !== undefined && pickup.lng !== undefined ? pickup : null}
    dropoff={dropoff && dropoff.lat !== undefined && dropoff.lng !== undefined ? dropoff : null}
    stops={stops}
    isHourly={serviceType === "Hourly Ride"}
    onRouteComputed={(d: number, t: number) => { setDistance(d); setTravelTime(t); setIsCalculatingRoute(false); }}
    onErrorComputed={() => { setIsCalculatingRoute(false); }}
/>

                      {/* Floating Overlay displaying computed distance */}
                      {pickup && dropoff && pickup.lat !== undefined && dropoff.lat !== undefined && serviceType !== "Hourly Ride" && (
                        <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-xs shadow-soft rounded-lg border border-env p-3 flex flex-col gap-2 z-10">
                          {isCalculatingRoute ? (
                            <div className="text-center py-2 text-sm font-sans text-slate-500">Calculating route...</div>
                          ) : distance > 0 ? (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">Calculated route (Estimate)</p>
                                <div className="flex gap-4 mt-1">
                                  <div>
                                    <p className="text-xl font-bold text-env-dark">{distance.toFixed(1)}</p>
                                    <p className="text-xs text-slate-500">miles</p>
                                  </div>
                                  <div>
                                    <p className="text-xl font-bold text-env-dark">{travelTime}</p>
                                    <p className="text-xs text-slate-500">minutes</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </MapErrorBoundary>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Vehicle Options Column (8 cols) */}
              <div id="vehicle_section" className="lg:col-span-8 bg-white rounded-xl shadow-soft overflow-hidden border border-env">
                <div className="border-b border-env p-6 bg-white">
                  <h2 className="text-sm font-bold tracking-wider text-env-dark uppercase">
                    VEHICLE SELECTION
                  </h2>
                  <p className="text-[11px] text-slate-500 font-sans mt-1">Step 2: Choose your vehicle class and provide contact info</p>
                </div>

                <div className="p-4 md:p-6 space-y-4">
                  {errorMsg && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-md flex items-start gap-3">
                      <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs text-red-800 font-sans font-medium">{errorMsg}</p>
                    </div>
                  )}

                  <p className="text-xs text-slate-600 font-sans mb-3">
                    Select vehicle type by clicking on vehicle image
                  </p>

                  {serviceType === "Group Transportation" ? (
                    <div className="space-y-4">
                      <div className="bg-env-green-light/40 border border-env-green/30 rounded-xl p-4 flex items-center gap-3">
                        <Sparkles size={18} className="text-env-green shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-env-dark uppercase tracking-wider">Group Transportation & Executive Shuttles</p>
                          <p className="text-xs text-slate-600 font-sans mt-0.5">Select your group vehicle below. Custom quotes provided upon request.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {VEHICLE_TYPES.filter(v => v.isPriced === false).map((vehicle) => {
                          const isSelected = selectedVehicle === vehicle.id;
                          return (
                            <div
                              key={vehicle.id}
                              onClick={() => setSelectedVehicle(vehicle.id)}
                              className={`relative bg-white border rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                                isSelected
                                  ? "border-env-green ring-2 ring-env-green-light/60 shadow-soft"
                                  : "border-env hover:border-env-green/50 hover:shadow-soft"
                              }`}
                            >
                              <div className="flex-grow">
                                <div className="flex items-center justify-between">
                                  <h4 className="font-semibold text-env-dark text-xs tracking-tight">{vehicle.name}</h4>
                                  {isSelected && (
                                    <div className="bg-env-green text-white p-0.5 rounded-full shadow-soft shrink-0">
                                      <Check size={10} strokeWidth={3} />
                                    </div>
                                  )}
                                </div>
                                <p className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">{vehicle.tagline}</p>
                              </div>

                              <div className="mt-3 pt-2 border-t border-slate-100 text-slate-500 text-[10px] font-sans">
                                <span className="flex items-center gap-1">
                                  <Users size={11} className="text-slate-400" /> {vehicle.passengers} passengers, {vehicle.luggage} bags
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Vehicle selection list - Keep only 2 priced vehicles */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {VEHICLE_TYPES.filter(v => v.isPriced !== false).map((vehicle) => {
                          const isSelected = selectedVehicle === vehicle.id;
                          return (
                            <div
                              key={vehicle.id}
                              onClick={() => setSelectedVehicle(vehicle.id)}
                              className={`relative bg-white border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 group flex flex-col justify-between ${
                                isSelected
                                  ? "border-env-green ring-2 ring-env-green-light/60 shadow-soft"
                                  : "border-env hover:border-env-green/50 hover:shadow-soft"
                              }`}
                            >
                              <div className="aspect-[16/10] bg-env-bg relative overflow-hidden">
                                <img
                                  src={vehicle.image}
                                  alt={vehicle.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                                />
                                {isSelected && (
                                  <div className="absolute top-3 right-3 bg-env-green text-white p-1 rounded-full shadow-soft">
                                    <Check size={16} strokeWidth={3} />
                                  </div>
                                )}
                                <div className="absolute bottom-2 left-3 bg-env-green-light/90 backdrop-blur-xs text-env-green font-mono text-[9px] font-bold px-2.5 py-0.5 rounded-[4px] border border-[#DCFCE7]">
                                  {vehicle.tagline}
                                </div>
                              </div>

                              <div className="p-4 border-t border-env flex-grow flex flex-col justify-between">
                                <div className="mb-2">
                                  <h3 className="font-semibold text-env-dark text-sm tracking-tight">{vehicle.name}</h3>
                                  <div className="flex items-center gap-2 text-xs text-slate-600 font-sans mt-1">
                                    <span className="flex items-center gap-1">
                                      <Users size={12} className="text-slate-400" /> {vehicle.passengers} passengers, {vehicle.luggage} bags
                                    </span>
                                  </div>
                                </div>

                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">PRICING</span>
                                  <div className="text-right">
                                    {serviceType === "Hourly Ride" ? (
                                      <p className="font-bold text-env-green text-xs">{vehicle.name} — ${vehicle.hourlyRate}/hour</p>
                                    ) : (
                                      <>
                                        <p className="font-bold text-env-green text-xs">Hourly: ${vehicle.hourlyRate}/hour</p>
                                        <p className="font-bold text-env-green text-xs">Mileage: ${vehicle.mileageRate}/mile</p>
                                      </>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-env flex items-center justify-between bg-env-bg -mx-4 -mb-4 p-3.5">
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">YOUR QUOTE</span>
                                  <span className="text-xs font-bold text-env-dark font-mono">
                                    {hasStandardPricing ? (
                                      <>USD ${calculatePrice(vehicle.id).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                                    ) : (
                                      <span className="text-[10px] text-amber-600 font-sans font-semibold">TBD (Custom)</span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* OTHER VEHICLES AVAILABLE - REQUEST A QUOTE */}
                      <div className="mt-8 bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
                          <Sparkles size={16} className="text-env-green" />
                          <h4 className="text-[11px] font-bold text-env-dark uppercase tracking-wider">
                            OTHER VEHICLES AVAILABLE — REQUEST A QUOTE
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 font-sans leading-relaxed">
                          These specialized luxury and group vehicles are available upon request. Select a class below to include it in your custom quote request.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                          {VEHICLE_TYPES.filter(v => v.isPriced === false).map((vehicle) => {
                            const isSelected = selectedVehicle === vehicle.id;
                            return (
                              <div
                                key={vehicle.id}
                                onClick={() => setSelectedVehicle(vehicle.id)}
                                className={`relative bg-white border rounded-xl p-4 cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                                  isSelected
                                    ? "border-env-green ring-2 ring-env-green-light/60 shadow-soft"
                                    : "border-env hover:border-env-green/50 hover:shadow-soft"
                                }`}
                              >
                                <div className="flex-grow">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-env-dark text-xs tracking-tight">{vehicle.name}</h4>
                                    {isSelected && (
                                      <div className="bg-env-green text-white p-0.5 rounded-full shadow-soft shrink-0">
                                        <Check size={10} strokeWidth={3} />
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[9px] font-mono text-slate-400 uppercase tracking-wider mt-0.5">{vehicle.tagline}</p>
                                </div>

                                <div className="mt-3 pt-2 border-t border-slate-100 text-slate-500 text-[10px] font-sans">
                                  <span className="flex items-center gap-1">
                                    <Users size={11} className="text-slate-400" /> {vehicle.passengers} passengers, {vehicle.luggage} bags
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Passenger Specifications & Requirements */}
                  <div className="bg-env-bg rounded-xl p-5 border border-env mt-6 space-y-5">
                    <h4 className="text-[11px] font-bold text-env-dark uppercase tracking-wider border-b border-slate-200 pb-2 flex items-center gap-1.5">
                      <Users size={14} className="text-env-green" />
                      Passenger Specifications & Options
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Passenger Count Stepper */}
                      <div className="bg-white p-4 rounded-lg border border-env flex items-center justify-between shadow-xs">
                        <div>
                          <p className="text-xs font-bold text-env-dark font-sans flex items-center gap-1">
                            Number of Passengers
                          </p>
                          <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                            Max {(VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[0]).passengers} for this class
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setNumPassengers(Math.max(1, numPassengers - 1))}
                            className="w-8 h-8 rounded-full border border-[#CBD5E1] bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-env-dark font-mono w-4 text-center">
                            {numPassengers}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const limit = (VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[0]).passengers;
                              setNumPassengers(Math.min(limit, numPassengers + 1));
                            }}
                            className="w-8 h-8 rounded-full border border-[#CBD5E1] bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Luggage Bags Stepper */}
                      <div className="bg-white p-4 rounded-lg border border-env flex items-center justify-between shadow-xs">
                        <div>
                          <p className="text-xs font-bold text-env-dark font-sans flex items-center gap-1">
                            Number of Luggage/Bags
                          </p>
                          <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                            Max {(VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[0]).luggage} for this class
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setNumLuggage(Math.max(0, numLuggage - 1))}
                            className="w-8 h-8 rounded-full border border-[#CBD5E1] bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-env-dark font-mono w-4 text-center">
                            {numLuggage}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const limit = (VEHICLE_TYPES.find(v => v.id === selectedVehicle) || VEHICLE_TYPES[0]).luggage;
                              setNumLuggage(Math.min(limit, numLuggage + 1));
                            }}
                            className="w-8 h-8 rounded-full border border-[#CBD5E1] bg-slate-50 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Child Car Seat Checkbox & Type Selection */}
                    <div className="bg-white p-4 rounded-lg border border-env space-y-4 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-env-dark font-sans flex items-center gap-1">
                            Child Car Seat Required?
                          </p>
                          <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                            Safety first for our youngest passengers
                          </p>
                        </div>
                        <div
                          onClick={() => setNeedCarSeat(!needCarSeat)}
                          className="relative cursor-pointer"
                        >
                          <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${needCarSeat ? 'bg-env-green' : 'bg-slate-200'}`}>
                            <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-soft transition-transform duration-200 ${needCarSeat ? 'translate-x-5' : 'translate-x-0'}`} />
                          </div>
                        </div>
                      </div>
                      
                      {/* Meet & Greet */}
                      <div className="pt-3 border-t border-slate-150 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-env-dark font-sans flex items-center gap-1">
                            Meet & Greet Service
                          </p>
                          <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                            Chauffeur will meet you with a sign (+$25)
                          </p>
                        </div>
                        <div
                          onClick={() => setMeetAndGreet(!meetAndGreet)}
                          className="relative cursor-pointer"
                        >
                          <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${meetAndGreet ? 'bg-env-green' : 'bg-slate-200'}`}>
                            <div className={`absolute top-0.5 left-0.5 bg-white w-5 h-5 rounded-full shadow-soft transition-transform duration-200 ${meetAndGreet ? 'translate-x-5' : 'translate-x-0'}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>



                  {/* Custom Checkboxes Area */}
                  <div className="bg-env-bg rounded-xl p-5 border border-env mt-6">
                    <h4 className="text-[11px] font-bold text-env-text uppercase tracking-wider mb-3">
                      Need specialized group arrangements, hourly service, or other support?
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { id: "SpecialRequest", label: "Custom Setup Request", desc: "Special requests & setups" },
                        { id: "Group", label: "Group Event Coordination", desc: "For large parties & groups" },
                        { id: "Hourly", label: "Hourly Chauffeur Service", desc: "Flexible travel booked by hour" },
                      ].map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (customRideRequest === item.label) {
                              setCustomRideRequest(null);
                            } else {
                              setCustomRideRequest(item.label);
                            }
                          }}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                            customRideRequest === item.label
                              ? "bg-env-green-light/20 border-env-green text-env-dark"
                              : "bg-white border-[#CBD5E1] text-slate-700 hover:bg-env-bg"
                          }`}
                        >
                          <div className="mt-1">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              customRideRequest === item.label 
                                ? "bg-env-green border-env-green text-white" 
                                : "border-slate-300 bg-white"
                            }`}>
                              {customRideRequest === item.label && <Check size={10} strokeWidth={4} />}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-env-dark font-sans">{item.label}</p>
                            <p className="text-[10px] text-slate-500 font-sans mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {customRideRequest && (
                      <p className="text-[11px] text-env-green font-semibold mt-3 flex items-center gap-1.5 bg-env-green-light/40 p-2.5 rounded border border-[#DCFCE7]">
                        <Sparkles size={14} className="text-env-green animate-pulse" />
                        <span>Our team will contact you shortly regarding custom pricing and setups for your requested service ({customRideRequest}).</span>
                      </p>
                    )}
                  </div>

                  {/* Customer Information (Auth & Contacts) */}
                  <div className="pt-6 border-t border-env space-y-4">
                    <h3 className="text-[11px] font-bold text-env-text uppercase tracking-wider mb-2">
                      CONTACT & RESERVATION INFO
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          * Full Name
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <User size={16} />
                          </div>
                          <input
                            type="text"
                            placeholder="John Doe"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          * Email Address
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <Mail size={16} />
                          </div>
                          <input
                            type="email"
                            placeholder="john@example.com"
                            value={clientEmail}
                            onChange={(e) => setClientEmail(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                          * Phone Number
                        </label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <Phone size={16} />
                          </div>
                          <input
                            type="tel"
                            placeholder="(443) 555-0199"
                            value={clientPhone}
                            onChange={(e) => setClientPhone(e.target.value)}
                            className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 pl-9 pr-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-[11px] font-bold text-env-text uppercase tracking-wider mb-1">
                        Message (Optional)
                      </label>
                      <textarea
                        placeholder="Write any additional instructions, requests, or notes (optional)"
                        value={clientMessage}
                        onChange={(e) => setClientMessage(e.target.value)}
                        rows={3}
                        className="w-full bg-white border border-[#CBD5E1] rounded-[6px] py-2 px-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-env-green focus:border-env-green text-sm font-sans resize-y"
                      />
                    </div>
                  </div>

                  {/* Actions Area */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-env">
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-1/2 sm:w-auto text-slate-600 hover:text-slate-850 font-sans text-xs font-bold py-2.5 px-5 bg-slate-100 hover:bg-[#E2E8F0] rounded-[6px] transition-colors text-center cursor-pointer uppercase tracking-wider"
                        disabled={isSubmitting}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep(1);
                          setPickup(null);
                          setDropoff(null);
                          setStops([]);
                        }}
                        className="w-1/2 sm:w-auto text-red-600 hover:text-red-800 font-sans text-xs font-bold py-2.5 px-5 bg-red-50 hover:bg-red-100 rounded-[6px] transition-colors text-center cursor-pointer border border-red-150 uppercase tracking-wider"
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateReservation}
                      disabled={isSubmitting}
                      className="w-full sm:w-auto text-white font-semibold text-xs tracking-wider uppercase py-3.5 px-10 bg-env-green hover:bg-emerald-800 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer shadow-soft hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>CREATING RESERVATION...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={18} />
                          <span>CREATE RESERVATION</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Price Quote Details (4 cols) */}
              <div id="summary_section" className="lg:col-span-4 bg-white rounded-2xl shadow-soft overflow-hidden border border-slate-200/80 self-stretch flex flex-col justify-between">
                <div>
                  <div className="border-b border-slate-100 px-8 py-6 bg-gradient-to-r from-slate-50/80 to-white flex items-center justify-between">
                    <div>
                      <h2 className="text-xs font-bold tracking-widest text-env-dark uppercase">
                        Price Quote Details
                      </h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">Transparent fare & itinerary summary</p>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-env-green-light/40 flex items-center justify-center text-env-green">
                      <ShieldCheck size={16} />
                    </div>
                  </div>

                  <div className="p-8 space-y-6 font-sans">
                    {/* Pricing Breakdown Component */}
                    {hasStandardPricing && (
                      <div className="bg-slate-50/70 rounded-2xl p-6 border border-slate-200/60 shadow-sm space-y-4">
                         <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                           <h4 className="text-xs font-bold text-env-dark uppercase tracking-wider flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-env-green"></span>
                             Fare Breakdown
                           </h4>
                           <span className="text-[11px] font-mono text-slate-500 font-medium">Real-time estimate</span>
                         </div>
                         {(() => {
                           const travelTimeHours = travelTime > 0 ? (travelTime / 60) : (distance / 30);
                           const fare = calculateFare(selectedVehicle, distance, travelTimeHours, {
                             meetAndGreet,
                             addStops: stops.filter(s => s.address && s.address.trim() !== "").length,
                             childSeat: needCarSeat
                           }, tripType === "Round Trip", serviceType, hourlyHours);
                           const vehicle = VEHICLE_TYPES.find(v => v.id === selectedVehicle);
                           return (
                             <div className="space-y-3 text-xs text-slate-600">
                               {serviceType === "Hourly Ride" && !vehicle?.isPriced ? (
                                 <div className="bg-white rounded-xl p-5 border border-slate-200 text-center space-y-3 my-2">
                                   <Sparkles size={22} className="text-env-green mx-auto" />
                                   <p className="text-xs font-semibold text-env-dark font-sans leading-relaxed">
                                     Thank you! Our team will contact you shortly to discuss availability and pricing.
                                   </p>
                                 </div>
                               ) : serviceType === "Hourly Ride" ? (
                                 <>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Service</span>
                                     <span className="text-right font-semibold text-slate-800">Hourly Ride</span>
                                   </div>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Vehicle</span>
                                     <span className="text-right font-semibold text-slate-800">{vehicle?.name}</span>
                                   </div>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Hourly Rate</span>
                                     <span className="text-right font-mono font-semibold text-slate-800">${vehicle?.hourlyRate}/hour</span>
                                   </div>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Billable Hours</span>
                                     <span className="text-right font-mono font-semibold text-slate-800">{fare.billableHours.toFixed(1)} Hours</span>
                                   </div>

                                   <div className="pt-2 pb-1">
                                     <p className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 mb-2">Base Calculation</p>
                                     <div className="space-y-2 pl-2 border-l-2 border-env-green/30">
                                       <div className="flex justify-between"><span className="text-slate-500">Hourly Fare</span> <span className="font-mono text-slate-700">${fare.hourlyCharge.toFixed(2)}</span></div>
                                     </div>
                                   </div>

                                   <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                                     <span>Base Fare</span>
                                     <span className="font-mono">${fare.baseFare.toFixed(2)}</span>
                                   </div>

                                   <div className="pt-2 space-y-1.5 text-[11px] text-slate-500 border-t border-slate-200/60">
                                     <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Add-ons</p>
                                     <div className="flex justify-between"><span>Meet & Greet</span> <span className="font-mono">${fare.meetAndGreet.toFixed(2)}</span></div>
                                     <div className="flex justify-between"><span>Child Seat</span> <span className="font-mono">${fare.childSeat.toFixed(2)}</span></div>
                                     <div className="flex justify-between"><span>Additional Stops</span> <span className="font-mono">$0.00</span></div>
                                   </div>

                                   <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                                     <span>Subtotal</span>
                                     <span className="font-mono">${fare.subtotal.toFixed(2)}</span>
                                   </div>

                                   <div className="pt-2 space-y-1.5 text-[11px] text-slate-500 border-t border-slate-200/60">
                                     <div className="flex justify-between"><span>Driver Fee (20%)</span> <span className="font-mono">${fare.driverFee.toFixed(2)}</span></div>
                                     <div className="flex justify-between"><span>Sales Tax (3.3%)</span> <span className="font-mono">${fare.salesTax.toFixed(2)}</span></div>
                                   </div>

                                   <div className="flex justify-between items-center font-bold text-base text-env-green border-t-2 border-slate-300 pt-3 mt-3">
                                     <span>Grand Total</span>
                                     <span className="font-mono text-xl">${fare.total.toFixed(2)}</span>
                                   </div>
                                   {serviceType === "Hourly Ride" && (
                                     <p className="text-xs font-semibold text-slate-700 mt-2.5">*Tolls may apply based on the required service and route.</p>
                                   )}
                                 </>
                               ) : (
                                 <>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Vehicle</span>
                                     <span className="text-right font-semibold text-slate-800">{vehicle?.name}</span>
                                   </div>
                                   <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                     <span className="text-slate-400 font-medium">Trip Type</span>
                                     <span className="text-right font-semibold text-slate-800">{tripType}</span>
                                   </div>
                               <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                 <span className="text-slate-400 font-medium">Total Distance</span>
                                 <span className="text-right font-mono font-semibold text-slate-800">{fare.distance.toFixed(1)} mi</span>
                               </div>
                               <div className="grid grid-cols-2 py-1 border-b border-slate-200/60">
                                 <span className="text-slate-400 font-medium">Billable Hours</span>
                                 <span className="text-right font-mono font-semibold text-slate-800">{fare.billableHours.toFixed(1)} hrs</span>
                               </div>

                               <div className="pt-2 pb-1">
                                 <p className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 mb-2">Base Calculation</p>
                                 <div className="space-y-2 pl-2 border-l-2 border-env-green/30">
                                   <div className="flex justify-between"><span className="text-slate-500">Hourly ({vehicle?.hourlyRate}/hr)</span> <span className="font-mono text-slate-700">${fare.hourlyCharge.toFixed(2)}</span></div>
                                   <div className="flex justify-between"><span className="text-slate-500">Mileage ({vehicle?.mileageRate}/mi)</span> <span className="font-mono text-slate-700">${fare.mileageCharge.toFixed(2)}</span></div>
                                 </div>
                               </div>

                               <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                                 <span>Base Fare</span>
                                 <span className="font-mono">${fare.baseFare.toFixed(2)}</span>
                               </div>

                               {(fare.meetAndGreet > 0 || fare.addStops > 0 || fare.childSeat > 0) && (
                                 <div className="pt-2 space-y-1.5 text-[11px] text-slate-500 border-t border-slate-200/60">
                                   <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Add-ons</p>
                                   {fare.meetAndGreet > 0 && <div className="flex justify-between"><span>Meet & Greet</span> <span className="font-mono">${fare.meetAndGreet.toFixed(2)}</span></div>}
                                   {fare.addStops > 0 && <div className="flex justify-between"><span>Additional Stops</span> <span className="font-mono">${fare.addStops.toFixed(2)}</span></div>}
                                   {fare.childSeat > 0 && <div className="flex justify-between"><span>Child Seat</span> <span className="font-mono">${fare.childSeat.toFixed(2)}</span></div>}
                                 </div>
                               )}

                               <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-2.5">
                                 <span>Subtotal</span>
                                 <span className="font-mono">${fare.subtotal.toFixed(2)}</span>
                               </div>

                               <div className="pt-2 space-y-1.5 text-[11px] text-slate-500 border-t border-slate-200/60">
                                 <div className="flex justify-between"><span>Driver Fee (20%)</span> <span className="font-mono">${fare.driverFee.toFixed(2)}</span></div>
                                 <div className="flex justify-between"><span>Sales Tax (3.3%)</span> <span className="font-mono">${fare.salesTax.toFixed(2)}</span></div>
                               </div>

                               <div className="flex justify-between items-center font-bold text-base text-env-green border-t-2 border-slate-300 pt-3 mt-3">
                                 <span>Grand Total</span>
                                 <span className="font-mono text-xl">${fare.total.toFixed(2)}</span>
                               </div>
                                 </>
                               )}
                             </div>
                           );
                         })()}
                      </div>
                    )}
                    {/* Itinerary & Logistics Section */}
                    <div className="space-y-4 pt-2">
                      <p className="text-[10px] font-mono font-bold tracking-widest text-slate-400 uppercase">Itinerary & Logistics</p>

                      {/* Pickup Date & Time */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
                        <div className="w-9 h-9 rounded-xl bg-env-green-light/60 flex items-center justify-center text-env-green shrink-0">
                          <CalendarIcon size={18} />
                        </div>
                        <div className="flex-grow">
                          <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">Date & Time</p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5">
                            {new Date(pickupDate + "T00:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              year: "numeric"
                            })}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1 font-medium">
                            <ClockIcon size={12} className="text-env-green" />
                            {pickupTime}
                          </p>
                        </div>
                      </div>

                      {/* Pickup Location */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
                        <div className="w-9 h-9 rounded-xl bg-env-green-light/60 flex items-center justify-center text-env-green shrink-0">
                          <MapPin size={18} />
                        </div>
                        <div className="flex-grow">
                          <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">Pickup Location</p>
                          <p className="text-xs font-medium text-slate-700 mt-1 leading-relaxed">
                            {pickup?.address}
                          </p>
                        </div>
                      </div>

                      {/* Stops List */}
                      {stops.length > 0 && (
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
                          <div className="w-9 h-9 rounded-xl bg-env-green-light/60 flex items-center justify-center text-env-green shrink-0">
                            <MapIcon size={18} />
                          </div>
                          <div className="space-y-2.5 flex-grow">
                            <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">Additional Stops ({stops.length})</p>
                            {stops.map((stop, idx) => (
                              <div key={stop.id} className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs flex items-start gap-2">
                                <span className="font-bold text-env-green text-[9px] uppercase font-mono px-1.5 py-0.5 bg-env-green-light/40 rounded">Stop {idx + 1}</span>
                                <span className="leading-normal">{stop.address}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Drop-off Location */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
                        <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 border border-rose-100 shrink-0">
                          <MapPin size={18} />
                        </div>
                        <div className="flex-grow">
                          <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">Drop-off Location</p>
                          <p className="text-xs font-medium text-slate-700 mt-1 leading-relaxed">
                            {dropoff?.address}
                          </p>
                        </div>
                      </div>

                      {/* Vehicle & Specs */}
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50/50 border border-slate-200/60">
                        <div className="w-9 h-9 rounded-xl bg-env-green-light/60 flex items-center justify-center text-env-green shrink-0">
                          <Users size={18} />
                        </div>
                        <div className="flex-grow">
                          <p className="text-[10px] font-mono font-semibold text-slate-400 uppercase">Vehicle & Passengers</p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5">
                            {VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.name || selectedVehicle}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-500 font-medium">
                            <span className="bg-white px-2 py-1 rounded border border-slate-200">Passengers: {numPassengers}</span>
                            <span className="bg-white px-2 py-1 rounded border border-slate-200">Luggage: {numLuggage}</span>
                            {needCarSeat && (
                              <span className="bg-env-green-light/60 text-env-green px-2 py-1 rounded border border-env-green/20 font-semibold">Seat: {carSeatType}</span>
                            )}
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Service Area Status Banner */}
                    {!hasStandardPricing && (
                      <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-4 text-xs text-amber-900 leading-relaxed flex items-start gap-3">
                        <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                        <div>
                          <p className="font-bold uppercase tracking-wider text-amber-900 text-[11px]">Outside Standard Service Area</p>
                          <p className="font-sans mt-1 text-amber-800">Please contact us at <a href="mailto:info@enviroride.net" className="underline font-bold text-amber-900">info@enviroride.net</a> for a manual custom quote.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-6 border-t border-slate-950 flex flex-col justify-end">
                  {serviceType === "Group Transportation" ? (
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">
                        CUSTOM QUOTE REQUIRED
                      </p>
                      <p className="text-xs text-slate-300 font-sans leading-relaxed">
                        Thank you for your request! Our team will contact you shortly to confirm availability and provide you with a personalized quote.
                      </p>
                    </div>
                  ) : VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.isPriced === false ? (
                    <div className="space-y-1">
                      <p className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-wider">
                        CUSTOM QUOTE REQUIRED
                      </p>
                      <p className="text-xs text-slate-300 font-sans leading-relaxed">
                        {serviceType === "Hourly Ride"
                          ? "Thank you! Our team will contact you shortly to discuss availability and pricing."
                          : `Selected Vehicle: ${VEHICLE_TYPES.find(v => v.id === selectedVehicle)?.name || selectedVehicle} — Custom quote required. Our team will contact you with pricing.`}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-mono font-bold text-env-green uppercase tracking-wider">
                          {hasStandardPricing ? "ESTIMATED PRICE" : "CUSTOM QUOTE REQUIRED"}
                        </p>
                        <p className="text-xs font-semibold text-slate-200 mt-0.5 font-sans">
                          {serviceType === "Hourly Ride"
                            ? "Tolls may apply based on the required service and route."
                            : (hasStandardPricing ? "Fuel, toll, and clean ride included" : "Manual dispatch review")}
                        </p>
                      </div>
                      <div className="text-right">
                        {hasStandardPricing ? (
                          <div className="font-bold text-lg text-env-green">
                            ${calculatePrice(selectedVehicle).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        ) : (
                          <span className="text-sm font-bold text-amber-500 font-sans tracking-wide">
                            TBD (Email Sent)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && bookingResponse && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl mx-auto bg-white rounded-xl shadow-soft overflow-hidden border border-env"
            >
              <div className="bg-slate-900 text-white p-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-5 pointer-events-none">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-white rounded-full blur-3xl" />
                </div>

                <div className="w-16 h-16 bg-env-green text-white rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500 shadow-soft">
                  <CheckCircle2 size={32} className="text-white" />
                </div>

                <h1 className="text-xl md:text-2xl font-bold mb-2">
                  Reservation Created!
                </h1>
                <p className="text-slate-300 font-sans text-xs max-w-md mx-auto">
                  Thank you for booking your green transport with EnviroRide. Your request was successfully submitted to our dispatch team.
                </p>

                <div className="mt-6 inline-block bg-slate-800/60 border border-slate-700 rounded-lg px-6 py-2">
                  <p className="text-[9px] font-mono font-bold text-env-green uppercase tracking-wider">Booking Confirmation ID</p>
                  <p className="text-base font-mono font-bold text-white mt-0.5">{bookingResponse.bookingId}</p>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-[11px] font-bold text-env-text uppercase tracking-wider mb-2">What Happens Next?</h3>
                  <div className="space-y-3">
                    {[
                      "We have dispatched booking notification details immediately to info@enviroride.net.",
                      "A detailed confirmation summary email was sent to your inbox.",
                      "An EnviroRide dispatch supervisor will call or Email you shortly to confirm the pickup timing and chauffeur availability.",
                    ].map((stepText, idx) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <div className="w-5 h-5 rounded-full bg-env-green-light/50 text-env-green flex items-center justify-center font-mono font-bold text-[10px] border border-[#DCFCE7] shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <p className="text-xs text-slate-600 font-sans leading-relaxed">{stepText}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {bookingResponse.simulated && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 leading-normal mt-4">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                      <div>
                        <p className="font-bold uppercase tracking-wide text-amber-900 text-xs font-mono">⚠️ Mail Dispatch Fallback (Simulation Mode Active)</p>
                        <p className="text-xs font-sans mt-1">
                          The email server rejected the login credentials with a <strong>535 5.7.139 Authentication unsuccessful</strong> error.
                        </p>
                        <p className="text-xs font-sans mt-2 font-semibold text-amber-950">
                          How to resolve this in Microsoft 365 / Outlook:
                        </p>
                        <ul className="list-disc pl-4 mt-1 space-y-1 text-xs font-sans text-amber-900">
                          <li><strong>Multi-Factor Authentication (MFA):</strong> If MFA is enabled on <em>info@enviroride.net</em>, a standard account password will not work. You <strong>MUST</strong> generate an <strong>App Password</strong> in your Microsoft Account Security settings and save it as your <code>SMTP_PASS</code> secret.</li>
                          <li><strong>Check Credentials:</strong> Ensure the <code>SMTP_USER</code> matches <em>info@enviroride.net</em> and the <code>SMTP_PASS</code> is typed correctly.</li>
                          <li><strong>Security Defaults:</strong> Ensure basic authentication (SMTP AUTH) isn't blocked by Microsoft Tenant Security Defaults or Conditional Access policies.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {customRideRequest && (
                  <div className="p-4 bg-env-green-light/20 rounded-lg border border-env-green/30 text-env-dark">
                    <p className="text-xs font-bold font-sans flex items-center gap-1.5 text-env-dark">
                      <Sparkles size={16} className="text-env-green" />
                      Custom Service Notification: {customRideRequest}
                    </p>
                    <p className="text-xs text-slate-600 font-sans mt-1 leading-relaxed">
                      Since you requested a special coach (Mercedes Sprinter, Group, or Hourly), our dedicated coordinator will reach out directly to coordinate custom routing, premium amenities, and exact hour thresholds.
                    </p>
                  </div>
                )}

                <div className="bg-env-bg p-4 rounded-xl border border-env flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h4 className="text-xs font-bold font-sans text-env-dark">Need immediate assistance?</h4>
                    <p className="text-[11px] text-slate-500 font-sans">Contact our 24/7 client dispatch hotline</p>
                  </div>
                  <div className="flex gap-3">
                    <a
                      href="mailto:info@enviroride.net"
                      className="text-xs font-bold text-env-green hover:text-emerald-800 bg-env-green-light/40 hover:bg-env-green-light px-3.5 py-2 rounded-[6px] transition-colors border border-[#DCFCE7] uppercase tracking-wider"
                    >
                      Email info@enviroride.net
                    </a>
                  </div>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setPickup(null);
                      setDropoff(null);
                      setStops([]);
                      setSelectedVehicle("Sedan");
                      setCustomRideRequest(null);
                      setClientName("");
                      setClientEmail("");
                      setClientPhone("");
                    }}
                    className="text-slate-600 hover:text-slate-850 font-sans text-xs font-bold py-2.5 px-6 bg-slate-100 hover:bg-[#E2E8F0] rounded-[6px] transition-colors text-center cursor-pointer uppercase tracking-wider"
                  >
                    Create Another Booking
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Map key error instructions component (Rule 1C)
function GoogleMapsApiKeyRequiredSplash() {
  return (
    <div className="min-h-screen bg-env-bg flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-soft p-8 border border-env">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-env-green-light/50 rounded-full flex items-center justify-center text-env-green mb-6 border border-[#DCFCE7]">
            <Leaf size={32} className="animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-env-dark tracking-tight">
            Google Maps API Key Required
          </h2>
          <p className="mt-2 text-xs text-slate-500 font-sans leading-relaxed">
            EnviroRide requires a valid Google Maps Platform API Key to compute routing distances, provide place autocompletes, and render map routes.
          </p>
        </div>

        <div className="mt-6 space-y-4 font-sans text-sm text-slate-700">
          <div className="p-4 bg-env-green-light/20 rounded-lg border border-env-green/20">
            <p className="text-xs font-bold text-env-green">
              Step 1: Get an API Key
            </p>
            <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
              Create a project and retrieve a key via the Google Maps Platform Portal:
            </p>
            <a
              href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-env-green hover:text-emerald-800 mt-2 bg-white px-3 py-1.5 rounded-[6px] shadow-soft border border-[#DCFCE7]"
            >
              Get API Key <ChevronRight size={14} />
            </a>
          </div>

          <div className="space-y-2 border-l-2 border-env-green pl-4 py-1">
            <p className="text-xs font-bold text-env-dark">
              Step 2: Add your key in AI Studio Secrets
            </p>
            <ol className="list-decimal list-inside text-xs text-slate-500 space-y-1.5">
              <li>Open <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
              <li>Select <strong>Secrets</strong></li>
              <li>Type <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold text-slate-850">GOOGLE_MAPS_PLATFORM_KEY</code>, press <strong>Enter</strong></li>
              <li>Paste your API key as the value, press <strong>Enter</strong></li>
            </ol>
          </div>
          
          <div className="text-center text-[10px] text-slate-400 pt-4 border-t border-env">
            The applet dev server will rebuild automatically once the key is saved.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mapsKey, setMapsKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/config/maps-key");
        if (res.ok) {
          const data = await res.json();
          setMapsKey(data.apiKey || null);
        }
      } catch (err) {
        console.error("Failed to fetch maps API key:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchConfig();
  }, []);

  if (window.location.pathname === "/admin" || window.location.pathname === "/Reservation-System-Admin-Login") {
    return <AdminDashboard />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-env-bg text-slate-900 font-sans flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-env-green border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm font-medium text-slate-600">Loading application...</p>
        </div>
      </div>
    );
  }

  const activeKey = mapsKey || API_KEY;
  const isKeyValid = Boolean(activeKey) && activeKey !== "YOUR_GOOGLE_MAPS_KEY" && activeKey !== "";

  if (!isKeyValid) {
    return <GoogleMapsApiKeyRequiredSplash />;
  }

  return (
    <APIProvider apiKey={activeKey} version="weekly">
      <div className="min-h-screen bg-env-bg text-slate-900 font-sans flex flex-col justify-between">
        {/* Main Content Area */}
        <main className="flex-grow">
          <BookingSystemContent />
        </main>
      </div>
    </APIProvider>
  );
}
