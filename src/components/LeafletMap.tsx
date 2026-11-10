import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const haversineDistance = (coords1: any, coords2: any) => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 3959; // Earth's radius in miles
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLng = toRad(coords2.lng - coords1.lng);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(coords1.lat)) * Math.cos(toRad(coords2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const LeafletMap = ({ pickup, dropoff, stops, onRouteComputed }: any) => {
    const center = pickup ? [pickup.lat, pickup.lng] : [39.2904, -76.6122]; // Default to Baltimore
    
    useEffect(() => {
        if (pickup && dropoff) {
            const dist = haversineDistance(pickup, dropoff);
            onRouteComputed(dist);
        }
    }, [pickup, dropoff, onRouteComputed]);

    return (
        <MapContainer center={center as any} zoom={13} style={{ height: '350px', width: '100%' }}>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {pickup && <Marker position={[pickup.lat, pickup.lng] as any} />}
            {dropoff && <Marker position={[dropoff.lat, dropoff.lng] as any} />}
            {stops && stops.map((s: any, i: number) => (
                s.lat && s.lng && <Marker key={i} position={[s.lat, s.lng] as any} />
            ))}
            {pickup && dropoff && <Polyline positions={[[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]] as any} color="blue" />}
        </MapContainer>
    );
};
