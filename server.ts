import express from "express";
import path from "path";
import dotenv from "dotenv";
import { Resend } from 'resend';
import { createServer as createViteServer } from "vite";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, doc, getDoc, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import crypto from "crypto";

// Load environment variables
dotenv.config();

import firebaseConfig from './firebase-applet-config.json';

// Initialize Client-side Firebase inside server.ts using the applet config
console.log("[DEBUG] Initializing Client Firebase SDK in server for project:", firebaseConfig.projectId, "with database:", firebaseConfig.firestoreDatabaseId);
const clientApp = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId
});

const db = getFirestore(clientApp, firebaseConfig.firestoreDatabaseId || "(default)");

// Helper to hash passwords securely using Node's native crypto module
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Helper to check if a specific time falls within a shift
function isTimeInShift(timeStr: string, startStr: string, endStr: string): boolean {
  if (!timeStr || !startStr || !endStr) return false;
  // Convert HH:MM to minutes from midnight
  const [h, m] = timeStr.split(':').map(Number);
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  
  if (isNaN(h) || isNaN(m) || isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) {
    return false;
  }
  
  const time = h * 60 + m;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  
  if (start === end) return true;
  
  if (start <= end) {
    // Normal interval (e.g. 08:00 to 16:00)
    return time >= start && time < end;
  } else {
    // Wrap-around interval (e.g. 22:00 to 06:00)
    return time >= start || time < end;
  }
}

// Seed the users database with default credentials if empty on startup
async function seedUsers() {
  console.log("[Seeding] Checking if users need to be seeded...");
  try {
    const q = query(collection(db, 'users'));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log("[Seeding] No users found. Seeding default Master and Employee accounts...");
      
      const defaultUsers = [
        {
          email: "admin@enviroride.net",
          name: "Master Admin",
          role: "master",
          password: "master123",
          shiftStart: "00:00",
          shiftEnd: "00:00"
        },
        {
          email: "john@enviroride.net",
          name: "John Carter",
          role: "employee",
          password: "john123",
          shiftStart: "08:00",
          shiftEnd: "16:00"
        },
        {
          email: "sarah@enviroride.net",
          name: "Sarah Jenkins",
          role: "employee",
          password: "sarah123",
          shiftStart: "16:00",
          shiftEnd: "00:00"
        },
        {
          email: "david@enviroride.net",
          name: "David Miller",
          role: "employee",
          password: "david123",
          shiftStart: "00:00",
          shiftEnd: "08:00"
        },
        {
          email: "emily@enviroride.net",
          name: "Emily Watson",
          role: "employee",
          password: "emily123",
          shiftStart: "08:00",
          shiftEnd: "16:00"
        }
      ];

      for (const u of defaultUsers) {
        await setDoc(doc(db, 'users', u.email), {
          email: u.email,
          name: u.name,
          role: u.role,
          passwordHash: hashPassword(u.password),
          shiftStart: u.shiftStart,
          shiftEnd: u.shiftEnd,
          createdAt: new Date().toISOString()
        });
        console.log(`[Seeding] Created ${u.role} account: ${u.email}`);
      }
      console.log("[Seeding] Seeding completed successfully!");
    } else {
      console.log("[Seeding] Users collection is already populated. Verifying employee shift times...");
      // Ensure all employees have shiftStart/shiftEnd fields
      for (const snap of snapshot.docs) {
        const data = snap.data();
        if (data.role === 'employee' && (!data.shiftStart || !data.shiftEnd)) {
          let start = "08:00";
          let end = "16:00";
          if (data.email.startsWith("sarah")) { start = "16:00"; end = "00:00"; }
          if (data.email.startsWith("david")) { start = "00:00"; end = "08:00"; }
          await updateDoc(doc(db, 'users', snap.id), {
            shiftStart: start,
            shiftEnd: end
          });
          console.log(`[Seeding] Updated missing shift times for employee: ${data.email}`);
        }
      }
    }
  } catch (error) {
    console.error("[Seeding] Failed to seed users:", error);
  }
}

// Call seedUsers immediately on startup
seedUsers();

async function clearExistingBookings() {
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'bookings', d.id));
    }
    console.log("[Startup] Cleared all existing bookings as requested.");
  } catch (error) {
    console.error("[Startup] Failed to clear existing bookings:", error);
  }
}
clearExistingBookings();

async function generateBookingId(): Promise<string> {
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    let maxNum = 0;
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const bId = data.bookingId;
      if (bId && typeof bId === 'string' && bId.startsWith('Enviro_')) {
        const numPart = parseInt(bId.replace('Enviro_', ''), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });
    const nextNum = maxNum + 1;
    return `Enviro_${String(nextNum).padStart(4, '0')}`;
  } catch (e) {
    return `Enviro_0001`;
  }
}

// Helper to validate a user session token and return user details/role
async function validateSession(req: express.Request): Promise<any | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    const sessionDocRef = doc(db, 'sessions', token);
    const sessionSnap = await getDoc(sessionDocRef);
    if (!sessionSnap.exists()) {
      return null;
    }
    const sessionData = sessionSnap.data();
    // Verify session isn't expired (let's say 30 days expiration)
    const createdAt = new Date(sessionData.createdAt).getTime();
    const now = new Date().getTime();
    if (now - createdAt > 30 * 24 * 60 * 60 * 1000) {
      console.log("[Session] Session token expired:", token);
      await deleteDoc(sessionDocRef);
      return null;
    }
    return sessionData;
  } catch (error) {
    console.error("[Session Validation Error]:", error);
    return null;
  }
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Helper to send emails via Resend
async function sendResendEmail(params: {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}): Promise<any> {
  if (!resend) {
    console.warn("[Resend Helper] Cannot send email. RESEND_API_KEY is not configured.");
    return { data: null, error: { message: "Resend client is not initialized" } };
  }

  const cleanParams = {
    ...params,
    to: params.to.trim().toLowerCase(),
    replyTo: params.replyTo,
    headers: params.headers
  };

  try {
    console.log(`[Resend Helper] Attempting to send email from: ${cleanParams.from} to: ${cleanParams.to}...`);
    const result = await resend.emails.send({
        from: cleanParams.from,
        to: cleanParams.to,
        replyTo: cleanParams.replyTo,
        subject: cleanParams.subject,
        text: cleanParams.text,
        html: cleanParams.html,
        headers: cleanParams.headers
    });
    console.log(`[Resend Helper] Send completed for ${cleanParams.to}. Status: ${result.error ? 'Failed' : 'Success'}, ID: ${result.data?.id || 'N/A'}`);
    
    if (result.error) {
      console.warn(`[Resend Helper] Email send returned error:`, result.error.message || JSON.stringify(result.error));
    }
    
    return {
      originalTo: cleanParams.to,
      redirected: false,
      ...result
    };
  } catch (err: any) {
    const errMsg = err?.message || "Unknown error";
    console.error(`[Resend Helper] Exception caught during send to ${cleanParams.to}:`, errMsg);
    return { data: null, error: { message: errMsg }, originalTo: cleanParams.to };
  }
}

