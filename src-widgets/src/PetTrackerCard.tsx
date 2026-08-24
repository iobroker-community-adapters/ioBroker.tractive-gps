import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ThemeProvider } from '@mui/material/styles';
import type { RxRenderWidgetProps, RxWidgetInfo, RxWidgetInfoAttributesField } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';
import React from 'react';

import PetImage from './PetImage';
import PetMap from './PetMap';

interface PetTrackerCardData {
    trackerNameOid: string;
    petNameOid: string;
    petTypeOid: string;
    genderOid: string;
    birthdayOid: string;
    weightOid: string;
    batteryOid: string;
    onlineOid: string;
    staleOid: string;
    lastSeenOid: string;
    connectionTypeOid: string;
    sensorUsedOid: string;
    homeOid: string;
    distanceOid: string;
    powerSavingOid: string;
    positionAccuracyOid: string;
    latitudeOid: string;
    longitudeOid: string;
    addressOid: string;
    imageOid: string;
    customImage: string;
    mapZoom: number;
    mapRange: number;
    mapMinZoom: number;
    mapMaxZoom: number;
    mapInteractive: boolean;
    showAccuracyCircle: boolean;
    fitAccuracyRange: boolean;
    accuracyColor: string;
}

const cardStyle = { width: '100%', height: '100%', minWidth: 300, overflow: 'auto' } as const;

interface InfoRowProps {
    icon: string;
    label: string;
    value: string;
}

function InfoRow({ icon, label, value }: InfoRowProps): React.JSX.Element {
    return (
        <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
        >
            <Typography aria-hidden="true">{icon}</Typography>
            <Box minWidth={0}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                >
                    {label}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{ overflowWrap: 'anywhere' }}
                >
                    {value}
                </Typography>
            </Box>
        </Stack>
    );
}

