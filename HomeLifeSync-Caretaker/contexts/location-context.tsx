'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Geolocation } from '@capacitor/geolocation';

interface LocationContextType {
  coordinates: { latitude: number; longitude: number } | null;
  loading: boolean;
  error: string | null;
}

const LocationContext = createContext<LocationContextType>({
  coordinates: null,
  loading: true,
  error: null
});

export function LocationProvider({ children }: { children: ReactNode }) {
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000
        });
        
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setError(null);
      } catch (err) {
        console.error('Location error:', err);
        setError('GPS unavailable');
        // Fallback to Coimbatore coordinates
        setCoordinates({ latitude: 11.0168, longitude: 76.9558 });
      } finally {
        setLoading(false);
      }
    };

    fetchLocation();
  }, []);

  return (
    <LocationContext.Provider value={{ coordinates, loading, error }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  return useContext(LocationContext);
}