// In-memory cache for autocomplete requests
const autocompleteCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

// Enable JSON parser for body
app.use(express.json());

// API route to serve Google Maps API Key to the client dynamically at runtime
app.get("/api/config/maps-key", (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY || "";
  res.json({ apiKey });
});

// Proxy Nominatim for OSM autocomplete
app.get("/api/nominatim/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query is required" });
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q as string)}&format=json&addressdetails=1&limit=5&countrycodes=us`, {
        headers: { 'User-Agent': 'EnviroRide-App/1.0' }
    });
    if (!response.ok) throw new Error("Nominatim failed");
    const data = await response.json();
    const formatted = data.map((item: any) => ({
        placeId: item.place_id,
        description: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon)
    }));
    res.json({ suggestions: formatted });
  } catch (err) {
    console.error("[Proxy] Nominatim proxy failed:", err);
    res.status(500).json({ error: "Nominatim proxy failed" });
  }
});

// API route to proxy Google Routes API requests with automatic fallback to Legacy Directions API
app.post("/api/routes/compute", async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
  console.log("[Proxy] API Key exists:", !!apiKey);
  
  if (!apiKey) {
    return res.status(500).json({ error: "Maps API key is not configured." });
  }

  try {
    const originLat = req.body.origin?.location?.latLng?.latitude;
    const originLng = req.body.origin?.location?.latLng?.longitude;
    const destLat = req.body.destination?.location?.latLng?.latitude;
    const destLng = req.body.destination?.location?.latLng?.longitude;
    
    // Simple US bounding box check (approximate)
    const isInsideUS = (lat: number, lng: number) => {
        return lat >= 24.396308 && lat <= 49.384358 && lng >= -124.848974 && lng <= -66.93457;
    };
    
    if (originLat !== undefined && originLng !== undefined && destLat !== undefined && destLng !== undefined) {
      if (!isInsideUS(originLat, originLng) || !isInsideUS(destLat, destLng)) {
          return res.status(400).json({ error: "Sorry, we currently only provide service within the United States" });
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    console.log("[Proxy] Attempting modern Google Routes API...");
    console.log("[Proxy] Request Body:", JSON.stringify(req.body, null, 2));
    // Use correct endpoint: https://routes.googleapis.com/directions/v2:computeRoutes
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "*",
        "Referer": "https://ais-dev-tigsfsc63wzib2e7qi272m-176237178610.asia-southeast1.run.app"
      },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return res.json(data);
    } else {
      const errorText = await response.text();
      const status = response.status;
      return res.status(500).json({ error: "Failed to compute route", status, details: errorText });
    }

    const errorText = await response.text();
    console.error(`[Proxy] Modern Google Routes API request failed!`);
    console.error(`[Proxy] URL: https://routes.googleapis.com/v1/directions:computeRoutes`);
    console.error(`[Proxy] Status: ${response.status}`);
    console.error(`[Proxy] Response text: ${errorText}`);
    console.error(`[Proxy] Request Body:`, JSON.stringify(req.body, null, 2));
    console.error(`[Proxy] Request Headers:`, JSON.stringify({
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey.substring(0, 5) + "...",
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        "Referer": "https://ais-dev-tigsfsc63wzib2e7qi272m-176237178610.asia-southeast1.run.app"
    }, null, 2));
    console.warn(`[Proxy] Falling back to Legacy Directions API...`);
  } catch (modernErr: any) {
    console.warn("[Proxy] Modern Google Routes API request threw error:", modernErr?.message, "Falling back to Legacy Directions API...");
  }

  // Fallback: Legacy Directions API
  try {
    const originLat = req.body.origin?.location?.latLng?.latitude;
    const originLng = req.body.origin?.location?.latLng?.longitude;
    const destLat = req.body.destination?.location?.latLng?.latitude;
    const destLng = req.body.destination?.location?.latLng?.longitude;

    if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
      return res.status(400).json({ error: "Missing origin or destination for fallback routing." });
    }

    let waypointsParam = "";
    if (Array.isArray(req.body.intermediates) && req.body.intermediates.length > 0) {
      const wpts = req.body.intermediates
        .map((itm: any) => {
          const lat = itm.location?.latLng?.latitude;
          const lng = itm.location?.latLng?.longitude;
          return (lat !== undefined && lng !== undefined) ? `${lat},${lng}` : null;
        })
        .filter(Boolean);
      if (wpts.length > 0) {
        waypointsParam = `&waypoints=optimize:false|${wpts.join("|")}`;
      }
    }

    const legacyUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}${waypointsParam}&key=${apiKey}`;
    console.log(`[Proxy] Requesting Legacy Directions API: ${legacyUrl.replace(apiKey, "HIDDEN_KEY")}`);

    const legacyResponse = await fetch(legacyUrl);
    if (!legacyResponse.ok) {
      const legacyErrText = await legacyResponse.text();
      return res.status(legacyResponse.status).json({ error: `Legacy Directions API failed: ${legacyErrText}` });
    }

    const legacyData = await legacyResponse.json();
    if (legacyData.status !== "OK") {
      return res.status(400).json({ error: `Legacy Directions API returned status ${legacyData.status}: ${legacyData.error_message || "Unknown error"}` });
    }

    const legacyRoute = legacyData.routes?.[0];
    if (!legacyRoute) {
      return res.status(404).json({ error: "No routes found in legacy response." });
    }

    // Map legacy structure to modern structure
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;

    if (Array.isArray(legacyRoute.legs)) {
      for (const leg of legacyRoute.legs) {
        totalDistanceMeters += leg.distance?.value || 0;
        totalDurationSeconds += leg.duration?.value || 0;
      }
    }

    const mappedData = {
      routes: [
        {
          distanceMeters: totalDistanceMeters,
          duration: `${totalDurationSeconds}s`,
          polyline: {
            encodedPolyline: legacyRoute.overview_polyline?.points || ""
          }
        }
      ]
    };

    console.log(`[Proxy] Legacy Directions API fallback success! Mapped distance: ${totalDistanceMeters} meters.`);
    return res.json(mappedData);
  } catch (fallbackErr: any) {
    console.error("[Proxy] Legacy Directions API fallback also failed:", fallbackErr?.message);
    return res.status(500).json({ error: `All routing strategies failed: ${fallbackErr.message}` });
  }
});

// API route to proxy Google Places API (New) Autocomplete requests
app.post("/api/places/autocomplete", async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
  if (!apiKey) {
    console.error("[Proxy] GOOGLE_MAPS_PLATFORM_KEY environment variable is not set.");
    return res.status(500).json({ error: "Maps API key is not configured." });
  }
  const { input } = req.body;
  
  if (!input) {
    return res.status(400).json({ error: "Input text is required" });
  }

  const cacheKey = input.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Proxy] Returning cached autocomplete for: ${input}`);
    return res.json(cached.data);
  }

  const fetchWithRetry = async (
    fetchFn: () => Promise<Response>,
    attempt: number = 1
  ): Promise<any> => {
    try {
      const response = await fetchFn();
      
      if (response.status === 429) {
        if (attempt < 4) {
          const delay = Math.pow(2, attempt) * 300; // 600ms, 1200ms, 2400ms
          console.warn(`[Proxy] Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(fetchFn, attempt + 1);
        }
      }
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Places API returned ${response.status}: ${errText}`);
      }
      
      return await response.json();
    } catch (err: any) {
      if (attempt < 4) {
        const delay = Math.pow(2, attempt) * 300;
        console.warn(`[Proxy] Error: ${err.message}. Retrying in ${delay}ms... (Attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(fetchFn, attempt + 1);
      }
      throw err;
    }
  };

  try {
    const data = await fetchWithRetry(() => fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
      }),
    }));
    autocompleteCache.set(cacheKey, { data, timestamp: Date.now() });
    return res.json(data);
  } catch (err: any) {
    console.error("[Proxy] Autocomplete proxy error: message:", err.message);
    console.error("[Proxy] Autocomplete proxy error: stack:", err.stack);
    return res.status(500).json({ error: err.message });
  }
});

// API route to proxy Google Places API (New) Place Details requests
app.post("/api/places/details", async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
  if (!apiKey) {
    console.error("[Proxy] GOOGLE_MAPS_PLATFORM_KEY environment variable is not set.");
    return res.status(500).json({ error: "Maps API key is not configured." });
  }
  const { placeId } = req.body;
  
  if (!placeId) {
    return res.status(400).json({ error: "Place ID is required" });
  }

  const fetchWithRetry = async (
    fetchFn: () => Promise<Response>,
    attempt: number = 1
  ): Promise<any> => {
    try {
      const response = await fetchFn();
      
      if (response.status === 429) {
        if (attempt < 4) {
          const delay = Math.pow(2, attempt) * 300; // 600ms, 1200ms, 2400ms
          console.warn(`[Proxy] Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchWithRetry(fetchFn, attempt + 1);
        }
      }
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Places API returned ${response.status}: ${errText}`);
      }
      
      return await response.json();
    } catch (err: any) {
      if (attempt < 4) {
        const delay = Math.pow(2, attempt) * 300;
        console.warn(`[Proxy] Error: ${err.message}. Retrying in ${delay}ms... (Attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(fetchFn, attempt + 1);
      }
      throw err;
    }
  };
  
  try {
    const data = await fetchWithRetry(() => fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
      },
    }));
    return res.json(data);
  } catch (err: any) {
    console.error("[Proxy] Place details proxy error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// API route to handle bookings
app.post("/api/book", async (req, res) => {
  const {
    serviceType,
    tripType,
    pickupDate,
    pickupTime,
    returnDate,
    returnTime,
    pickupAddress,
    dropoffAddress,
    stops = [],
    selectedVehicle,
    distance,
    totalPrice,
    customRideRequest, // Checkbox for Mercedes Sprinter, etc.
    clientEmail,
    clientName,
    clientPhone,
    clientMessage,
    // New fields
    numPassengers = 1,
    numLuggage = 0,
    needCarSeat = false,
    carSeatType = "None",
    meetAndGreet = false,
    petCarrier = false,
    iceService = false,
    hourlyHours,
  } = req.body;

  const VEHICLE_RATES: Record<string, number> = {
    "Sedan": 50,
    "Luxury SUV": 65
  };
  const hourlyRate = VEHICLE_RATES[selectedVehicle] || 0;
  const isHourly = serviceType === "Hourly Ride" && hourlyHours && hourlyRate > 0;
  const reservedHours = isHourly ? Number(hourlyHours) : 0;
  const hourlyFare = isHourly ? hourlyRate * reservedHours : 0;

  const hourlyDetailsText = isHourly ? `
HOURLY RIDE SPECIFICATIONS:
- Service Type: Hourly Ride
- Vehicle: ${selectedVehicle}
- Reserved Hours: ${reservedHours} Hours
- Hourly Rate: $${hourlyRate}/hour
- Hourly Fare: $${hourlyFare.toFixed(2)}
` : "";

  const hourlyDetailsHtml = isHourly ? `
<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 15px; margin-bottom: 20px;">
  <h4 style="margin: 0 0 10px 0; color: #15803d; font-size: 15px;">Hourly Ride Specifications</h4>
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <tr><td style="padding: 4px 0; font-weight: bold; width: 160px; color: #374151;">Service Type:</td><td>Hourly Ride</td></tr>
    <tr><td style="padding: 4px 0; font-weight: bold; color: #374151;">Vehicle:</td><td>${selectedVehicle}</td></tr>
    <tr><td style="padding: 4px 0; font-weight: bold; color: #374151;">Reserved Hours:</td><td style="font-weight: bold; color: #15803d;">${reservedHours} Hours</td></tr>
    <tr><td style="padding: 4px 0; font-weight: bold; color: #374151;">Hourly Rate:</td><td>$${hourlyRate}/hour</td></tr>
    <tr><td style="padding: 4px 0; font-weight: bold; color: #374151;">Hourly Fare:</td><td style="font-weight: bold; color: #15803d;">$${hourlyFare.toFixed(2)}</td></tr>
  </table>
</div>
` : "";

  // Validate required inputs
  if (!pickupAddress || !dropoffAddress || !pickupDate || !pickupTime || !clientEmail || !clientName) {
    return res.status(400).json({
      success: false,
      message: "Required booking fields are missing.",
    });
  }
  
  // Conditional date/time strings for emails and data
  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, '0');
    return `${h}:${m} ${ampm}`;
  };
  
  const outboundDateTimeStr = `${pickupDate} @ ${formatTime(pickupTime)}`;
  const returnDateTimeStr = tripType === "Round Trip" && returnDate && returnTime ? `${returnDate} @ ${formatTime(returnTime)}` : null;

  // Create formatted stops string
  const stopsText = stops.length > 0 
    ? stops.map((stop: string, i: number) => `Stop ${i + 1}: ${stop}`).join("\n")
    : "None";

  const stopsHtml = stops.length > 0
    ? `<ul>${stops.map((stop: string, i: number) => `<li><strong>Stop ${i + 1}:</strong> ${stop}</li>`).join("")}</ul>`
    : "None";

  // Create Additional Services string
  const extraServicesList = [];
  if (meetAndGreet) {
    if (serviceType === "Hourly Ride") {
      extraServicesList.push("Meet & Greet (+$25.00)");
    } else {
      extraServicesList.push("Meet & Greet (+$45.00 TBD)");
    }
  }
  if (petCarrier) extraServicesList.push("Pet Carrier / Traveling with Animal (+$30.00 TBD)");
  if (iceService) extraServicesList.push("Ice Service (+$15.00 TBD)");
  
  const extrasText = extraServicesList.length > 0 ? extraServicesList.join(", ") : "None";
  const extrasHtml = extraServicesList.length > 0
    ? `<ul>${extraServicesList.map(item => `<li>${item}</li>`).join("")}</ul>`
    : "None";

  // Format price
  const isCustomQuote = !totalPrice || Number(totalPrice) === 0;
  const priceString = isCustomQuote ? "Custom Quote Required (TBD)" : `$${Number(totalPrice).toFixed(2)}`;

  // Create Emails Content
  // 1. Booking notification to company (info@enviroride.net)
  const companySubject = `New EnviroRide Booking: ${tripType} - ${clientName}`;
  const companyText = `
EnviroRide Ground Transportation Booking Notification
===================================================
A new booking has been created on enviroride.net.

CLIENT DETAILS:
- Name: ${clientName}
- Email: ${clientEmail}
- Phone: ${clientPhone || "N/A"}
${clientMessage ? `- Message / Notes: ${clientMessage}` : ""}

TRIP DETAILS:
- Service Type: ${serviceType}
${hourlyDetailsText}
- Trip Type: ${tripType}
- Outbound Pickup Date & Time: ${outboundDateTimeStr}
${returnDateTimeStr ? `- Return Pickup Date & Time: ${returnDateTimeStr}` : ""}
- Pickup Address: ${pickupAddress}
- Additional Stops:
${stopsText}
- Drop-off Address: ${dropoffAddress}
- Estimated Distance: ${distance} miles

PASSENGER & VEHICLE DETAILS:
- Selected Vehicle: ${selectedVehicle || "N/A"}
- Number of Passengers: ${numPassengers}
- Number of Luggage/Bags: ${numLuggage}
- Child Car Seat Required: ${needCarSeat ? `Yes (${carSeatType})` : "No"}
- Extra Services Selected: ${extrasText}
- Special Service Request: ${customRideRequest || "None Selected"}

PRICING STATUS:
- Total Price: ${priceString}
${serviceType === "Hourly Ride" ? "\n- Note: Tolls may apply based on the required service and route." : ""}
${isCustomQuote ? "\n*NOTE: This trip is outside the standard pricing area and requires a manual custom quote." : ""}

Please contact the client to finalize the booking.
`;

  const companyHtml = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #15803d; color: white; padding: 20px; text-align: center;">
    <h2 style="margin: 0;">New EnviroRide Booking</h2>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">Green America, LLC ground transportation service</p>
  </div>
  <div style="padding: 24px;">
    <h3 style="color: #15803d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 0;">Client Details</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Name:</td><td>${clientName}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Email:</td><td><a href="mailto:${clientEmail}" style="color: #15803d;">${clientEmail}</a></td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Phone:</td><td>${clientPhone || "N/A"}</td></tr>
      ${clientMessage ? `<tr><td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Message:</td><td>${clientMessage}</td></tr>` : ""}
    </table>

    <h3 style="color: #15803d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Trip Details</h3>
    ${hourlyDetailsHtml}
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Service Type:</td><td>${serviceType}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Trip Type:</td><td>${tripType}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Outbound Date & Time:</td><td>${outboundDateTimeStr}</td></tr>
      ${returnDateTimeStr ? `<tr><td style="padding: 6px 0; font-weight: bold;">Return Date & Time:</td><td>${returnDateTimeStr}</td></tr>` : ""}
      <tr><td style="padding: 6px 0; font-weight: bold;">Pickup Address:</td><td>${pickupAddress}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Additional Stops:</td><td>${stopsHtml}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Drop-off Address:</td><td>${dropoffAddress}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Est. Distance:</td><td>${distance} miles</td></tr>
    </table>

    <h3 style="color: #15803d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Vehicle & Passengers Specifications</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 6px 0; font-weight: bold; width: 180px;">Selected Vehicle:</td><td>${selectedVehicle || "N/A"}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Passengers count:</td><td>${numPassengers}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Luggage bags:</td><td>${numLuggage}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold;">Child Car Seat:</td><td>${needCarSeat ? `Yes (${carSeatType})` : "No"}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Additional Services:</td><td>${extrasHtml}</td></tr>
      <tr><td style="padding: 6px 0; font-weight: bold; color: #b45309;">Special Option:</td><td style="font-weight: bold; color: #b45309;">${customRideRequest || "None Selected"}</td></tr>
    </table>

    <h3 style="color: #15803d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Pricing Status</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        <td style="padding: 6px 0; font-weight: bold; width: 180px;">Estimated Price:</td>
        <td style="font-size: 18px; font-weight: bold; color: ${isCustomQuote ? '#b45309' : '#16a34a'};">
          ${priceString}
        </td>
      </tr>
      ${serviceType === "Hourly Ride" ? `<tr><td colspan="2" style="color: #6b7280; font-size: 11px; font-style: italic; padding-top: 4px;">*Tolls may apply based on the required service and route.</td></tr>` : ""}
      ${isCustomQuote ? `<tr><td colspan="2" style="color: #b45309; font-size: 12px; font-style: italic; padding-top: 5px;">*This trip is outside standard service area. Manual review and custom quote is required.</td></tr>` : ""}
    </table>
  </div>
  <div style="background-color: #f3f4f6; text-align: center; padding: 15px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
    This is an automated request from the EnviroRide Booking System.
  </div>
</div>
`;

  // 2. Booking confirmation back to the client
  const clientSubject = `Booking Request Confirmed - EnviroRide`;
  
  const sprinterLine = customRideRequest 
    ? `<p style="font-weight: bold; color: #b45309; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin-top: 15px; border-radius: 4px;">Our team will contact you shortly regarding your requested service (${customRideRequest}).</p>`
    : "";

  const customQuoteLine = isCustomQuote
    ? `<p style="font-weight: bold; color: #b45309; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin-top: 15px; border-radius: 4px;">Standard pricing region notice: This route is outside our standard pricing area. Our dispatch team will follow up manually with your custom quote at info@enviroride.net.</p>`
    : "";

  const clientText = `
Dear ${clientName},

Thank you for booking with EnviroRide. Our team will call you shortly to confirm your reservation.

SUMMARY OF YOUR REQUEST:
- Service Type: ${serviceType}
${hourlyDetailsText}
- Trip Type: ${tripType}
- Outbound Pickup Date & Time: ${outboundDateTimeStr}
${returnDateTimeStr ? `- Return Pickup Date & Time: ${returnDateTimeStr}` : ""}
- Pickup Address: ${pickupAddress}
- Drop-off Address: ${dropoffAddress}
- Selected Vehicle: ${selectedVehicle || "N/A"}
- Number of Passengers: ${numPassengers}
- Number of Luggage/Bags: ${numLuggage}
- Child Car Seat: ${needCarSeat ? `Yes (${carSeatType})` : "No"}
- Extra Services: ${extrasText}
- Estimated Distance: ${distance} miles
${clientMessage ? `- Additional Message / Notes: ${clientMessage}` : ""}
- Estimated Price: ${priceString}
${serviceType === "Hourly Ride" ? "\n- Note: Tolls may apply based on the required service and route." : ""}
${customRideRequest ? `\nOur team will contact you shortly regarding your requested service: ${customRideRequest}.` : ""}
${isCustomQuote ? `\nThis route is outside our standard pricing area. Our team will contact you manually with your custom quote.` : ""}

If you have any questions, feel free to reply to this email or contact us at info@enviroride.net.

Warm regards,
The EnviroRide Team
info@enviroride.net
`;

  const clientHtml = `
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  <div style="background-color: #15803d; color: white; padding: 25px; text-align: center;">
    <h1 style="margin: 0; font-size: 24px;">EnviroRide</h1>
    <p style="margin: 5px 0 0 0; opacity: 0.9;">Safe, Reliable & Eco-Friendly Travel</p>
  </div>
  <div style="padding: 24px;">
    <p>Dear <strong>${clientName}</strong>,</p>
    <p>Thank you for booking with EnviroRide. Our team will call you shortly to confirm your reservation.</p>
    
    <div style="background-color: #f9fafb; border-radius: 6px; padding: 18px; margin: 20px 0; border: 1px solid #f3f4f6;">
      <h3 style="margin-top: 0; color: #15803d; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">Reservation Details</h3>
      ${hourlyDetailsHtml}
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 5px 0; font-weight: bold; width: 180px; color: #6b7280;">Service Type:</td><td style="font-weight: 500;">${serviceType}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Trip Type:</td><td style="font-weight: 500;">${tripType}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Outbound Date & Time:</td><td style="font-weight: 500;">${outboundDateTimeStr}</td></tr>
        ${returnDateTimeStr ? `<tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Return Date & Time:</td><td style="font-weight: 500;">${returnDateTimeStr}</td></tr>` : ""}
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Pickup Location:</td><td>${pickupAddress}</td></tr>
        ${stops.length > 0 ? `<tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280; vertical-align: top;">Additional Stops:</td><td>${stopsHtml}</td></tr>` : ""}
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Drop-off Location:</td><td>${dropoffAddress}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Est. Distance:</td><td>${distance} miles</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Selected Vehicle:</td><td style="font-weight: 500;">${selectedVehicle || "N/A"}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Passengers Count:</td><td>${numPassengers}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Luggage Bags:</td><td>${numLuggage}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280;">Child Car Seat:</td><td>${needCarSeat ? `Yes (${carSeatType})` : "No"}</td></tr>
        <tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280; vertical-align: top;">Additional Services:</td><td>${extrasHtml}</td></tr>
        ${clientMessage ? `<tr><td style="padding: 5px 0; font-weight: bold; color: #6b7280; vertical-align: top;">Message / Notes:</td><td>${clientMessage}</td></tr>` : ""}
        <tr><td style="padding: 10px 0 5px 0; font-weight: bold; color: #374151; font-size: 16px;">Estimated Price:</td><td style="padding: 10px 0 5px 0; font-size: 18px; font-weight: bold; color: ${isCustomQuote ? '#b45309' : '#16a34a'};">${priceString}</td></tr>
        ${serviceType === "Hourly Ride" ? `<tr><td colspan="2" style="padding-top: 2px; padding-bottom: 5px; font-size: 11px; color: #6b7280; font-style: italic;">*Tolls may apply based on the required service and route.</td></tr>` : ""}
      </table>
    </div>

    ${sprinterLine}
    ${customQuoteLine}

    <p style="margin-top: 25px;">If you need to make any changes or have any urgent inquiries, please contact us immediately at <a href="mailto:info@enviroride.net" style="color: #15803d; font-weight: bold;">info@enviroride.net</a> or reply directly to this email.</p>
    
    <p style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px; font-size: 14px;">
      Warm regards,<br/>
      <strong>Team EnviroRide</strong><br/>
      <span style="font-size: 12px; color: #6b7280;">Green America, LLC Group</span>
    </p>
  </div>
  <div style="background-color: #15803d; color: white; text-align: center; padding: 15px; font-size: 12px;">
    Airports: BWI • IAD • DCA • Available 24/7
  </div>
</div>
`;

  // Determine whether we have actual SMTP setup
  const isSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

  // SECURE RUNTIME CREDENTIALS & SETTINGS LOGS
  console.log("\n=================== SMTP RUNTIME CONFIGURATION CHECK ===================");
  console.log(`SMTP_HOST defined: ${process.env.SMTP_HOST ? `YES ("${process.env.SMTP_HOST}")` : "NO (undefined)"}`);
  console.log(`SMTP_PORT defined: ${process.env.SMTP_PORT ? `YES ("${process.env.SMTP_PORT}")` : "NO (undefined)"}`);
  console.log(`SMTP_USER defined: ${process.env.SMTP_USER ? `YES ("${process.env.SMTP_USER}")` : "NO (undefined)"}`);
  console.log(`SMTP_SECURE defined: ${process.env.SMTP_SECURE ? `YES ("${process.env.SMTP_SECURE}")` : "NO (undefined)"}`);
  console.log(`SMTP_PASS defined: ${process.env.SMTP_PASS ? "YES (hidden)" : "NO (undefined or empty)"}`);
  console.log(`Client Email: "${clientEmail || 'UNDEFINED'}"`);
  console.log(`Client Name: "${clientName || 'UNDEFINED'}"`);
  
  if (process.env.SMTP_HOST !== "smtp.office365.com") {
    console.log(`[SMTP CONFIG NOTICE] SMTP_HOST is set to "${process.env.SMTP_HOST}" instead of "smtp.office365.com".`);
  }
  if (process.env.SMTP_PORT !== "587" && Number(process.env.SMTP_PORT) !== 587) {
    console.log(`[SMTP CONFIG NOTICE] SMTP_PORT is set to "${process.env.SMTP_PORT}" instead of "587".`);
  }
  if (process.env.SMTP_SECURE === "true") {
    console.log(`[SMTP CONFIG WARNING] SMTP_SECURE is set to "true". For Office365 STARTTLS on port 587, it should be set to "false" (or left empty) to enable STARTTLS instead of implicit SSL.`);
  }
  console.log("========================================================================\n");

    // Save to Firestore
    let bookingId = await generateBookingId();
    try {
      const bookingData = {
        bookingId,
        fullName: clientName,
        email: clientEmail,
        phone: clientPhone || "N/A",
        serviceType,
        tripType,
        reservedHours: isHourly ? reservedHours : null,
        hourlyRate: isHourly ? hourlyRate : null,
        hourlyFare: isHourly ? hourlyFare : null,
        pickupAddress,
        dropoffAddress,
        stops,
        pickupDateTime: outboundDateTimeStr,
        returnDateTime: returnDateTimeStr,
        vehicle: selectedVehicle,
        price: totalPrice,
        additionalServices: extraServicesList,
        passengerCount: numPassengers,
        luggageCount: numLuggage,
        message: clientMessage || "",
        status: "Pending",
        assignedTo: "unassigned",
        timestamp: new Date().toISOString(),
      };
      await addDoc(collection(db, 'bookings'), bookingData);
      console.log("[Firestore] Booking saved successfully!");
    } catch (dbError) {
      console.error("[Firestore] Booking save failed:", dbError);
      return res.status(500).json({ success: false, message: `Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}` });
    }

    try {
      if (resend) {
        console.log("[RESEND PROCESS] Resend client initialized. Attempting to send emails...");
      } else {
        console.log("Resend API Key not configured. Falling back to log-only transport.");
        // Simulated Email Sending: Log full content to server console and show success.
        console.log("\n========================================================");
        console.log(`[SIMULATED EMAIL] SENDING TO COMPANY: info@enviroride.net`);
        console.log(`SUBJECT: ${companySubject}`);
        console.log(`BODY (HTML): \n${companyHtml}`);
        console.log("========================================================");
        console.log(`[SIMULATED EMAIL] SENDING TO CLIENT: ${clientEmail}`);
        console.log(`SUBJECT: ${clientSubject}`);
        console.log(`BODY (HTML): \n${clientHtml}`);
        console.log("========================================================\n");

        return res.json({
          success: true,
          simulated: true,
          bookingId: bookingId,
          message: "Booking registered successfully (Email notifications simulated on server logs).",
        });
      }

      try {
        // 1. Dispatch Company Notification
        console.log("[RESEND PROCESS] Attempting to send Company Notification via Resend...");
        const companySendInfo = await sendResendEmail({
          from: `${clientName} - EnviroRide Booking <noreply@enviroride.net>`,
          to: "info@enviroride.net",
          replyTo: `${clientName} <${clientEmail}>`,
          subject: companySubject,
          text: companyText,
          html: companyHtml,
          headers: {
            "Message-ID": `<booking-${bookingId}-company@enviroride.net>`
          }
        });
        
        if (companySendInfo.error) {
          console.warn("[Resend Warning] Company Notification failed to send:", companySendInfo.error.message || JSON.stringify(companySendInfo.error));
        } else {
          console.log("[RESEND PROCESS] Company Notification SUCCESS!", companySendInfo.data || companySendInfo);
        }

        // 2. Dispatch Client Confirmation
        console.log("[RESEND PROCESS] Attempting to send Client Confirmation via Resend...");
        const clientSendInfo = await sendResendEmail({
          from: "EnviroRide Booking <info@enviroride.net>",
          to: clientEmail,
          replyTo: '"EnviroRide" <info@enviroride.net>',
          subject: clientSubject,
          text: clientText,
          html: clientHtml,
          headers: {
            "Message-ID": `<booking-${bookingId}-client@enviroride.net>`,
            "References": `<booking-${bookingId}-company@enviroride.net>`,
            "In-Reply-To": `<booking-${bookingId}-company@enviroride.net>`
          }
        });
        
        if (clientSendInfo.error) {
          console.warn("[Resend Warning] Client Confirmation failed to send:", clientSendInfo.error.message || JSON.stringify(clientSendInfo.error));
        } else {
          console.log("[RESEND PROCESS] Client Confirmation SUCCESS!", clientSendInfo.data || clientSendInfo);
        }

        const hasErrors = companySendInfo.error || clientSendInfo.error;
        return res.json({
          success: true,
          bookingId: bookingId,
          message: hasErrors 
            ? "Booking registered successfully (Email delivery failed or was partially rejected; please ensure your Resend domain is fully verified)."
            : "Booking emails sent successfully via Resend.",
          error: hasErrors ? (companySendInfo.error?.message || clientSendInfo.error?.message) : undefined,
          emailLogs: {
            company: {
              to: "info@enviroride.net",
              status: companySendInfo.error ? "failed" : "success",
              ...companySendInfo
            },
            client: {
              to: clientEmail,
              status: clientSendInfo.error ? "failed" : "success",
              ...clientSendInfo
            }
          }
        });
      } catch (resendError: any) {
        console.warn("[Resend Warning] An error occurred in the Resend dispatch pipeline:", resendError?.message || JSON.stringify(resendError));
        
        // Still return success even if email fails to not block the booking
        return res.json({
          success: true,
          bookingId: bookingId,
          message: "Booking registered successfully (Email notifications failed).",
          error: resendError?.message || "Email delivery failed",
        });
      }
    } catch (error: any) {
      console.log("General booking endpoint status info:", error?.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating your booking.",
        error: error.message,
      });
    }
});

// API route to login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const userDocRef = doc(db, 'users', email.toLowerCase().trim());
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const userData = userSnap.data();
    const inputHash = hashPassword(password);
    if (userData.passwordHash !== inputHash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Create session token
    const token = crypto.randomUUID();
    await setDoc(doc(db, 'sessions', token), {
      token,
      email: userData.email,
      name: userData.name,
      role: userData.role,
      createdAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      token,
      user: {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        shiftStart: userData.shiftStart || "08:00",
        shiftEnd: userData.shiftEnd || "16:00"
      }
    });
  } catch (error: any) {
    console.error("[Login Error]:", error);
    return res.status(500).json({ error: "Login failed", details: error.message });
  }
});

// API route to logout
app.post("/api/auth/logout", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      await deleteDoc(doc(db, 'sessions', token));
    } catch (e) {
      console.warn("Failed to delete session on logout:", e);
    }
  }
  return res.json({ success: true });
});

// API route to fetch bookings (admin only, role-based)
app.get("/api/bookings", async (req, res) => {
  const session = await validateSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const q = query(collection(db, 'bookings'), orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);
    let bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    // If employee, filter based on shift times and handoffs
    if (session.role === "employee") {
      const userDoc = await getDoc(doc(db, 'users', session.email));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const shiftStart = userData?.shiftStart || "08:00";
      const shiftEnd = userData?.shiftEnd || "16:00";

      // Client time format expected: "HH:MM", e.g., "14:30"
      // If not provided, we fallback to server time in hours:minutes
      let currentTimeStr = req.query.clientTime as string;
      if (!currentTimeStr) {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        currentTimeStr = `${hrs}:${mins}`;
      }

      const isCurrentTimeInShift = isTimeInShift(currentTimeStr, shiftStart, shiftEnd);

      bookings = bookings.filter((b: any) => {
        // 1. Is it explicitly handed off to this employee?
        if (b.handoffTo === session.email) {
          return true;
        }

        // 2. If employee is currently on shift, they can see bookings that fall within their shift hours
        if (isCurrentTimeInShift) {
          // Extract time from pickupDateTime (format is "YYYY-MM-DD HH:MM")
          const pickupTimePart = b.pickupDateTime ? b.pickupDateTime.split(' ')[1] : '';
          if (pickupTimePart && isTimeInShift(pickupTimePart, shiftStart, shiftEnd)) {
            return true;
          }
        }

        return false;
      });
    }

    return res.json(bookings);
  } catch (error: any) {
    console.error("[DEBUG] Failed to fetch bookings:", error);
    return res.status(500).json({ error: "Failed to fetch bookings", details: error.message });
  }
});

// API route to assign a booking to an employee (master only)
app.put("/api/bookings/:id/assign", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const { id } = req.params;
  const { assignedTo } = req.body; // Expects email or "unassigned"

  try {
    const bookingDocRef = doc(db, 'bookings', id);
    const bookingSnap = await getDoc(bookingDocRef);
    if (!bookingSnap.exists()) {
      return res.status(404).json({ error: "Booking not found" });
    }

    await updateDoc(bookingDocRef, { assignedTo });
    console.log(`[Booking Assignment] Booking ${id} assigned to ${assignedTo} by ${session.email}`);
    return res.json({ success: true, message: `Booking successfully assigned to ${assignedTo}` });
  } catch (error: any) {
    console.error("[Assignment Error]:", error);
    return res.status(500).json({ error: "Failed to assign booking", details: error.message });
  }
});

// API route to update booking status (master or assigned employee)
app.put("/api/bookings/:id/status", async (req, res) => {
  const session = await validateSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const { status } = req.body; // e.g. "Pending", "Confirmed", "In Progress", "Completed", "Cancelled"

  try {
    const bookingDocRef = doc(db, 'bookings', id);
    const bookingSnap = await getDoc(bookingDocRef);
    if (!bookingSnap.exists()) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const bookingData = bookingSnap.data();

    // Verification: Employees can only edit bookings active during their shift or handed off to them
    if (session.role === "employee") {
      const isHandoff = bookingData.handoffTo === session.email;
      
      const userDoc = await getDoc(doc(db, 'users', session.email));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const shiftStart = userData?.shiftStart || "08:00";
      const shiftEnd = userData?.shiftEnd || "16:00";
      
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hrs}:${mins}`;
      const isCurrentTimeInShift = isTimeInShift(currentTimeStr, shiftStart, shiftEnd);

      const pickupTimePart = bookingData.pickupDateTime ? bookingData.pickupDateTime.split(' ')[1] : '';
      const isBookingInShift = pickupTimePart && isTimeInShift(pickupTimePart, shiftStart, shiftEnd);

      if (!isHandoff && (!isCurrentTimeInShift || !isBookingInShift)) {
        return res.status(403).json({ error: "Forbidden. You can only update bookings active during your shift." });
      }
    }

    await updateDoc(bookingDocRef, { status });
    console.log(`[Booking Status] Booking ${id} status updated to ${status} by ${session.email}`);
    return res.json({ success: true, message: `Booking status updated to ${status}` });
  } catch (error: any) {
    console.error("[Status Update Error]:", error);
    return res.status(500).json({ error: "Failed to update booking status", details: error.message });
  }
});