export default class PetTrackerCard extends (window.visRxWidget as typeof VisRxWidget)<PetTrackerCardData> {
    static getWidgetInfo(): RxWidgetInfo {
        const idField = (name: keyof PetTrackerCardData, label: string): RxWidgetInfoAttributesField => ({
            name,
            label,
            type: 'id',
        });
        return {
            id: 'tractiveGpsPetTrackerCard',
            visSet: 'tractive-gps',
            visSetLabel: 'widget_set',
            visSetColor: '#0098d8',
            visName: PetTrackerCard.t('pet_tracker_card'),
            visPrev: '/adapter/tractive-gps/tractive-gps.png',
            visDefaultStyle: { width: 540, height: 920 },
            visAttrs: [
                {
                    name: 'common',
                    label: 'states',
                    fields: [
                        idField('trackerNameOid', 'tracker_name_state'),
                        idField('petNameOid', 'pet_name_state'),
                        idField('petTypeOid', 'pet_type_state'),
                        idField('genderOid', 'gender_state'),
                        idField('birthdayOid', 'birthday_state'),
                        idField('weightOid', 'weight_state'),
                        idField('batteryOid', 'battery_state'),
                        idField('onlineOid', 'online_state'),
                        idField('staleOid', 'stale_state'),
                        idField('lastSeenOid', 'last_seen_state'),
                        idField('connectionTypeOid', 'connection_type_state'),
                        idField('sensorUsedOid', 'sensor_used_state'),
                        idField('homeOid', 'home_state'),
                        idField('distanceOid', 'distance_state'),
                        idField('powerSavingOid', 'power_saving_state'),
                        idField('positionAccuracyOid', 'position_accuracy_state'),
                        idField('latitudeOid', 'latitude_state'),
                        idField('longitudeOid', 'longitude_state'),
                        idField('addressOid', 'address_state'),
                        idField('imageOid', 'api_image_state'),
                    ],
                },
                {
                    name: 'appearance',
                    label: 'appearance',
                    fields: [
                        { name: 'customImage', label: 'custom_image', type: 'image' },
                        { name: 'mapZoom', label: 'map_zoom', type: 'number', default: 16, min: 1, max: 19 },
                        {
                            name: 'mapRange',
                            label: 'map_range',
                            type: 'number',
                            default: 0,
                            min: 0,
                            max: 1_000_000,
                        },
                        { name: 'mapMinZoom', label: 'map_min_zoom', type: 'number', default: 3, min: 1, max: 19 },
                        { name: 'mapMaxZoom', label: 'map_max_zoom', type: 'number', default: 19, min: 1, max: 19 },
                        { name: 'mapInteractive', label: 'map_interactive', type: 'checkbox', default: true },
                        {
                            name: 'showAccuracyCircle',
                            label: 'show_accuracy_circle',
                            type: 'checkbox',
                            default: true,
                        },
                        {
                            name: 'fitAccuracyRange',
                            label: 'fit_accuracy_range',
                            type: 'checkbox',
                            default: true,
                        },
                        { name: 'accuracyColor', label: 'accuracy_color', type: 'color' },
                    ],
                },
            ],
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getWidgetInfo(): RxWidgetInfo {
        return PetTrackerCard.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return 'tractive-gps_';
    }

    private value(name: keyof PetTrackerCardData): ioBroker.StateValue | undefined {
        const objectId = this.state.rxData[name];
        return typeof objectId === 'string' && objectId ? this.state.values[`${objectId}.val`] : undefined;
    }

    private stringValue(name: keyof PetTrackerCardData): string | undefined {
        const value = this.value(name);
        return typeof value === 'string' && value ? value : undefined;
    }

    private numberValue(name: keyof PetTrackerCardData): number | undefined {
        const value = this.value(name);
        return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    }

    private resolveImagePath(value: string | undefined): string | undefined {
        if (!value?.startsWith('_PRJ_NAME')) {
            return value;
        }
        const { adapterName, instance, projectName } = this.props.context;
        return `../${adapterName}.${instance}/${projectName}${value.substring(9)}`;
    }

    private static formatDate(value: ioBroker.StateValue | undefined): string {
        return typeof value === 'number' && Number.isFinite(value) ? new Date(value).toLocaleString() : '—';
    }

    private static formatAge(value: ioBroker.StateValue | undefined): string {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return '—';
        }
        return String(Math.max(0, Math.floor((Date.now() - value) / 31_556_952_000)));
    }

    private static formatDistance(value: number | undefined): string {
        if (value === undefined) {
            return '—';
        }
        return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const trackerName = this.stringValue('trackerNameOid');
        const petName = this.stringValue('petNameOid');
        const title = petName ?? trackerName ?? '—';
        const batteryValue = this.numberValue('batteryOid');
        const battery = batteryValue === undefined ? undefined : Math.min(100, Math.max(0, batteryValue));
        const online = this.value('onlineOid') === true;
        const stale = this.value('staleOid') === true;
        const latitude = this.numberValue('latitudeOid');
        const longitude = this.numberValue('longitudeOid');
        const address = this.stringValue('addressOid');
        const petType = this.stringValue('petTypeOid');
        const apiImage = this.stringValue('imageOid');
        const customImage = this.resolveImagePath(this.state.rxData.customImage);
        const configuredMinZoom = Number.isFinite(this.state.rxData.mapMinZoom) ? this.state.rxData.mapMinZoom : 3;
        const configuredMaxZoom = Number.isFinite(this.state.rxData.mapMaxZoom) ? this.state.rxData.mapMaxZoom : 19;
        const mapMinZoom = Math.min(19, Math.max(1, Math.round(configuredMinZoom)));
        const mapMaxZoom = Math.min(19, Math.max(mapMinZoom, Math.round(configuredMaxZoom)));
        const configuredZoom = Number.isFinite(this.state.rxData.mapZoom) ? this.state.rxData.mapZoom : 16;
        const mapZoom = Math.min(mapMaxZoom, Math.max(mapMinZoom, Math.round(configuredZoom)));
        const mapInteractive = this.state.rxData.mapInteractive !== false;
        const showAccuracyCircle = this.state.rxData.showAccuracyCircle !== false;
        const fitAccuracyRange = this.state.rxData.fitAccuracyRange !== false;
        const accuracyColor = this.state.rxData.accuracyColor || this.props.context.theme.palette.primary.main;
        const configured = Boolean(this.state.rxData.petNameOid || this.state.rxData.trackerNameOid);
        const accuracy = this.numberValue('positionAccuracyOid');
        const configuredRange = Number.isFinite(this.state.rxData.mapRange) ? this.state.rxData.mapRange : 0;
        const mapRange = configuredRange > 0 ? Math.min(1_000_000, configuredRange) : accuracy;
        const weight = this.numberValue('weightOid');
        const sensorUsed = this.stringValue('sensorUsedOid');
        const homeValue = this.value('homeOid');
        const normalizedSensor = sensorUsed?.toUpperCase();
        const home =
            typeof homeValue === 'boolean'
                ? homeValue
                : normalizedSensor === 'KNOWN_WIFI'
                  ? true
                  : normalizedSensor === 'GPS'
                    ? false
                    : undefined;
        const locationStatus = home === undefined ? '—' : PetTrackerCard.t(home ? 'home' : 'away');
        const distance = this.numberValue('distanceOid');

        return (
            <ThemeProvider theme={this.props.context.theme}>
                <Card
                    style={cardStyle}
                    aria-label={PetTrackerCard.t('pet_tracker_card')}
                    elevation={3}
                    sx={{ bgcolor: 'background.paper', color: 'text.primary' }}
                >
                    {configured ? (
                        <Stack>
                            <Stack
                                direction="row"
                                spacing={1.5}
                                alignItems="center"
                                justifyContent="space-between"
                                sx={{ p: 2 }}
                            >
                                <Stack
                                    direction="row"
                                    spacing={1.25}
                                    alignItems="center"
                                    minWidth={0}
                                >
                                    <Box
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: '50%',
                                            display: 'grid',
                                            placeItems: 'center',
                                            bgcolor: 'primary.main',
                                            color: 'primary.contrastText',
                                            flexShrink: 0,
                                        }}
                                        aria-hidden="true"
                                    >
                                        🐾
                                    </Box>
                                    <Box minWidth={0}>
                                        <Typography
                                            variant="h6"
                                            noWrap
                                        >
                                            {title}
                                        </Typography>
                                        {trackerName && trackerName !== title ? (
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                noWrap
                                            >
                                                {trackerName}
                                            </Typography>
                                        ) : null}
                                    </Box>
                                </Stack>
                                <Stack
                                    direction="row"
                                    spacing={0.75}
                                    alignItems="center"
                                >
                                    {petType ? (
                                        <Chip
                                            size="small"
                                            variant="outlined"
                                            label={petType}
                                        />
                                    ) : null}
                                    <Chip
                                        size="small"
                                        color={online && !stale ? 'success' : 'default'}
                                        label={PetTrackerCard.t(stale ? 'stale' : online ? 'online' : 'offline')}
                                    />
                                </Stack>
                            </Stack>

                            <PetImage
                                apiImage={apiImage}
                                customImage={customImage}
                                alt={title}
                                placeholder={PetTrackerCard.t('pet_image')}
                            />

                            <Box sx={{ p: 2, pb: 0 }}>
                                <Box sx={{ borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
                                    <PetMap
                                        latitude={latitude}
                                        longitude={longitude}
                                        accuracy={accuracy}
                                        range={mapRange}
                                        zoom={mapZoom}
                                        minZoom={mapMinZoom}
                                        maxZoom={mapMaxZoom}
                                        interactive={mapInteractive}
                                        showAccuracyCircle={showAccuracyCircle}
                                        fitAccuracyRange={fitAccuracyRange}
                                        accuracyColor={accuracyColor}
                                        accuracyText={PetTrackerCard.t('position_accuracy')}
                                        noLocationText={PetTrackerCard.t('no_location')}
                                        title={`${PetTrackerCard.t('location')}: ${title}`}
                                    />
                                </Box>
                            </Box>

                            <Box sx={{ p: 2 }}>
                                <Divider sx={{ mb: 2 }} />
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' },
                                        gap: 2.5,
                                    }}
                                >
                                    <Stack spacing={1.5}>
                                        <InfoRow
                                            icon="📶"
                                            label={PetTrackerCard.t('connection')}
                                            value={this.stringValue('connectionTypeOid') ?? '—'}
                                        />
                                        <InfoRow
                                            icon="🕒"
                                            label={PetTrackerCard.t('last_update')}
                                            value={PetTrackerCard.formatDate(this.value('lastSeenOid'))}
                                        />
                                        <InfoRow
                                            icon="🏠"
                                            label={PetTrackerCard.t('location_status')}
                                            value={sensorUsed ? `${locationStatus} · ${sensorUsed}` : locationStatus}
                                        />
                                        <InfoRow
                                            icon="📏"
                                            label={PetTrackerCard.t('distance')}
                                            value={PetTrackerCard.formatDistance(distance)}
                                        />
                                        <InfoRow
                                            icon="🔋"
                                            label={PetTrackerCard.t('power_saving')}
                                            value={PetTrackerCard.t(
                                                this.value('powerSavingOid') === true ? 'yes' : 'no',
                                            )}
                                        />
                                        <InfoRow
                                            icon="📍"
                                            label={PetTrackerCard.t('address')}
                                            value={address ?? '—'}
                                        />
                                    </Stack>
                                    <Stack spacing={1.5}>
                                        <Box>
                                            <InfoRow
                                                icon="🔋"
                                                label={PetTrackerCard.t('battery')}
                                                value={battery === undefined ? '—' : `${battery}%`}
                                            />
                                            <LinearProgress
                                                variant="determinate"
                                                value={battery ?? 0}
                                                color={battery !== undefined && battery < 20 ? 'error' : 'success'}
                                                aria-label={PetTrackerCard.t('battery')}
                                                sx={{ mt: 0.75, height: 7, borderRadius: 2 }}
                                            />
                                        </Box>
                                        <InfoRow
                                            icon="🎯"
                                            label={PetTrackerCard.t('position_accuracy')}
                                            value={accuracy === undefined ? '—' : `±${accuracy} m`}
                                        />
                                        <InfoRow
                                            icon="⚥"
                                            label={PetTrackerCard.t('gender')}
                                            value={this.stringValue('genderOid') ?? '—'}
                                        />
                                        <InfoRow
                                            icon="ℹ️"
                                            label={PetTrackerCard.t('age')}
                                            value={`${PetTrackerCard.formatAge(this.value('birthdayOid'))} ${PetTrackerCard.t('years')}`}
                                        />
                                        <InfoRow
                                            icon="⚖️"
                                            label={PetTrackerCard.t('weight')}
                                            value={weight === undefined ? '—' : `${weight} kg`}
                                        />
                                    </Stack>
                                </Box>
                            </Box>
                        </Stack>
                    ) : (
                        <Stack
                            sx={{ height: '100%', minHeight: 260 }}
                            alignItems="center"
                            justifyContent="center"
                            spacing={1}
                        >
                            <Typography
                                aria-hidden="true"
                                color="text.disabled"
                                fontSize="3rem"
                            >
                                🐾
                            </Typography>
                            <Typography color="text.secondary">{PetTrackerCard.t('not_configured')}</Typography>
                        </Stack>
                    )}
                </Card>
            </ThemeProvider>
        );
    }
}
