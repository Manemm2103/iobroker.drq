'use strict';

const utils = require('@iobroker/adapter-core');

class DrqAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'drq'
        });

        this.on('ready', this.onReady.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.ensureObjects();
        await this.setStateAsync('info.connection', false, true);
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('info.lastResult', '', true);
        await this.setStateAsync('info.lastMessage', '', true);
        await this.setStateAsync('send.text', '', true);
        await this.setStateAsync('send.direct', '', true);
        await this.setStateAsync('send.info', '', true);
        await this.setStateAsync('send.warn', '', true);
        await this.setStateAsync('send.alarm', '', true);
        await this.setStateAsync('send.recipients', this.config.defaultRecipients || '', true);
        await this.setStateAsync('send.title', '', true);
        await this.setStateAsync('send.severity', 'info', true);
        await this.setStateAsync('send.trigger', false, true);
        await this.setStateAsync('send.testMessage', 'Testnachricht aus ioBroker', true);
        await this.setStateAsync('send.testTrigger', false, true);

        const issues = this.validateConfig();
        if (issues.length > 0) {
            this.log.warn(`Adapter configuration incomplete: ${issues.join(', ')}`);
            return;
        }

        await this.subscribeStatesAsync('send.trigger');
        await this.subscribeStatesAsync('send.direct');
        await this.subscribeStatesAsync('send.info');
        await this.subscribeStatesAsync('send.warn');
        await this.subscribeStatesAsync('send.alarm');
        await this.subscribeStatesAsync('send.testTrigger');
        const reachable = await this.checkConnection();
        await this.setStateAsync('info.connection', reachable, true);
        this.log.info(`DRQ connection state: ${reachable ? 'ready' : 'unreachable'}`);
    }

    onUnload(callback) {
        callback();
    }

    async ensureObjects() {
        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: {
                name: 'Information'
            },
            native: {}
        });

        await this.setObjectNotExistsAsync('send', {
            type: 'channel',
            common: {
                name: 'Send'
            },
            native: {}
        });

        const states = [
            {
                id: 'info.connection',
                common: {
                    name: 'If connected to DRQ',
                    type: 'boolean',
                    role: 'indicator.connected',
                    read: true,
                    write: false,
                    def: false
                }
            },
            {
                id: 'info.lastMessage',
                common: {
                    name: 'Last message text',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'info.lastResult',
                common: {
                    name: 'Last send result',
                    type: 'string',
                    role: 'json',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'info.lastError',
                common: {
                    name: 'Last send error',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'send.text',
                common: {
                    name: 'Message text',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.direct',
                common: {
                    name: 'Direct message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.info',
                common: {
                    name: 'Direct info message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.warn',
                common: {
                    name: 'Direct warn message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.alarm',
                common: {
                    name: 'Direct alarm message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.recipients',
                common: {
                    name: 'Recipients',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.testMessage',
                common: {
                    name: 'Test message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: 'Testnachricht aus ioBroker'
                }
            },
            {
                id: 'send.testTrigger',
                common: {
                    name: 'Send test',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    def: false
                }
            },
            {
                id: 'send.title',
                common: {
                    name: 'Message title',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.severity',
                common: {
                    name: 'Severity',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: 'info',
                    states: {
                        info: 'info',
                        warn: 'warn',
                        alarm: 'alarm'
                    }
                }
            },
            {
                id: 'send.trigger',
                common: {
                    name: 'Send trigger',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    def: false
                }
            }
        ];

        for (const state of states) {
            await this.setObjectNotExistsAsync(state.id, {
                type: 'state',
                common: state.common,
                native: {}
            });
        }
    }

    async onStateChange(id, state) {
        if (!state || state.ack) {
            return;
        }

        if (id === `${this.namespace}.send.trigger`) {
            try {
                await this.sendConfiguredStateMessage();
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ send via state failed: ${error.message}`);
            } finally {
                await this.setStateAsync('send.trigger', false, true);
            }
        }

        if (id === `${this.namespace}.send.direct`) {
            const directText = typeof state.val === 'string' ? state.val.trim() : '';
            if (!directText) {
                await this.setStateAsync('send.direct', '', true);
                return;
            }

            try {
                await this.sendDirectStateMessage(directText, (await this.getStateAsync('send.severity'))?.val || 'info');
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ direct send failed: ${error.message}`);
            } finally {
                await this.setStateAsync('send.direct', '', true);
            }
        }

        if (id === `${this.namespace}.send.info`) {
            await this.handleSeverityDirectState('send.info', state, 'info');
        }

        if (id === `${this.namespace}.send.warn`) {
            await this.handleSeverityDirectState('send.warn', state, 'warn');
        }

        if (id === `${this.namespace}.send.alarm`) {
            await this.handleSeverityDirectState('send.alarm', state, 'alarm');
        }

        if (id === `${this.namespace}.send.testTrigger`) {
            try {
                const testMessage = (await this.getStateAsync('send.testMessage'))?.val || 'Testnachricht aus ioBroker';
                await this.sendDrqMessage({
                    text: String(testMessage),
                    recipients: (await this.getStateAsync('send.recipients'))?.val || '',
                    title: (await this.getStateAsync('send.title'))?.val || 'DRQ Test',
                    severity: (await this.getStateAsync('send.severity'))?.val || 'info',
                    source: this.config.sourceName || 'ioBroker'
                });
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ test send failed: ${error.message}`);
            } finally {
                await this.setStateAsync('send.testTrigger', false, true);
            }
        }
    }

    validateConfig() {
        const issues = [];
        if (!this.config.baseUrl) {
            issues.push('baseUrl missing');
        }
        if (!this.config.apiKey) {
            issues.push('apiKey missing');
        }
        return issues;
    }

    normalizeRecipients(input) {
        if (Array.isArray(input)) {
            return input.map(value => String(value).trim()).filter(Boolean);
        }

        if (typeof input === 'string') {
            return input
                .split(/[,\n;]/)
                .map(value => value.trim())
                .filter(Boolean);
        }

        return [];
    }

    getConfiguredRecipients() {
        return this.normalizeRecipients(this.config.defaultRecipients);
    }

    buildEndpoint(pathname) {
        const normalizedBaseUrl = String(this.config.baseUrl || '').trim().replace(/\/+$/, '');
        return `${normalizedBaseUrl}${pathname}`;
    }

    async checkConnection() {
        try {
            const response = await fetch(this.buildEndpoint('/api/runtime-config'), {
                method: 'GET',
                signal: AbortSignal.timeout(Number(this.config.timeoutMs) || 10000)
            });
            return response.ok;
        } catch (error) {
            this.log.debug(`DRQ reachability check failed: ${error.message}`);
            return false;
        }
    }

    async postJson(pathname, payload) {
        const response = await fetch(this.buildEndpoint(pathname), {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': String(this.config.apiKey || '').trim()
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(Number(this.config.timeoutMs) || 10000)
        });

        const bodyText = await response.text();
        let body = null;

        if (bodyText) {
            try {
                body = JSON.parse(bodyText);
            } catch (error) {
                body = { raw: bodyText };
            }
        }

        if (!response.ok) {
            const message = body && body.message ? body.message : `HTTP ${response.status}`;
            throw new Error(message);
        }

        return body || {};
    }

    async sendDrqMessage(payload = {}) {
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        if (!text) {
            throw new Error('Missing text');
        }

        const recipients = this.normalizeRecipients(payload.recipients);
        const fallbackRecipients = this.getConfiguredRecipients();
        const finalRecipients = recipients.length > 0 ? recipients : fallbackRecipients;

        if (finalRecipients.length === 0) {
            throw new Error('No recipients configured');
        }

        const requestBody = {
            message: text,
            recipients: finalRecipients,
            title: payload.title || '',
            severity: payload.severity || 'info',
            source: payload.source || this.config.sourceName || 'ioBroker'
        };

        const result = await this.postJson('/api/integrations/iobroker/messages', requestBody);

        await this.setStateAsync('info.connection', true, true);
        await this.setStateAsync('info.lastMessage', text, true);
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('info.lastResult', JSON.stringify(result), true);

        return {
            ok: true,
            recipients: finalRecipients,
            response: result
        };
    }

    async sendConfiguredStateMessage() {
        const [textState, recipientsState, titleState, severityState] = await Promise.all([
            this.getStateAsync('send.text'),
            this.getStateAsync('send.recipients'),
            this.getStateAsync('send.title'),
            this.getStateAsync('send.severity')
        ]);

        return this.sendDrqMessage({
            text: textState?.val || '',
            recipients: recipientsState?.val || '',
            title: titleState?.val || '',
            severity: severityState?.val || 'info',
            source: this.config.sourceName || 'ioBroker'
        });
    }

    async sendDirectStateMessage(text, severity) {
        await this.sendDrqMessage({
            text,
            recipients: (await this.getStateAsync('send.recipients'))?.val || '',
            title: (await this.getStateAsync('send.title'))?.val || '',
            severity,
            source: this.config.sourceName || 'ioBroker'
        });
    }

    async handleSeverityDirectState(stateId, state, severity) {
        const directText = typeof state.val === 'string' ? state.val.trim() : '';
        if (!directText) {
            await this.setStateAsync(stateId, '', true);
            return;
        }

        try {
            await this.sendDirectStateMessage(directText, severity);
        } catch (error) {
            await this.setStateAsync('info.connection', false, true);
            await this.setStateAsync('info.lastError', error.message, true);
            this.log.error(`DRQ ${severity} send failed: ${error.message}`);
        } finally {
            await this.setStateAsync(stateId, '', true);
        }
    }

    async onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }

        if (obj.command === 'send') {
            try {
                const result = await this.sendDrqMessage(obj.message || {});
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ send failed: ${error.message}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { ok: false, error: error.message }, obj.callback);
                }
            }
            return;
        }

        if (obj.command === 'test') {
            try {
                const result = await this.sendDrqMessage({
                    text: 'Testnachricht aus ioBroker',
                    recipients: this.getConfiguredRecipients(),
                    source: this.config.sourceName || 'ioBroker',
                    severity: 'info',
                    title: 'DRQ Test'
                });
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { ok: false, error: error.message }, obj.callback);
                }
            }
        }
    }
}

if (require.main !== module) {
    module.exports = options => new DrqAdapter(options);
} else {
    (() => new DrqAdapter())();
}
