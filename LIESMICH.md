# Graduierungs-App — Aufbau des Codes

```
app/                       ← dieser Ordner wird als Website veröffentlicht
  index.html                 Startseite mit den beiden Eingängen
  sw.js                      Service Worker (offline-Betrieb)
  symbole/                   App-Symbole (Anker) und Schullogo
  bilder/                    Titelbild der Startseite (zwei Auflösungen)
  gemeinsam/
    beispieldaten.js         erfundene Klasse zum Ausprobieren (Beispielmodus)
    katalog.json           ← einzige Datenquelle: Stufen, Kriterien, Privilegien, Rückstufungstexte
    katalog.js               Laden, Stufenvererbung, Sammelzeilen, Rückstufungsbogen
    uebergabe.js             Format der Datei Kind → Lehrkraft (erzeugen, benennen, prüfen)
    tresor.js                Verschlüsselung der Klassendatei (AES-GCM, PBKDF2)
    klassendatei.js          Datenmodell: Lernende, Zeiträume, Einschätzungen, Import
  schueler/
    index.html               Ersteinrichtung, Ausweis, Selbsteinschätzung, Verlauf
    schueler.js
    stil.css
    manifest.webmanifest     macht die Seite auf dem iPad installierbar
  lehrkraft/                 Datei anlegen/öffnen/sichern, Übersicht, Einsammeln,
                             Fremdeinschätzung (nach Kind oder nach Kriterium),
                             Verlauf je Kind, Coaching-Gespräch mit Bogen und Druck
    index.html
    lehrkraft.js
    stil.css
  pruefen.mjs                72 Prüfungen -- `node app/pruefen.mjs`
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

## Ausprobieren ohne echte Daten

- **Lehrkraft:** Knopf „Beispielklasse ansehen" auf der Einstiegsseite. 14 erfundene Kinder auf
  allen vier Stufen, vier Zeiträume mit Selbst- und Fremdeinschätzungen, gewollte Abweichungen
  zwischen beidem. Die Daten bleiben im Arbeitsspeicher: `speichern()` steigt bei
  `datei.beispiel` sofort aus, es kann also weder eine Datei entstehen noch eine echte
  Klassendatei überschrieben werden. Deterministisch aufgebaut -- derselbe Aufruf ergibt
  immer dieselbe Klasse.
- **Schüler:** `…/schueler/#test` blendet eine Leiste mit Stufenwechsel und Profil-Zurücksetzen ein.

## Startseite

Titelbild oben, darunter Titel, Schullogo und die beiden Eingänge. Ab 34 rem stehen die
Eingänge nebeneinander.

Bild, Inhalt und Fußzeile teilen sich über die Klasse `.bahn` dieselbe Breite (`min(52rem, 100%)`).
Bis 52 rem läuft das Bild also randlos über den ganzen Bildschirm, darüber steht es mittig.
Das Bild behält per `aspect-ratio: 4 / 1` immer sein Seitenverhältnis und wird **nie**
beschnitten. Eine feste Höhe (früher `height: clamp(110px, 13vw, 180px)`) darf dort nicht
zurückkommen -- sie ergibt ein Verhältnis um 7,7:1 und schneidet mit `object-fit: cover`
rund die Hälfte des Motivs weg.

**Das Bild austauschen:** `bilder/header.jpg` (1600 x 400) und `bilder/header-gross.jpg`
(2400 x 600) ersetzen, beide im Seitenverhältnis **4:1**. Bei einem anderen Verhältnis auch
`aspect-ratio` in `index.html` anpassen. Das Original der aktuellen Grafik liegt außerhalb des Repos unter
`Graduierung-App/Bildquellen/header-original.png`. Nach einem Austausch die `FASSUNG` in
`sw.js` hochzählen, sonst zeigen bereits geöffnete Geräte das alte Bild.

## Layout

Beide Anwendungen sind für das **iPad im Querformat** ausgelegt. Ab 48 rem Breite steht die
Skala neben dem Kriterium statt darunter (halbiert die Höhe), die Erklärungen liegen
nebeneinander, und die Ausweislisten werden zweispaltig. Ab 68 rem stehen die Kriterien selbst
zweispaltig. In der Lehrkraft-Anwendung wird die Klassenliste ab 60 rem zwei-, ab 78 rem
dreispaltig -- die Erfassung bleibt bewusst einspaltig, damit der Blick beim Durchgehen ruhig bleibt.

