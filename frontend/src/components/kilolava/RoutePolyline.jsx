import { useEffect } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

// Da usare DENTRO <Map> con APIProvider libraries={['geometry']}
export const RoutePolyline = ({ encoded, color = '#2563eb', weight = 5, opacity = 0.85 }) => {
  const map = useMap();
  const geometry = useMapsLibrary('geometry');
  useEffect(() => {
    if (!map || !geometry || !encoded) return undefined;
    const path = geometry.encoding.decodePath(encoded);
    const line = new window.google.maps.Polyline({
      path, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, map,
    });
    return () => line.setMap(null);
  }, [map, geometry, encoded, color, weight, opacity]);
  return null;
};

export const FitPoints = ({ points, padding = 56 }) => {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (!map) return;
    const pts = JSON.parse(key);
    if (pts.length === 0) return;
    if (pts.length === 1) { map.setCenter(pts[0]); return; }
    const b = new window.google.maps.LatLngBounds();
    pts.forEach((p) => b.extend(p));
    map.fitBounds(b, padding);
  }, [map, key, padding]);
  return null;
};
