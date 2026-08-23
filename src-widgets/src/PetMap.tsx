import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { Map as LeafletMap } from 'leaflet';
import { latLng } from 'leaflet';
import React, { memo, useEffect } from 'react';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';

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

interface MapControllerProps {
    latitude: number;
    longitude: number;
    range?: number;
    zoom: number;
    showAccuracyCircle: boolean;
    fitAccuracyRange: boolean;
}

function updateMapView(
    map: LeafletMap,
    latitude: number,
    longitude: number,
    range: number | undefined,
    zoom: number,
    showAccuracyCircle: boolean,
    fitAccuracyRange: boolean,
): void {
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

function MapController({
    latitude,
    longitude,
    range,
    zoom,
    showAccuracyCircle,
    fitAccuracyRange,
}: MapControllerProps): null {
    const map = useMap();

    useEffect(() => {
        updateMapView(map, latitude, longitude, range, zoom, showAccuracyCircle, fitAccuracyRange);
    }, [fitAccuracyRange, latitude, longitude, map, range, showAccuracyCircle, zoom]);

    useEffect(() => {
        const container = map.getContainer();
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize({ animate: false, pan: false });
            updateMapView(map, latitude, longitude, range, zoom, showAccuracyCircle, fitAccuracyRange);
        });
        resizeObserver.observe(container);
        map.invalidateSize({ animate: false, pan: false });
        return () => resizeObserver.disconnect();
    }, [fitAccuracyRange, latitude, longitude, map, range, showAccuracyCircle, zoom]);

    return null;
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

    const center: [number, number] = [latitude, longitude];
    const mapKey = `${minZoom}-${maxZoom}-${interactive}`;

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
            <MapContainer
                key={mapKey}
                center={center}
                zoom={zoom}
                minZoom={minZoom}
                maxZoom={maxZoom}
                zoomControl={interactive}
                dragging={interactive}
                scrollWheelZoom={interactive}
                doubleClickZoom={interactive}
                touchZoom={interactive}
                boxZoom={interactive}
                keyboard={interactive}
                style={{ width: '100%', height: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    minZoom={minZoom}
                    maxZoom={maxZoom}
                />
                {showAccuracyCircle && range !== undefined && range > 0 ? (
                    <Circle
                        center={center}
                        radius={range}
                        pathOptions={{
                            color: accuracyColor,
                            fillColor: accuracyColor,
                            fillOpacity: 0.18,
                            opacity: 0.9,
                            weight: 2,
                        }}
                    />
                ) : null}
                <CircleMarker
                    center={center}
                    radius={9}
                    pathOptions={{ color: '#ffffff', fillColor: accuracyColor, fillOpacity: 1, weight: 3 }}
                >
                    <Popup>
                        <strong>{title}</strong>
                        {accuracy !== undefined ? (
                            <>
                                <br />
                                {accuracyText}: ±{accuracy} m
                            </>
                        ) : null}
                    </Popup>
                </CircleMarker>
                <MapController
                    latitude={latitude}
                    longitude={longitude}
                    range={range}
                    zoom={zoom}
                    showAccuracyCircle={showAccuracyCircle}
                    fitAccuracyRange={fitAccuracyRange}
                />
            </MapContainer>
        </Box>
    );
}

export default memo(PetMap);