// API route to list employees (master or employee)
app.get("/api/employees", async (req, res) => {
  const session = await validateSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const q = query(collection(db, 'users'), where('role', '==', 'employee'));
    const snapshot = await getDocs(q);
    const employees = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        email: data.email,
        name: data.name,
        role: data.role,
        createdAt: data.createdAt,
        shiftStart: data.shiftStart || "08:00",
        shiftEnd: data.shiftEnd || "16:00"
      };
    });
    return res.json(employees);
  } catch (error: any) {
    console.error("[List Employees Error]:", error);
    return res.status(500).json({ error: "Failed to retrieve employees", details: error.message });
  }
});

// API route to add an employee (master only)
app.post("/api/employees", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const { email, name, password, shiftStart, shiftEnd } = req.body;
  if (!email || !name || !password) {
    return res.status(400).json({ error: "Email, name, and password are required" });
  }

  try {
    const emailKey = email.toLowerCase().trim();
    const userDocRef = doc(db, 'users', emailKey);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    await setDoc(userDocRef, {
      email: emailKey,
      name,
      role: "employee",
      passwordHash: hashPassword(password),
      shiftStart: shiftStart || "08:00",
      shiftEnd: shiftEnd || "16:00",
      createdAt: new Date().toISOString()
    });

    console.log(`[Employee Manager] New employee added: ${emailKey} by ${session.email}`);
    return res.json({ success: true, message: "Employee account created successfully" });
  } catch (error: any) {
    console.error("[Add Employee Error]:", error);
    return res.status(500).json({ error: "Failed to create employee", details: error.message });
  }
});

