# ioBroker.drq

Minimaler ioBroker-Adapter zum Senden von DRQ-Nachrichten aus Skripten, Automationen und spaeter Blockly.

## Funktionsumfang in Version 0.3.0

- DRQ-Server per URL und API-Key konfigurieren
- Standard-Empfaenger als DRQ-UINs hinterlegen
- Nachrichten per `sendTo()` senden
- Nachrichten ueber beschreibbare `send.*`-States senden
- Nachrichten ueber `send.direct` sofort beim Schreiben senden
- Eigene Direkt-Datenpunkte fuer `info`, `warn` und `alarm`
- Testversand ueber eigene `send.test*`-States
- Test-Senden-Button direkt in der Admin-Konfiguration
- einfache Verbindungs- und Fehlerstates

## Geplante DRQ-API

Der Adapter erwartet serverseitig einen DRQ-Endpunkt:

- `POST /api/integrations/iobroker/messages`

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

## Testversand

Fuer einen schnellen manuellen Test kannst du diese States verwenden:

- `drq.0.send.testMessage`
- `drq.0.send.testTrigger`

Wenn `send.testTrigger` auf `true` geschrieben wird, sendet der Adapter den Inhalt aus `send.testMessage`.

## Naechste sinnvolle Schritte

1. Admin-UI mit Testbutton ergaenzen
2. Blockly-Bloecke fuer DRQ-Nachrichten bauen
3. Empfangs-Datenpunkte fuer eingehende DRQ-Nachrichten bauen
