import { GenericApp, type GenericAppProps, type GenericAppState, I18n, Loader } from '@iobroker/gui-components';
import { AdminConnection } from '@iobroker/socket-client';
import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import React from 'react';

import de from '../../admin/i18n/de.json';
import en from '../../admin/i18n/en.json';
import es from '../../admin/i18n/es.json';
import fr from '../../admin/i18n/fr.json';
import it from '../../admin/i18n/it.json';
import nl from '../../admin/i18n/nl.json';
import pl from '../../admin/i18n/pl.json';
import pt from '../../admin/i18n/pt.json';
import ru from '../../admin/i18n/ru.json';
import uk from '../../admin/i18n/uk.json';
import zhCn from '../../admin/i18n/zh-cn.json';
import SettingsForm, { type AdminConfig } from './SettingsForm';

interface AppState extends GenericAppState {
    native: AdminConfig;
}

const translations = { en, de, es, fr, it, nl, pl, pt, ru, uk, 'zh-cn': zhCn };

export default class App extends GenericApp<GenericAppProps, AppState> {
    private savedPlainNative: AdminConfig | null = null;
    private storedPassword = '';

    constructor(props: GenericAppProps) {
        super(props, {
            adapterName: 'tractive-gps',
            // GenericApp expects the constructor at runtime, although its public type currently describes an instance.
            Connection: AdminConnection as unknown as NonNullable<GenericAppProps['Connection']>,
            translations,
        });
    }

    override onPrepareLoad(settings: Record<string, unknown>): void {
        this.storedPassword = typeof settings.password === 'string' ? settings.password : '';
    }

    override onConnectionReady(): void {
        void this.loadDecryptedPassword();
    }

    private loadDecryptedPassword = async (): Promise<void> => {
        try {
            const password = this.storedPassword ? await this.socket.decrypt(this.storedPassword) : '';
            const native = { ...this.state.native, password };
            this.savedPlainNative = structuredClone(native);
            globalThis.changed = false;
            this.setState({ native, changed: false });
        } catch (error) {
            console.error('Could not decrypt the stored Tractive password', error);
            const native = { ...this.state.native, password: '' };
            this.savedPlainNative = structuredClone(native);
            this.setState({ native, changed: false });
            this.showAlert(I18n.t('Could not decrypt the stored password. Please enter it again.'), 'error');
        }
    };

    override getIsChanged(native: Record<string, unknown>): boolean {
        return this.savedPlainNative !== null && JSON.stringify(native) !== JSON.stringify(this.savedPlainNative);
    }

    override onSave(isClose = false): void {
        void this.saveConfiguration(isClose);
    }

    private saveConfiguration = async (isClose: boolean): Promise<void> => {
        if (this.state.isConfigurationError) {
            this.setState({ errorText: this.state.isConfigurationError });
            return;
        }

        try {
            const instanceObject = await this.socket.getObject(this.instanceId);
            if (!instanceObject || instanceObject.type !== 'instance') {
                throw new Error(`Instance object ${this.instanceId} was not found`);
            }

            const plainNative = structuredClone(this.state.native);
            const encryptedPassword = plainNative.password ? await this.socket.encrypt(plainNative.password) : '';
            instanceObject.native = {
                ...instanceObject.native,
                ...plainNative,
                password: encryptedPassword,
            };
            if (this.state.common) {
                instanceObject.common = { ...instanceObject.common, ...this.state.common };
            }

            await this.socket.setObject(this.instanceId, instanceObject);
            this.savedPlainNative = plainNative;
            globalThis.changed = false;
            try {
                window.parent.postMessage('nochange', '*');
            } catch {
                // The Admin page can also run without a parent frame.
            }
            this.setState({ changed: false }, () => {
                if (isClose) {
                    GenericApp.onClose();
                }
            });
        } catch (error) {
            console.error('Could not encrypt or save the Tractive configuration', error);
            this.showAlert(I18n.t('Could not encrypt or save the configuration.'), 'error');
        }
    };

    private testConnection = async (email: string, password?: string): Promise<boolean> => {
        const result = await this.socket.sendTo<{ success?: boolean }>(this.instanceId, 'testConnection', {
            email,
            ...(password ? { password } : {}),
        });
        return result?.success === true;
    };

    render(): React.JSX.Element {
        if (!this.state.loaded || this.savedPlainNative === null) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <SettingsForm
                        native={this.state.native}
                        onChange={(key, value) => this.updateNativeValue(key, value)}
                        onTestConnection={this.testConnection}
                    />
                    {this.renderError()}
                    {this.renderToast()}
                    {this.renderSaveCloseButtons()}
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}