## Fremdeinschätzung: zwei Wege

- **Nach Kind** (Standard): Kind auswählen, darunter erscheinen alle Kriterien seiner Stufe.
  Der Weg für die Vorbereitung eines Gesprächs.
- **Nach Kriterium**: ein Kriterium, alle Kinder, die es betrifft. Der Weg für den
  Klassendurchgang -- der Maßstab bleibt über die Klasse gleich.

Beide zeigen an jedem Eintrag den Stand (`3/5` oder ✓), damit nichts unbemerkt offen bleibt.

## Zeitraum frei wählbar

Oben in der Leiste steht ein Auswahlfeld statt einer festen Anzeige. Vorbelegt ist der Zeitraum,
in den heute fällt (mit „· heute" markiert, Coaching-Termine mit „· Coaching"). Er lässt sich
umstellen -- für nachgetragene Runden, ausgelassene Wochen oder vorgezogene Gespräche. Der
gewählte Zeitraum gilt überall: Fremdeinschätzung, Übersicht und der Coaching-Block richten
sich danach. `aktuellerZeitraum()` in `lehrkraft.js` ist die einzige Quelle dafür.

## Anleitung

Zwei Fassungen: eine aufklappbare Kurzfassung mit sechs Schritten auf der Einstiegsseite
(vor dem Öffnen einer Klasse) und der Navigationspunkt *Anleitung* mit der ausführlichen
Fassung inklusive Speicher- und Sicherungshinweisen.

## Datei sichern

Eigener Bereich in der Navigation, bewusst schlank: eine Hinweiszeile und zwei Knöpfe über die
volle Breite -- **Klassendaten lokal sichern** (eigene Sicherung mit Datum im Dateinamen; die
Arbeitsdatei bleibt, wo sie ist) und **Klasse schließen**. Darunter die Kennzahlen der Klasse.
Automatisch gesichert wird ohnehin 0,8 s nach der letzten Änderung. Im Beispielmodus ist das
Sichern gesperrt.

## Der Coaching-Bogen

Eine Besonderheit steckt darin: Das Kind kreuzt **Einzelkriterien** an, die Lehrkraft die
**Sammelzeilen**. Damit beides nebeneinanderstehen kann, verdichtet `zeilenwert()` die
Selbstsicht auf die Zeile -- nach der Regel *der schlechteste Einzelwert zählt*.
„Ich erfülle die Verantwortlichkeiten im Hafen" ist eben nicht erfüllt, sobald eine davon fehlt.
Weicht die verdichtete Selbstsicht von der Fremdsicht ab, wird das Feld gelb hinterlegt --
das ist der Gesprächsstoff.

`Bogen drucken` nutzt die Druckansicht des Browsers: Leisten und Navigation verschwinden,
und unter das Formular kommt eine Unterschriftenzeile.

## Noch offen in der Lehrkraft-Anwendung

- **Personalisierter Ausweis zum Drucken** (die Ausweiskarte mit Namen des Kindes)
- **Unterschriften**: Der gedruckte Bogen hat eine Unterschriftenzeile, in der Anwendung
  selbst wird nichts signiert -- unterschrieben wird auf Papier
- **Automatische Wochen-Schnappschüsse** (siehe KONZEPT.md Abschnitt 6) -- „Kopie speichern
  unter …" gibt es, ein automatischer Rhythmus fehlt noch
- Klassenliste einzeln bearbeiten (Umbenennen, Entfernen)

**Wie die Klassenliste entsteht:** entweder beim Anlegen als Namensliste (eine Zeile je Kind)
oder aus den ersten Selbsteinschätzungen. Unbekannte Namen werden nie still angelegt --
sie landen unter „Bitte entscheiden" mit den Möglichkeiten *neu anlegen*, *zuordnen*
(mit Vorschlag ähnlicher Namen gegen Tippfehler) oder *verwerfen*. Beim Erstaufbau,
wenn alle Namen neu sind, gibt es einen Sammelknopf für die ganze Klasse.