// API route to update employee shift times (master only)
app.put("/api/employees/:email/shift", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const { email } = req.params;
  const { shiftStart, shiftEnd } = req.body;

  if (!shiftStart || !shiftEnd) {
    return res.status(400).json({ error: "shiftStart and shiftEnd are required" });
  }

  try {
    const emailKey = email.toLowerCase().trim();
    const userDocRef = doc(db, 'users', emailKey);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Employee not found" });
    }

    await updateDoc(userDocRef, {
      shiftStart,
      shiftEnd
    });

    console.log(`[Employee Manager] Shift updated for: ${emailKey} to ${shiftStart}-${shiftEnd} by ${session.email}`);
    return res.json({ success: true, message: "Shift times updated successfully" });
  } catch (error: any) {
    console.error("[Update Shift Error]:", error);
    return res.status(500).json({ error: "Failed to update shift times", details: error.message });
  }
});

// API route to hand off a booking to another employee
app.put("/api/bookings/:id/handoff", async (req, res) => {
  const session = await validateSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  const { handoffTo } = req.body; // Expects email of target employee

  if (!handoffTo) {
    return res.status(400).json({ error: "Handoff recipient email is required" });
  }

  try {
    const bookingDocRef = doc(db, 'bookings', id);
    const bookingSnap = await getDoc(bookingDocRef);
    if (!bookingSnap.exists()) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const bookingData = bookingSnap.data();

    // Verify: Only Master Admin or the employee active or handed-off can handoff
    if (session.role === "employee") {
      const isOwner = bookingData.handoffTo === session.email;
      
      const userDoc = await getDoc(doc(db, 'users', session.email));
      const userData = userDoc.exists() ? userDoc.data() : null;
      const shiftStart = userData?.shiftStart || "08:00";
      const shiftEnd = userData?.shiftEnd || "16:00";
      
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hrs}:${mins}`;
      const isCurrentTimeInShift = isTimeInShift(currentTimeStr, shiftStart, shiftEnd);

      const pickupTimePart = bookingData.pickupDateTime ? bookingData.pickupDateTime.split(' ')[1] : '';
      const isBookingInShift = pickupTimePart && isTimeInShift(pickupTimePart, shiftStart, shiftEnd);

      if (!isOwner && (!isCurrentTimeInShift || !isBookingInShift)) {
        return res.status(403).json({ error: "Forbidden. You can only hand off bookings that are active in your shift." });
      }
    }

    await updateDoc(bookingDocRef, { 
      handoffTo,
      assignedTo: handoffTo
    });

    console.log(`[Booking Handoff] Booking ${id} handed off to ${handoffTo} by ${session.email}`);
    return res.json({ success: true, message: `Booking handed off successfully` });
  } catch (error: any) {
    console.error("[Handoff Error]:", error);
    return res.status(500).json({ error: "Failed to hand off booking", details: error.message });
  }
});

// API route to delete an employee (master only)
app.delete("/api/employees/:email(*)", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const rawEmail = req.params.email || req.body.email || req.query.email;
  if (!rawEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const decodedEmail = decodeURIComponent(String(rawEmail));
    const emailKey = decodedEmail.toLowerCase().trim();
    const rawKey = String(rawEmail).toLowerCase().trim();

    // Try deleting direct doc with both emailKey and rawKey
    try {
      await deleteDoc(doc(db, 'users', emailKey));
    } catch (e) {}
    try {
      await deleteDoc(doc(db, 'users', rawKey));
    } catch (e) {}

    // Also query by email field to catch any docs with different IDs
    const usersRef = collection(db, 'users');
    const q1 = query(usersRef, where('email', '==', emailKey));
    const snap1 = await getDocs(q1);
    for (const d of snap1.docs) {
      await deleteDoc(doc(db, 'users', d.id));
    }

    const q2 = query(usersRef, where('email', '==', rawKey));
    const snap2 = await getDocs(q2);
    for (const d of snap2.docs) {
      await deleteDoc(doc(db, 'users', d.id));
    }

    console.log(`[Employee Manager] Employee deleted: ${emailKey} by ${session.email}`);
    return res.json({ success: true, message: "Employee account deleted successfully" });
  } catch (error: any) {
    console.error("[Delete Employee Error]:", error);
    return res.status(500).json({ error: "Failed to delete employee", details: error.message });
  }
});

app.delete("/api/employees", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const rawEmail = req.body.email || req.query.email;
  if (!rawEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  try {
    const decodedEmail = decodeURIComponent(String(rawEmail));
    const emailKey = decodedEmail.toLowerCase().trim();
    const rawKey = String(rawEmail).toLowerCase().trim();

    try {
      await deleteDoc(doc(db, 'users', emailKey));
    } catch (e) {}
    try {
      await deleteDoc(doc(db, 'users', rawKey));
    } catch (e) {}

    const usersRef = collection(db, 'users');
    const q1 = query(usersRef, where('email', '==', emailKey));
    const snap1 = await getDocs(q1);
    for (const d of snap1.docs) {
      await deleteDoc(doc(db, 'users', d.id));
    }

    const q2 = query(usersRef, where('email', '==', rawKey));
    const snap2 = await getDocs(q2);
    for (const d of snap2.docs) {
      await deleteDoc(doc(db, 'users', d.id));
    }

    console.log(`[Employee Manager] Employee deleted: ${emailKey} by ${session.email}`);
    return res.json({ success: true, message: "Employee account deleted successfully" });
  } catch (error: any) {
    console.error("[Delete Employee Error]:", error);
    return res.status(500).json({ error: "Failed to delete employee", details: error.message });
  }
});

// API route to reset an employee's password (master only)
app.post("/api/employees/:email/reset-password", async (req, res) => {
  const session = await validateSession(req);
  if (!session || session.role !== "master") {
    return res.status(401).json({ error: "Unauthorized. Master Admin access required." });
  }

  const { email } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: "New password is required" });
  }

  try {
    const emailKey = email.toLowerCase().trim();
    const userDocRef = doc(db, 'users', emailKey);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      return res.status(404).json({ error: "Employee not found" });
    }

    await updateDoc(userDocRef, {
      passwordHash: hashPassword(newPassword)
    });

    console.log(`[Employee Manager] Password reset for: ${emailKey} by ${session.email}`);
    return res.json({ success: true, message: "Password reset successfully" });
  } catch (error: any) {
    console.error("[Reset Password Error]:", error);
    return res.status(500).json({ error: "Failed to reset password", details: error.message });
  }
});

// API route to check SMTP authentication status dynamically
app.get("/api/smtp-status", async (req, res) => {
  return res.json({
    configured: false,
    status: "SMTP functionality has been deprecated in favor of Resend API."
  });
});

// Serve frontend assets in production and Vite dev server in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is booted and listening on http://localhost:${PORT}`);
    
    // Diagnostic logging for secrets
    console.log("\n=================== RUNTIME CONFIG DIAGNOSTIC ===================");
    console.log(`GOOGLE_MAPS_PLATFORM_KEY defined: ${!!process.env.GOOGLE_MAPS_PLATFORM_KEY}`);
    console.log(`VITE_GOOGLE_MAPS_PLATFORM_KEY defined: ${!!process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY}`);
    console.log(`ADMIN_PASSWORD defined: ${!!process.env.ADMIN_PASSWORD}`);
    console.log("=================================================================\n");

    // Auto-run verification on bootup if SMTP configured
    const isSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    if (isSmtpConfigured) {
      console.log("\n[BOOTUP SMTP DIAGNOSTIC] SMTP is configured, but SMTP functionality is deprecated in favor of Resend API.");
    } else {
      console.log("[BOOTUP SMTP INFO] SMTP environment variables are not set. Falling back to console simulation mode.");
    }
  });
}

startServer();
