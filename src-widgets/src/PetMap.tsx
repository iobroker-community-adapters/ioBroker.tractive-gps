import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
    circle,
    circleMarker,
    latLng,
    map as createMap,
    tileLayer,
    type Circle,
    type CircleMarker,
    type Map as LeafletMap,
} from 'leaflet';
import React, { memo, useEffect, useRef } from 'react';

import 'leaflet/dist/leaflet.css';

interface PetMapProps {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    range?: number;
    zoom: number;
    minZoom: number;
    maxZoom: number;
    interactive: boolean;
    showAccuracyCircle: boolean;
    fitAccuracyRange: boolean;
    accuracyColor: string;
    accuracyText: string;
    noLocationText: string;
    title: string;
}

interface LeafletMapViewProps extends Omit<PetMapProps, 'latitude' | 'longitude' | 'noLocationText'> {
    latitude: number;
    longitude: number;
}

interface MapViewState {
    latitude: number;
    longitude: number;
    range?: number;
    zoom: number;
    showAccuracyCircle: boolean;
    fitAccuracyRange: boolean;
}

function updateMapView(map: LeafletMap, state: MapViewState): void {
    const { latitude, longitude, range, zoom, showAccuracyCircle, fitAccuracyRange } = state;
    if (fitAccuracyRange && showAccuracyCircle && range !== undefined && range > 0) {
        map.fitBounds(latLng(latitude, longitude).toBounds(range * 2), {
            animate: false,
            maxZoom: zoom,
            padding: [24, 24],
        });
    } else {
        map.setView([latitude, longitude], zoom, { animate: false });
    }
}

function createPopupContent(title: string, accuracyText: string, accuracy?: number): HTMLElement {
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = title;
    content.appendChild(heading);
    if (accuracy !== undefined) {
        content.appendChild(document.createElement('br'));
        content.appendChild(document.createTextNode(`${accuracyText}: ±${accuracy} m`));
    }
    return content;
}

function LeafletMapView({
    latitude,
    longitude,
    accuracy,
    range,
    zoom,
    minZoom,
    maxZoom,
    interactive,
    showAccuracyCircle,
    fitAccuracyRange,
    accuracyColor,
    accuracyText,
    title,
}: LeafletMapViewProps): React.JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<LeafletMap | null>(null);
    const markerRef = useRef<CircleMarker | null>(null);
    const accuracyCircleRef = useRef<Circle | null>(null);
    const viewStateRef = useRef<MapViewState>({
        latitude,
        longitude,
        range,
        zoom,
        showAccuracyCircle,
        fitAccuracyRange,
    });
    useEffect(() => {
        viewStateRef.current = { latitude, longitude, range, zoom, showAccuracyCircle, fitAccuracyRange };
    }, [fitAccuracyRange, latitude, longitude, range, showAccuracyCircle, zoom]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return undefined;
        }

        const map = createMap(container, {
            center: [0, 0],
            zoom: minZoom,
            minZoom,
            maxZoom,
            zoomControl: interactive,
            dragging: interactive,
            scrollWheelZoom: interactive,
            doubleClickZoom: interactive,
            touchZoom: interactive,
            boxZoom: interactive,
            keyboard: interactive,
        });
        tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            minZoom,
            maxZoom,
        }).addTo(map);
        const marker = circleMarker([0, 0], {
            color: '#ffffff',
            fillColor: '#3388ff',
            fillOpacity: 1,
            radius: 9,
            weight: 3,
        }).addTo(map);

        mapRef.current = map;
        markerRef.current = marker;
        updateMapView(map, viewStateRef.current);

        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize({ animate: false, pan: false });
            updateMapView(map, viewStateRef.current);
        });
        resizeObserver.observe(container);
        const animationFrame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false, pan: false }));

        return () => {
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            map.remove();
            mapRef.current = null;
            markerRef.current = null;
            accuracyCircleRef.current = null;
        };
    }, [interactive, maxZoom, minZoom]);

    useEffect(() => {
        const map = mapRef.current;
        const marker = markerRef.current;
        if (!map || !marker) {
            return;
        }

        const center: [number, number] = [latitude, longitude];
        marker.setLatLng(center);
        marker.setStyle({ fillColor: accuracyColor });
        marker.bindPopup(createPopupContent(title, accuracyText, accuracy));

        if (showAccuracyCircle && range !== undefined && range > 0) {
            if (!accuracyCircleRef.current) {
                accuracyCircleRef.current = circle(center, { radius: range }).addTo(map);
            }
            accuracyCircleRef.current.setLatLng(center).setRadius(range).setStyle({
                color: accuracyColor,
                fillColor: accuracyColor,
                fillOpacity: 0.18,
                opacity: 0.9,
                weight: 2,
            });
        } else if (accuracyCircleRef.current) {
            accuracyCircleRef.current.removeFrom(map);
            accuracyCircleRef.current = null;
        }

        updateMapView(map, viewStateRef.current);
    }, [
        accuracy,
        accuracyColor,
        accuracyText,
        fitAccuracyRange,
        interactive,
        latitude,
        longitude,
        maxZoom,
        minZoom,
        range,
        showAccuracyCircle,
        title,
        zoom,
    ]);

    return (
        <Box
            ref={containerRef}
            sx={{ width: '100%', height: '100%' }}
        />
    );
}

function PetMap({
    latitude,
    longitude,
    accuracy,
    range,
    zoom,
    minZoom,
    maxZoom,
    interactive,
    showAccuracyCircle,
    fitAccuracyRange,
    accuracyColor,
    accuracyText,
    noLocationText,
    title,
}: PetMapProps): React.JSX.Element {
    if (latitude === undefined || longitude === undefined) {
        return (
            <Box
                sx={{ minHeight: 220, display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}
                role="status"
            >
                <Typography color="text.secondary">{noLocationText}</Typography>
            </Box>
        );
    }

    return (
        <Box
            role="region"
            aria-label={title}
            sx={{
                height: 240,
                bgcolor: 'action.hover',
                '& .leaflet-container': { fontFamily: 'inherit' },
                '& .leaflet-control-zoom a, & .leaflet-popup-content-wrapper': {
                    bgcolor: 'background.paper',
                    color: 'text.primary',
                },
                '& .leaflet-popup-tip': { bgcolor: 'background.paper' },
                '& .leaflet-control-attribution': { bgcolor: 'background.paper', color: 'text.secondary' },
            }}
        >
            <LeafletMapView
                latitude={latitude}
                longitude={longitude}
                accuracy={accuracy}
                range={range}
                zoom={zoom}
                minZoom={minZoom}
                maxZoom={maxZoom}
                interactive={interactive}
                showAccuracyCircle={showAccuracyCircle}
                fitAccuracyRange={fitAccuracyRange}
                accuracyColor={accuracyColor}
                accuracyText={accuracyText}
                title={title}
            />
        </Box>
    );
}

export default memo(PetMap);
