import React, { useEffect, useRef } from 'react';
import { Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

export const GoogleMapComponent = ({ pickup, dropoff, stops, onRouteComputed, onErrorComputed, isHourly }: any) => {
    const map = useMap();
    const geometryLib = useMapsLibrary('geometry');
    const polylinesRef = useRef<google.maps.Polyline[]>([]);

    useEffect(() => {
        if (!map || (!pickup && !dropoff && (!stops || stops.length === 0))) return;

        const bounds = new google.maps.LatLngBounds();

        if (pickup && pickup.lat && pickup.lng) {
            bounds.extend({ lat: pickup.lat, lng: pickup.lng });
        }
        if (dropoff && dropoff.lat && dropoff.lng) {
            bounds.extend({ lat: dropoff.lat, lng: dropoff.lng });
        }
        if (stops) {
            stops.forEach((s: any) => {
                if (s.lat && s.lng) {
                    bounds.extend({ lat: s.lat, lng: s.lng });
                }
            });
        }

        // Only fit bounds if we have extended at least once,
        // which means we have at least one valid point.
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, 50); // 50px padding
        }
    }, [map, pickup, dropoff, stops]);

    useEffect(() => {
        // Clear previous route
        polylinesRef.current.forEach(p => p.setMap(null));
        polylinesRef.current = [];

        if (isHourly) {
            return;
        }

        if (!map || !pickup || !dropoff || !geometryLib) return;

        const controller = new AbortController();

        const waypoints = stops.filter((s: any) => s.lat && s.lng).map((s: any) => ({
            location: { latLng: { latitude: s.lat, longitude: s.lng } }
        }));

        if (pickup.lat === undefined || pickup.lng === undefined || dropoff.lat === undefined || dropoff.lng === undefined) {
          console.warn("[Map] Pickup or dropoff coordinates missing, skipping route calculation.");
          return;
        }

        const request = {
            origin: { location: { latLng: { latitude: pickup.lat, longitude: pickup.lng } } },
            destination: { location: { latLng: { latitude: dropoff.lat, longitude: dropoff.lng } } },
            travelMode: 'DRIVE',
            intermediates: waypoints,
            routingPreference: 'TRAFFIC_AWARE',
        };

        // Call the proxy endpoint
        fetch("/api/routes/compute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: controller.signal
        })
        .then(res => res.json())
        .then(data => {
            if (controller.signal.aborted) return;
            if (data.routes && data.routes[0]) {
                const route = data.routes[0];
                const path = geometryLib.encoding.decodePath(route.polyline.encodedPolyline);
                
                const polyline = new google.maps.Polyline({
                    path: path,
                    strokeColor: "#15803d",
                    strokeOpacity: 0.8,
                    strokeWeight: 4,
                });
                polyline.setMap(map);
                polylinesRef.current = [polyline];

                // Compute distance in miles from meters
                const distMiles = (route.distanceMeters || 0) / 1609.34;
                const roundedMiles = Math.round(distMiles * 10) / 10;

                // Compute duration in minutes
                const durationSeconds = parseInt(route.duration.replace('s', ''));
                const durationMinutes = Math.ceil(durationSeconds / 60);

                onRouteComputed(roundedMiles, durationMinutes);
            } else {
              console.error("[Map] Routes API response invalid or empty", data);
              if (onErrorComputed) onErrorComputed();
            }
        })
        .catch(err => {
            if (err.name === 'AbortError') return;
            console.error("[Map] Routes API request failed", err);
            if (onErrorComputed) onErrorComputed();
        });

        return () => {
            controller.abort();
        };
    }, [
        pickup?.lat, 
        pickup?.lng, 
        dropoff?.lat, 
        dropoff?.lng, 
        stops ? stops.map((s: any) => `${s.lat},${s.lng}`).join('|') : '', 
        map, 
        geometryLib, 
        onRouteComputed, 
        onErrorComputed
    ]);

    return (
        <Map
            defaultCenter={{ lat: 39.2904, lng: -76.6122 }}
            defaultZoom={10}
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
        >
            {pickup && <AdvancedMarker position={{ lat: pickup.lat, lng: pickup.lng }}><Pin background="#15803d" glyphColor="#fff" /></AdvancedMarker>}
            {dropoff && <AdvancedMarker position={{ lat: dropoff.lat, lng: dropoff.lng }}><Pin background="#ef4444" glyphColor="#fff" /></AdvancedMarker>}
            {stops && stops.map((s: any, i: number) => (
                s.lat && s.lng && <AdvancedMarker key={i} position={{ lat: s.lat, lng: s.lng }}><Pin background="#f59e0b" glyphColor="#fff" /></AdvancedMarker>
            ))}
        </Map>
    );
};
