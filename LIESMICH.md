# Graduierungs-App — Aufbau des Codes

```
app/                       ← dieser Ordner wird als Website veröffentlicht
  index.html                 Startseite mit den beiden Eingängen
  sw.js                      Service Worker (offline-Betrieb)
  symbole/                   App-Symbole (Anker)
  gemeinsam/
    katalog.json           ← einzige Datenquelle: Stufen, Kriterien, Privilegien, Rückstufungstexte
    katalog.js               Laden, Stufenvererbung, Sammelzeilen, Rückstufungsbogen
    uebergabe.js             Format der Datei Kind → Lehrkraft (erzeugen, benennen, prüfen)
  schueler/
    index.html               Ersteinrichtung, Ausweis, Selbsteinschätzung, Verlauf
    schueler.js
    stil.css
    manifest.webmanifest     macht die Seite auf dem iPad installierbar
  lehrkraft/                 (noch nicht gebaut)
  pruefen.mjs                30 Prüfungen -- `node app/pruefen.mjs`
```

Kein Build-Schritt, keine Abhängigkeiten, keine externen Dienste. Reine ES-Module.

## Der Ablauf, für den das gebaut ist

1. Joscha wirft einen QR-Code mit der Adresse an die Wand
2. Kind scannt, Seite öffnet sich — **keine Installation nötig**
3. Kind gibt Name ein, wählt seine Stufe (Klasse ist über den Link vorbelegt)
4. Kind schätzt sich ein und schickt das Ergebnis per AirDrop

**Klasse vorbelegen:** Die Adresse mit Raute ergänzen, z. B.
`…/schueler/#8a` — dann ist das Klassenfeld schon ausgefüllt. Bewusst ein Fragment
und kein `?`-Parameter: Fragmente werden nie an den Server gesendet.

## Die 7-Tage-Falle (wichtig)

Safari löscht den lokalen Speicher einer Website, wenn sie **sieben Tage** nicht besucht wurde.
Der Rhythmus ist aber vierzehntägig. Ohne Gegenmaßnahme müssten die Kinder ihren Namen also
**jedes Mal** neu eingeben, nicht nur einmal.

Zwei Antworten darauf:

- **Namenseingabe ist billig gehalten** — Name tippen, Stufe antippen, fertig. Auch wenn es öfter
  passiert, sind es ~15 Sekunden.
- **Wer die Seite auf den Home-Bildschirm legt, ist raus aus der Regel.** Deshalb Manifest und
  Service Worker: Nach dem ersten erfolgreichen Senden zeigt die App eine kurze Anleitung dazu.
  Das lohnt sich einmal in der Einführungsstunde für die ganze Klasse — danach ist auch der
  Verlauf dauerhaft.

## Veröffentlichen (GitHub Pages)

Der **Inhalt von `app/`** wird das Wurzelverzeichnis der Website — nicht der Projektordner.

```bash
cd "/Users/joschafalck/Desktop/Claude/Graduierung-App/app" && git init -b main && git add -A && git commit -m "Schueleranwendung"
```

Danach ein leeres Repo auf GitHub anlegen, als Remote eintragen, pushen und in den
Repo-Einstellungen unter *Pages* die Quelle auf Branch `main` / Ordner `/` stellen.
Die Adresse lautet dann `https://joschafalck.github.io/<repo-name>/schueler/`.

Hinweis: Der Fine-grained-Token „claude-push" im Schlüsselbund gilt nur für das
ki-konzept-werkstatt-Repo und ist inzwischen abgelaufen — für dieses Projekt braucht es
einen neuen.

## Lokal ausprobieren

ES-Module und `fetch` funktionieren nicht über `file://`. Also ein Miniserver:

```bash
cd "/Users/joschafalck/Desktop/Claude/Graduierung-App/app" && python3 -m http.server 8000
```

Dann <http://localhost:8000/> aufrufen.

**Was lokal nicht geht:** `navigator.share` (AirDrop) und der Service Worker verlangen einen
sicheren Kontext. `localhost` gilt als sicher, die WLAN-IP des Macs nicht. Der Test „Kind füllt
auf dem iPad aus und schickt per AirDrop" funktioniert deshalb erst über HTTPS, also auf
GitHub Pages. Am Mac greift vorher automatisch der Download-Fallback.

## Speicherorte auf dem Schülergerät

| Schlüssel | Inhalt |
|---|---|
| `graduierung.schueler.profil` | Name, Klasse, aktuelle Stufe |
| `graduierung.schueler.verlauf` | die letzten 40 eigenen Selbsteinschätzungen |

Beides löschbar über „Alles auf diesem Gerät löschen" im Ausweis-Bereich.
Es verlässt das Gerät nur, was das Kind selbst über „Senden" abschickt.

## Service Worker

Strategie ist **Netz zuerst, Cache als Rückfall**. Eine neu veröffentlichte Fassung ist damit
sofort da, sobald WLAN vorhanden ist; offline läuft die App trotzdem. Cache-zuerst wäre schneller,
würde aber alte Fassungen auf 25 iPads festhalten, die man nicht einzeln entstauben kann.

Bei inhaltlichen Änderungen die Konstante `FASSUNG` in `sw.js` hochzählen.

## Noch offen in der Schüleranwendung

- **QR-Code als Sende-Fallback** ist nicht drin. Aktuell: AirDrop über das Teilen-Menü, sonst
  Download der Datei (die sich von Hand per AirDrop teilen lässt). Ein QR-Encoder ohne externe
  Bibliothek ist eigener Aufwand — erst bauen, wenn die Praxis zeigt, dass es gebraucht wird.
- **Dateiendung `.json`** ist zu prüfen: falls iPadOS beim AirDrop zickt, ist der Wechsel auf
  `.txt` eine Zeile in `uebergabe.js`.
