// DP Assistant — Carte Google Maps de choix des coordonnées d'un site.

import React, { useState, useEffect, useEffectEvent, useRef } from 'react';

// Mapping ISO code → emoji drapeau
function flagEmoji(iso2) {
  if (!iso2 || iso2.length !== 2) return '';
  const A = 0x1f1e6 - 'A'.charCodeAt(0);
  return String.fromCodePoint(iso2.toUpperCase().charCodeAt(0) + A, iso2.toUpperCase().charCodeAt(1) + A);
}

// Reverse geocoding via Google Geocoder (utilise l'API déjà chargée)
async function reverseGeocode(lat, lng) {
  if (!window.google?.maps) return null;
  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== 'OK' || !results?.length) return resolve(null);
      const components = results[0].address_components || [];
      const find = (type) => components.find((c) => c.types.includes(type));
      const ville = find('locality') || find('postal_town') || find('administrative_area_level_2');
      const pays = find('country');
      const region = find('administrative_area_level_1');
      resolve({
        ville: ville?.long_name || null,
        pays: pays?.long_name || null,
        pays_code: pays?.short_name || null,
        region: region?.long_name || null,
      });
    });
  });
}

// Default map center — Méditerranée française
const MAP_DEFAULT = { lat: 43.3, lng: 5.4 };

// ── MapPicker ──────────────────────────────────────────────────────────────
function MapPicker({ coordonnees, onChange }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const searchRef = useRef(null);
  const [ready, setReady] = useState(!!window.__gmapsLoaded);

  useEffect(() => {
    if (window.__gmapsLoaded) {
      setReady(true);
      return;
    }
    const onReady = () => setReady(true);
    window.addEventListener('gmaps:ready', onReady);
    return () => window.removeEventListener('gmaps:ready', onReady);
  }, []);

  // La carte est créée une fois (quand Maps est prêt) sur les coordonnées du
  // moment ; ses écouteurs remontent toujours vers le onChange courant.
  const initialCoords = useEffectEvent(() => coordonnees);
  const emitCoords = useEffectEvent((coords) => onChange(coords));

  useEffect(() => {
    if (!ready || !containerRef.current) return;

    const initial = initialCoords();
    const center = initial?.lat && initial?.lng ? { lat: Number(initial.lat), lng: Number(initial.lng) } : MAP_DEFAULT;

    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: initial?.lat && initial?.lng ? 13 : 7,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
      },
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    if (initial?.lat && initial?.lng) {
      const m = new google.maps.Marker({ position: center, map, draggable: true });
      m.addListener('dragend', (e) => emitCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
      markerRef.current = m;
    }

    map.addListener('click', (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      if (markerRef.current) {
        markerRef.current.setPosition(e.latLng);
      } else {
        const m = new google.maps.Marker({ position: e.latLng, map, draggable: true });
        m.addListener('dragend', (ev) => emitCoords({ lat: ev.latLng.lat(), lng: ev.latLng.lng() }));
        markerRef.current = m;
      }
      emitCoords({ lat, lng });
    });

    if (searchRef.current) {
      const ac = new google.maps.places.Autocomplete(searchRef.current, {
        types: ['geocode', 'establishment'],
      });
      ac.bindTo('bounds', map);
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry?.location) return;
        map.setCenter(place.geometry.location);
        map.setZoom(14);
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        if (markerRef.current) {
          markerRef.current.setPosition(place.geometry.location);
        } else {
          const m = new google.maps.Marker({
            position: place.geometry.location,
            map,
            draggable: true,
          });
          m.addListener('dragend', (ev) => emitCoords({ lat: ev.latLng.lat(), lng: ev.latLng.lng() }));
          markerRef.current = m;
        }
        emitCoords({ lat, lng });
        if (place.name) window.__lastPlaceName = place.name;
      });
    }

    return () => {
      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [ready]);

  if (!ready) {
    return <div className="map-placeholder">Chargement de la carte… (connexion requise)</div>;
  }

  return (
    <div className="map-picker">
      <input
        ref={searchRef}
        className="input"
        aria-label="Rechercher un lieu sur la carte"
        placeholder="Rechercher un lieu, une épave, un site"
      />
      <div ref={containerRef} className="map-canvas" />
      {coordonnees?.lat && (
        <div className="map-coords">
          {Number(coordonnees.lat).toFixed(6)}, {Number(coordonnees.lng).toFixed(6)}{' '}
          <a
            href={`https://www.google.com/maps?q=${coordonnees.lat},${coordonnees.lng}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ouvrir dans Google Maps
          </a>
        </div>
      )}
    </div>
  );
}

export { MapPicker, flagEmoji, reverseGeocode };
