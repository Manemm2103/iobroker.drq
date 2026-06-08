# ioBroker.drq

Minimaler ioBroker-Adapter zum Senden von DRQ-Nachrichten aus Skripten, Automationen und spaeter Blockly.

## Funktionsumfang in Version 0.0.1

- DRQ-Server per URL und API-Key konfigurieren
- Standard-Empfaenger als DRQ-UINs hinterlegen
- Nachrichten per `sendTo()` senden
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

## Naechste sinnvolle Schritte

1. DRQ-Server-API im Messenger-Repo implementieren
2. Adapter in ioBroker testweise installieren
3. Admin-UI mit Testbutton ergaenzen
4. Blockly-Bloecke fuer DRQ-Nachrichten bauen
