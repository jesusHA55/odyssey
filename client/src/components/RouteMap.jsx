import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TYPE_CLASSES = {
  start: 'marker--start',
  end: 'marker--end',
  meal: 'marker--meal',
  stop: 'marker--stop',
};

function numberIcon(index, type) {
  const modifier = TYPE_CLASSES[type] ?? 'marker--stop';
  return L.divIcon({
    className: 'marker-wrapper',
    html: `<div class="marker ${modifier}">${index}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export default function RouteMap({ route }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView([40.4168, -3.7038], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const points = (route || []).filter(
      (item) => Number.isFinite(item.lat) && Number.isFinite(item.lng),
    );
    if (!points.length) return;

    const latlngs = points.map((item) => [item.lat, item.lng]);

    L.polyline(latlngs, {
      color: '#2563eb',
      weight: 3,
      opacity: 0.75,
      dashArray: '6 6',
    }).addTo(layer);

    points.forEach((point, index) => {
      const marker = L.marker(latlngs[index], { icon: numberIcon(index + 1, point.type) });
      const popup = [
        `<strong>${escapeHtml(point.location)}</strong>`,
        point.address ? escapeHtml(point.address) : '',
        `${formatTime(point.arrival)} - ${formatTime(point.departure)}`,
        point.activity ? escapeHtml(point.activity) : '',
      ]
        .filter(Boolean)
        .join('<br/>');
      marker.bindPopup(popup);
      marker.addTo(layer);
    });

    map.fitBounds(L.latLngBounds(latlngs).pad(0.2));
  }, [route]);

  return <div className="map" ref={containerRef} />;
}
