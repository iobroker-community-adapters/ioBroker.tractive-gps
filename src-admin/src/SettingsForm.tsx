import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { I18n } from '@iobroker/gui-components';
import React, { useCallback, useState } from 'react';

export interface AdminConfig {
    email: string;
    password: string;
    interval: number;
    reverseGeocoding: boolean;
}

interface SettingsFormProps {
    native: AdminConfig;
    onChange: <Key extends keyof AdminConfig>(key: Key, value: AdminConfig[Key]) => void;
    onTestConnection: (email: string, password?: string) => Promise<boolean>;
}

const intervalMarks = [
    { value: 120, label: '2 min' },
    { value: 600, label: '10 min' },
    { value: 1800, label: '30 min' },
    { value: 3600, label: '60 min' },
];

export default function SettingsForm({ native, onChange, onTestConnection }: SettingsFormProps): React.JSX.Element {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<boolean | undefined>();
    const interval = Math.min(3600, Math.max(120, Number(native.interval) || 120));
    const testConnection = useCallback(async (): Promise<void> => {
        setTesting(true);
        setTestResult(undefined);
        try {
            setTestResult(await onTestConnection(native.email, native.password || undefined));
        } finally {
            setTesting(false);
        }
    }, [native.email, native.password, onTestConnection]);

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto', pb: 10 }}>
            <Stack spacing={2.5}>
                <Box>
                    <Typography
                        variant="h4"
                        component="h1"
                    >
                        {I18n.t('Tractive GPS settings')}
                    </Typography>
                    <Typography color="text.secondary">{I18n.t('Configure account and polling')}</Typography>
                </Box>

                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={2}>
                        <Typography
                            variant="h6"
                            component="h2"
                        >
                            {I18n.t('Account')}
                        </Typography>
                        <TextField
                            fullWidth
                            required
                            type="email"
                            autoComplete="username"
                            label={I18n.t('Email')}
                            value={native.email || ''}
                            onChange={event => onChange('email', event.target.value)}
                        />
                        <TextField
                            fullWidth
                            required
                            type="password"
                            autoComplete="current-password"
                            label={I18n.t('Password')}
                            value={native.password || ''}
                            onChange={event => onChange('password', event.target.value)}
                        />
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
                        >
                            <Button
                                variant="outlined"
                                disabled={testing || !native.email || !native.password}
                                onClick={() => void testConnection()}
                            >
                                {I18n.t(testing ? 'Testing connection' : 'Test connection')}
                            </Button>
                            {testResult === undefined ? null : (
                                <Alert severity={testResult ? 'success' : 'error'}>
                                    {I18n.t(testResult ? 'Connection successful' : 'Connection failed')}
                                </Alert>
                            )}
                        </Stack>
                    </Stack>
                </Paper>

                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={2}>
                        <Typography
                            variant="h6"
                            component="h2"
                        >
                            {I18n.t('Data updates')}
                        </Typography>
                        <Slider
                            min={120}
                            max={3600}
                            step={60}
                            marks={intervalMarks}
                            value={interval}
                            valueLabelDisplay="auto"
                            valueLabelFormat={value => `${Math.round(value / 60)} min`}
                            aria-label={I18n.t('Polling interval')}
                            onChange={(_event, value) => {
                                if (typeof value === 'number') {
                                    onChange('interval', value);
                                }
                            }}
                        />
                        <Typography
                            variant="body2"
                            color="text.secondary"
                        >
                            {I18n.t('Current interval')}: {Math.round(interval / 60)} min
                        </Typography>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={Boolean(native.reverseGeocoding)}
                                    onChange={event => onChange('reverseGeocoding', event.target.checked)}
                                />
                            }
                            label={I18n.t('Resolve coordinates to an address')}
                        />
                        <Alert severity="info">{I18n.t('Reverse geocoding privacy note')}</Alert>
                    </Stack>
                </Paper>
            </Stack>
        </Box>
    );
}
