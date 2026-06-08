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
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('info.lastResult', '', true);
        await this.setStateAsync('info.lastMessage', '', true);

        const issues = this.validateConfig();
        if (issues.length > 0) {
            this.log.warn(`Adapter configuration incomplete: ${issues.join(', ')}`);
            return;
        }

        const reachable = await this.checkConnection();
        await this.setStateAsync('info.connection', reachable, true);
        this.log.info(`DRQ connection state: ${reachable ? 'ready' : 'unreachable'}`);
    }

    onUnload(callback) {
        callback();
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

