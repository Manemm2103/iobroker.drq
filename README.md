# ioBroker.drq

Minimaler ioBroker-Adapter zum Senden und Empfangen von DRQ-Nachrichten aus Skripten, Automationen und spaeter Blockly.

## Funktionsumfang in Version 0.5.0

- DRQ-Server per URL und API-Key konfigurieren
- Standard-Empfaenger als DRQ-UINs hinterlegen
- Nachrichten per `sendTo()` senden
- Nachrichten ueber beschreibbare `send.*`-States senden
- Nachrichten ueber `send.direct` sofort beim Schreiben senden
- Eigene Direkt-Datenpunkte fuer `info`, `warn` und `alarm`
- Testversand ueber eigene `send.test*`-States
- Test-Senden-Button direkt in der Admin-Konfiguration
- Empfang eingehender DRQ-Nachrichten ueber `inbox.*`-States
- konfigurierbares Inbox-Polling
- Blockly-freundliche `sendTo`-Kommandos fuer `info`, `warn` und `alarm`
- lokale Bilder, Videos und Dateien per Dateipfad an DRQ senden
- einfache Verbindungs- und Fehlerstates

## Geplante DRQ-API

Der Adapter erwartet serverseitig einen DRQ-Endpunkt:

- `POST /api/integrations/iobroker/messages`
- `POST /api/integrations/iobroker/media`
- `GET /api/integrations/iobroker/inbox`

Header:

- `x-api-key: <IOBROKER_API_KEY>`

Payload:

```json
{
  "message": "Waschmaschine fertig",
  "recipients": ["4711", "8159"],
  "title": "Haus",
  "severity": "info",
  "source": "ioBroker"
}
```

## Beispiel fuer ioBroker-Skripte

```javascript
sendTo('drq.0', 'send', {
    text: 'Haustuer wurde geoeffnet',
    recipients: ['4711', '8159'],
    title: 'Alarm',
    severity: 'warn',
    source: 'ioBroker'
}, response => {
    log(JSON.stringify(response), 'info');
});
```

Wenn `recipients` nicht uebergeben wird, verwendet der Adapter die in der Instanz konfigurierten Standard-Empfaenger.

## Blockly-Unterstuetzung

Fuer Blockly kannst du jetzt sehr einfach die normalen `sendTo`-Bloecke des Javascript-Adapters verwenden.

Unterstuetzte Kommandos:

- `send`
- `sendInfo`
- `sendWarn`
- `sendAlarm`
- `sendMedia`
- `pollInbox`

Fuer `sendInfo`, `sendWarn` und `sendAlarm` reicht im einfachsten Fall schon ein reiner Text als Nachricht.

Beispiele:

```javascript
sendTo('drq.0', 'sendInfo', 'Waschmaschine ist fertig');
sendTo('drq.0', 'sendWarn', 'Fenster im Keller ist offen');
sendTo('drq.0', 'sendAlarm', 'Wassersensor hat ausgeloest');
```

Wenn du mehr Kontrolle brauchst, kannst du weiterhin `send` mit Objekt verwenden:

```javascript
sendTo('drq.0', 'send', {
    text: 'Haustuer wurde geoeffnet',
    title: 'Alarm',
    severity: 'warn',
    recipients: ['4711', '8159']
});
```

## Senden ueber Datenpunkte

Der Adapter stellt dafuer diese States bereit:

- `drq.0.send.text`
- `drq.0.send.direct`
- `drq.0.send.info`
- `drq.0.send.warn`
- `drq.0.send.alarm`
- `drq.0.send.recipients`
- `drq.0.send.title`
- `drq.0.send.severity`
- `drq.0.send.trigger`
- `drq.0.send.testMessage`
- `drq.0.send.testTrigger`

Beispiel:

1. `drq.0.send.text` auf `Heizung stoert`
2. optional `drq.0.send.recipients` auf `4711,8159`
3. optional `drq.0.send.title` auf `Haus`
4. `drq.0.send.severity` auf `info`, `warn` oder `alarm`
5. `drq.0.send.trigger` auf `true`

## Direkt senden ueber einen Datenpunkt

Wenn du ohne separaten Trigger senden willst, schreibe einfach direkt in:

- `drq.0.send.direct`

Beispiel:

```javascript
setState('drq.0.send.direct', 'Fenster im Keller ist offen');
```

Der Adapter sendet die Nachricht sofort und leert den State danach wieder.

## Direkte Nachrichtentypen

Wenn du den Typ direkt ueber den Datenpunkt ausdruecken willst, kannst du auch diese States verwenden:

- `drq.0.send.info`
- `drq.0.send.warn`
- `drq.0.send.alarm`

Beispiele:

```javascript
setState('drq.0.send.info', 'Waschmaschine ist fertig');
setState('drq.0.send.warn', 'Fenster im Keller ist offen');
setState('drq.0.send.alarm', 'Wassersensor hat ausgeloest');
```

Die States senden sofort und werden danach wieder geleert.

## Bilder, Videos und Dateien senden

Dafuer gibt es jetzt diese zusaetzlichen States:

- `drq.0.send.imagePath`
- `drq.0.send.videoPath`
- `drq.0.send.filePath`
- `drq.0.send.caption`

Beispiele:

```javascript
setState('drq.0.send.caption', 'Kamera Haustuer');
setState('drq.0.send.imagePath', '/opt/iobroker/kamera/snapshot_ch0.jpg');
```

```javascript
setState('drq.0.send.caption', 'Bewegung im Hof');
setState('drq.0.send.videoPath', '/opt/iobroker/kamera/clip1.mp4');
```

Wenn `send.recipients` leer ist, verwendet der Adapter weiter die Standard-Empfaenger aus der Instanz.

## Medien per sendTo

```javascript
sendTo('drq.0', 'sendMedia', {
    path: '/opt/iobroker/kamera/snapshot_ch0.jpg',
    type: 'image',
    caption: 'Kamera Haustuer',
    recipients: ['4711']
});
```

## Testversand

Fuer einen schnellen manuellen Test kannst du diese States verwenden:

- `drq.0.send.testMessage`
- `drq.0.send.testTrigger`

Wenn `send.testTrigger` auf `true` geschrieben wird, sendet der Adapter den Inhalt aus `send.testMessage`.

## Empfang ueber Datenpunkte

Der Adapter spiegelt neue eingehende DRQ-Nachrichten auf diese States:

- `drq.0.inbox.lastMessage`
- `drq.0.inbox.lastSender`
- `drq.0.inbox.lastSenderUin`
- `drq.0.inbox.lastTimestamp`
- `drq.0.inbox.lastSeverity`
- `drq.0.inbox.lastMessageId`
- `drq.0.inbox.lastRaw`
- `drq.0.inbox.lastBatchCount`
- `drq.0.inbox.pollNow`

`inbox.pollNow` kann manuell auf `true` geschrieben werden, wenn sofort nach neuen Nachrichten gesucht werden soll.

Zusätzlich gibt es in der Instanz-Konfiguration:

- `Inbox poll interval (ms)`

Darueber legt ihr fest, wie oft der Adapter neue DRQ-Nachrichten fuer den ioBroker-Integrationschat abholt.
