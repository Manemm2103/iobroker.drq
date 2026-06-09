'use strict';
const utils = require('@iobroker/adapter-core');
const fs = require('fs');
const path = require('path');

class DrqAdapter extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'drq'
        });

        this.inboxPollTimer = null;

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
        await this.setStateAsync('inbox.lastMessage', '', true);
        await this.setStateAsync('inbox.lastSender', '', true);
        await this.setStateAsync('inbox.lastSenderUin', '', true);
        await this.setStateAsync('inbox.lastTimestamp', '', true);
        await this.setStateAsync('inbox.lastSeverity', '', true);
        await this.setStateAsync('inbox.lastMessageId', 0, true);
        await this.setStateAsync('inbox.lastRaw', '', true);
        await this.setStateAsync('inbox.lastBatchCount', 0, true);
        await this.setStateAsync('inbox.pollNow', false, true);
        await this.setStateAsync('send.text', '', true);
        await this.setStateAsync('send.direct', '', true);
        await this.setStateAsync('send.info', '', true);
        await this.setStateAsync('send.warn', '', true);
        await this.setStateAsync('send.alarm', '', true);
        await this.setStateAsync('send.imagePath', '', true);
        await this.setStateAsync('send.videoPath', '', true);
        await this.setStateAsync('send.filePath', '', true);
        await this.setStateAsync('send.caption', '', true);
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
        await this.subscribeStatesAsync('send.imagePath');
        await this.subscribeStatesAsync('send.videoPath');
        await this.subscribeStatesAsync('send.filePath');
        await this.subscribeStatesAsync('send.testTrigger');
        await this.subscribeStatesAsync('inbox.pollNow');
        const reachable = await this.checkConnection();
        await this.setStateAsync('info.connection', reachable, true);
        this.log.info(`DRQ connection state: ${reachable ? 'ready' : 'unreachable'}`);
        this.startInboxPolling();
        try {
            await this.pollInbox();
        } catch (error) {
            await this.setStateAsync('info.connection', false, true);
            await this.setStateAsync('info.lastError', error.message, true);
            this.log.warn(`Initial DRQ inbox poll failed: ${error.message}`);
        }
    }

    onUnload(callback) {
        this.stopInboxPolling();
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

        await this.setObjectNotExistsAsync('inbox', {
            type: 'channel',
            common: {
                name: 'Inbox'
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
                id: 'inbox.lastMessage',
                common: {
                    name: 'Last received message',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastSender',
                common: {
                    name: 'Last sender username',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastSenderUin',
                common: {
                    name: 'Last sender UIN',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastTimestamp',
                common: {
                    name: 'Last received timestamp',
                    type: 'string',
                    role: 'value.time',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastSeverity',
                common: {
                    name: 'Last received severity',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastMessageId',
                common: {
                    name: 'Last received message ID',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false,
                    def: 0
                }
            },
            {
                id: 'inbox.lastRaw',
                common: {
                    name: 'Last received raw payload',
                    type: 'string',
                    role: 'json',
                    read: true,
                    write: false,
                    def: ''
                }
            },
            {
                id: 'inbox.lastBatchCount',
                common: {
                    name: 'Last inbox batch count',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false,
                    def: 0
                }
            },
            {
                id: 'inbox.pollNow',
                common: {
                    name: 'Poll inbox now',
                    type: 'boolean',
                    role: 'button',
                    read: false,
                    write: true,
                    def: false
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
                id: 'send.imagePath',
                common: {
                    name: 'Direct image path',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.videoPath',
                common: {
                    name: 'Direct video path',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.filePath',
                common: {
                    name: 'Direct file path',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                    def: ''
                }
            },
            {
                id: 'send.caption',
                common: {
                    name: 'Media caption',
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

        if (id === `${this.namespace}.send.imagePath`) {
            await this.handleMediaPathState('send.imagePath', state, 'image');
        }

        if (id === `${this.namespace}.send.videoPath`) {
            await this.handleMediaPathState('send.videoPath', state, 'video');
        }

        if (id === `${this.namespace}.send.filePath`) {
            await this.handleMediaPathState('send.filePath', state, 'file');
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

        if (id === `${this.namespace}.inbox.pollNow`) {
            try {
                await this.pollInbox();
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ inbox poll failed: ${error.message}`);
            } finally {
                await this.setStateAsync('inbox.pollNow', false, true);
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

    async getJson(pathname) {
        const response = await fetch(this.buildEndpoint(pathname), {
            method: 'GET',
            headers: {
                'x-api-key': String(this.config.apiKey || '').trim()
            },
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

    detectMediaMimeType(filePath, forcedType = '') {
        const type = String(forcedType || '').trim().toLowerCase();
        if (type === 'image') {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.png') return 'image/png';
            if (ext === '.gif') return 'image/gif';
            if (ext === '.webp') return 'image/webp';
            if (ext === '.bmp') return 'image/bmp';
            return 'image/jpeg';
        }
        if (type === 'video') {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.webm') return 'video/webm';
            if (ext === '.mov') return 'video/quicktime';
            if (ext === '.mkv') return 'video/x-matroska';
            if (ext === '.avi') return 'video/x-msvideo';
            return 'video/mp4';
        }
        if (type === 'audio') {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.wav') return 'audio/wav';
            if (ext === '.ogg') return 'audio/ogg';
            if (ext === '.m4a') return 'audio/mp4';
            return 'audio/mpeg';
        }

        const ext = path.extname(filePath).toLowerCase();
        const mimeByExt = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
            '.mkv': 'video/x-matroska',
            '.avi': 'video/x-msvideo',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.pdf': 'application/pdf'
        };
        return mimeByExt[ext] || 'application/octet-stream';
    }

    async postFormData(pathname, formData) {
        const response = await fetch(this.buildEndpoint(pathname), {
            method: 'POST',
            headers: {
                'x-api-key': String(this.config.apiKey || '').trim()
            },
            body: formData,
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

    async sendDrqMedia(payload = {}) {
        const filePath = typeof payload.path === 'string' ? payload.path.trim() : '';
        if (!filePath) {
            throw new Error('Missing file path');
        }

        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath}`);
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isFile()) {
            throw new Error(`Path is not a file: ${resolvedPath}`);
        }

        const recipients = this.normalizeRecipients(payload.recipients);
        const fallbackRecipients = this.getConfiguredRecipients();
        const finalRecipients = recipients.length > 0 ? recipients : fallbackRecipients;
        if (finalRecipients.length === 0) {
            throw new Error('No recipients configured');
        }

        const fileBuffer = await fs.promises.readFile(resolvedPath);
        const filename = path.basename(resolvedPath);
        const mimeType = this.detectMediaMimeType(resolvedPath, payload.type || '');
        const formData = new FormData();
        const fileBlob = new Blob([fileBuffer], { type: mimeType });

        formData.append('file', fileBlob, filename);
        formData.append('recipients', finalRecipients.join(','));
        formData.append('title', payload.title || '');
        formData.append('caption', payload.caption || '');
        formData.append('severity', payload.severity || 'info');
        formData.append('source', payload.source || this.config.sourceName || 'ioBroker');
        formData.append('type', payload.type || '');

        const result = await this.postFormData('/api/integrations/iobroker/media', formData);

        await this.setStateAsync('info.connection', true, true);
        await this.setStateAsync('info.lastMessage', payload.caption || filename, true);
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('info.lastResult', JSON.stringify(result), true);

        return {
            ok: true,
            recipients: finalRecipients,
            response: result,
            path: resolvedPath
        };
    }

    buildMessagePayload(message, overrides = {}) {
        const source = overrides.source || this.config.sourceName || 'ioBroker';

        if (typeof message === 'string') {
            return {
                text: message,
                recipients: '',
                title: '',
                severity: overrides.severity || 'info',
                source
            };
        }

        const payload = message && typeof message === 'object' ? message : {};
        return {
            text: typeof payload.text === 'string' ? payload.text : '',
            recipients: payload.recipients || '',
            title: payload.title || '',
            severity: overrides.severity || payload.severity || 'info',
            source: payload.source || source
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

    async handleMediaPathState(stateId, state, type) {
        const mediaPath = typeof state.val === 'string' ? state.val.trim() : '';
        if (!mediaPath) {
            await this.setStateAsync(stateId, '', true);
            return;
        }

        try {
            await this.sendDrqMedia({
                path: mediaPath,
                type,
                recipients: (await this.getStateAsync('send.recipients'))?.val || '',
                title: (await this.getStateAsync('send.title'))?.val || '',
                caption: (await this.getStateAsync('send.caption'))?.val || '',
                severity: (await this.getStateAsync('send.severity'))?.val || 'info',
                source: this.config.sourceName || 'ioBroker'
            });
        } catch (error) {
            await this.setStateAsync('info.connection', false, true);
            await this.setStateAsync('info.lastError', error.message, true);
            this.log.error(`DRQ ${type} send failed: ${error.message}`);
        } finally {
            await this.setStateAsync(stateId, '', true);
        }
    }

    stopInboxPolling() {
        if (this.inboxPollTimer) {
            clearInterval(this.inboxPollTimer);
            this.inboxPollTimer = null;
        }
    }

    startInboxPolling() {
        this.stopInboxPolling();

        const intervalMs = Math.max(Number(this.config.pollIntervalMs) || 15000, 5000);
        this.inboxPollTimer = setInterval(() => {
            this.pollInbox().catch(async (error) => {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.warn(`DRQ inbox polling failed: ${error.message}`);
            });
        }, intervalMs);
    }

    async pollInbox() {
        const lastMessageId = Number((await this.getStateAsync('inbox.lastMessageId'))?.val || 0);
        const result = await this.getJson(`/api/integrations/iobroker/inbox?afterId=${lastMessageId}&limit=20`);
        const messages = Array.isArray(result.messages) ? result.messages : [];

        await this.setStateAsync('info.connection', true, true);
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('inbox.lastBatchCount', messages.length, true);

        if (!messages.length) {
            return {
                ok: true,
                count: 0,
                messages: []
            };
        }

        const latestMessage = messages[messages.length - 1];
        await this.setStateAsync('inbox.lastMessage', latestMessage.content || '', true);
        await this.setStateAsync('inbox.lastSender', latestMessage.senderUsername || '', true);
        await this.setStateAsync('inbox.lastSenderUin', latestMessage.senderUin != null ? String(latestMessage.senderUin) : '', true);
        await this.setStateAsync('inbox.lastTimestamp', latestMessage.timestamp || '', true);
        await this.setStateAsync('inbox.lastSeverity', latestMessage.severity || 'info', true);
        await this.setStateAsync('inbox.lastMessageId', Number(latestMessage.id) || lastMessageId, true);
        await this.setStateAsync('inbox.lastRaw', JSON.stringify(latestMessage), true);

        this.log.info(`Received ${messages.length} DRQ inbox message(s), latest from ${latestMessage.senderUsername || 'unknown sender'}`);

        return {
            ok: true,
            count: messages.length,
            messages
        };
    }

    async onMessage(obj) {
        if (!obj || !obj.command) {
            return;
        }

        if (['send', 'sendInfo', 'sendWarn', 'sendAlarm'].includes(obj.command)) {
            const severityOverrides = {
                send: undefined,
                sendInfo: 'info',
                sendWarn: 'warn',
                sendAlarm: 'alarm'
            };

            try {
                const result = await this.sendDrqMessage(
                    this.buildMessagePayload(obj.message, { severity: severityOverrides[obj.command] })
                );
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ ${obj.command} failed: ${error.message}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { ok: false, error: error.message }, obj.callback);
                }
            }
            return;
        }

        if (obj.command === 'sendMedia') {
            try {
                const mediaPayload = obj.message && typeof obj.message === 'object' ? obj.message : {};
                const result = await this.sendDrqMedia({
                    path: mediaPayload.path || mediaPayload.filePath || '',
                    type: mediaPayload.type || '',
                    recipients: mediaPayload.recipients || '',
                    title: mediaPayload.title || '',
                    caption: mediaPayload.caption || '',
                    severity: mediaPayload.severity || 'info',
                    source: mediaPayload.source || this.config.sourceName || 'ioBroker'
                });
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, result, obj.callback);
                }
            } catch (error) {
                await this.setStateAsync('info.connection', false, true);
                await this.setStateAsync('info.lastError', error.message, true);
                this.log.error(`DRQ ${obj.command} failed: ${error.message}`);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { ok: false, error: error.message }, obj.callback);
                }
            }
            return;
        }

        if (obj.command === 'pollInbox') {
            try {
                const result = await this.pollInbox();
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
