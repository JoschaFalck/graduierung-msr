# Graduierungs-App — Aufbau des Codes

```
app/                       ← dieser Ordner wird als Website veröffentlicht
  index.html                 Startseite mit den beiden Eingängen
  sw.js                      Service Worker (offline-Betrieb)
  symbole/                   App-Symbole (Anker) und Schullogo
  bilder/                    Titelbild der Startseite, Stufenbilder, freigestellte Motive
    stufen/                  Bild je Lernstufe für den Ausweis (3:1)
  gemeinsam/
    beispieldaten.js         erfundene Klasse zum Ausprobieren (Beispielmodus)
    katalog.json           ← einzige Datenquelle: Stufen, Kriterien, Privilegien, Rückstufungstexte
    katalog.js               Laden, Stufenvererbung, Sammelzeilen, Stufenwechsel, Rückstufungsbogen
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
  pruefen.mjs                74 Prüfungen -- `node app/pruefen.mjs`
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

Titelbild oben mit dem Schullogo in der rechten oberen Ecke (dieselbe Stelle wie in der
Schüleranwendung), darunter der Titel und die beiden Eingänge. Ab 34 rem stehen die
Eingänge nebeneinander.

Die Seite ist darauf ausgelegt, **ohne Scrollen** sichtbar zu sein. `body` ist eine
Flex-Spalte über die volle Fensterhöhe; `main` bekommt `flex: 1` und verteilt übrigen
Platz gleichmäßig, statt den Inhalt oben kleben zu lassen. `.titelbild` und `footer`
stehen deshalb auf `flex: none` -- sonst würde die Spalte das Bild stauchen, sobald der
Inhalt einmal höher wird als das Fenster.

Das Titelbild läuft randlos über die volle Breite. Es behält per `aspect-ratio: 4 / 1`
sein Seitenverhältnis und wird deshalb **nicht** beschnitten. Eine feste Höhe (früher
`height: clamp(110px, 13vw, 180px)`) darf dort nicht zurückkommen -- sie ergibt ein
Verhältnis um 7,7:1 und schneidet mit `object-fit: cover` rund die Hälfte des Motivs weg.

Einzige Ausnahme ist `max-height: min(430px, 45vh)`: die 430 px greifen jenseits von
1720 px Fensterbreite, die 45 vh in flachen Fenstern. Beides hält die Seite ohne Scrollen
sichtbar. `object-position: center bottom` sorgt dort dafür, dass ausschließlich oben
Himmel wegfällt -- Kai, Anker, Boje und Segelboot bleiben vollständig.

Inhalt und Fußzeile teilen sich darunter über die Klasse `.bahn` dieselbe Breite
(`min(60rem, 100%)`).

**Das Bild austauschen:** `bilder/header.jpg` (1600 x 400) und `bilder/header-gross.jpg`
(2400 x 600) ersetzen, beide im Seitenverhältnis **4:1**. Bei einem anderen Verhältnis auch
`aspect-ratio` in `index.html` anpassen. Das Original der aktuellen Grafik liegt außerhalb des Repos unter
`Graduierung-App/Bildquellen/header-original.png`. Nach einem Austausch die `FASSUNG` in
`sw.js` hochzählen, sonst zeigen bereits geöffnete Geräte das alte Bild.

## Bilder

| Datei | Wo | Format |
|---|---|---|
| `bilder/header.jpg` | Startseite | 4:1, randlos |
| `bilder/stufen/<stufe>.jpg` | Ausweiskarte, je nach Stufe | 3:1, als Band beschnitten |
| `bilder/einstieg-lehrkraft.jpg` | Kopf der Einstiegskarte | 2:1, als Band beschnitten |
| `bilder/leer-verlauf.png` | Schüler: noch keine Einschätzung | freigestellt |
| `bilder/gesendet.png` | Schüler: nach dem Absenden | freigestellt |
| `bilder/leer-klasse.png` | Lehrkraft: noch keine Kinder | freigestellt |
| `bilder/leer-coaching.png` | Lehrkraft: noch kein Gespräch | freigestellt |
| `bilder/alles-da.png` | Lehrkraft: alle Abgaben da | freigestellt |

Alle Bilder sind **schmückend** (`alt=""`); ihre Aussage steht immer auch als Text daneben.
Die freigestellten Motive teilen sich die Klasse `.leer-bild`, die in beiden Stylesheets steht;
im Druckbogen wird sie ausgeblendet.

**Anders als beim Titelbild ist bei den Bändern ein Beschnitt gewollt**: Die Ausweiskarte wird
auf dem iPad quer über 1000 px breit, ein volles 3:1-Bild wäre dort fast 400 px hoch. Deshalb
feste Bandhöhe (`height: clamp(...)`) statt `aspect-ratio` -- die beiden zusammen ziehen
ausserdem die Breite mit, und rechts bliebe ein weisser Streifen.

Die Prompts, aus denen die Bilder entstanden sind, stehen in `Graduierung-App/BILDPROMPTS.md`,
die Originale in `Graduierung-App/Bildquellen/`. Neue Bilder gehören in den `VORRAT` in `sw.js`,
sonst fehlen sie auf bereits geöffneten Geräten.

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
gewählte Zeitraum gilt **überall**: Fremdeinschätzung, Übersicht, Coaching-Block und die
Fehlliste unter *Einsammeln*, die ihn auch in der Überschrift nennt. `aktuellerZeitraum()` in
`lehrkraft.js` ist die einzige Quelle dafür -- `kd.fehlendeSelbsteinschaetzungen(datei)` ohne
zweites Argument fällt auf den heutigen Zeitraum zurück und gehört deshalb nirgends hin.

Die Statuszeile daneben zeigt fehlende Abgaben **und** einen anstehenden Coaching-Termin
nebeneinander. Vorher verdeckte der Coaching-Hinweis die Zahl der Fehlenden, und das
ausgerechnet im Zeitraum, in dem sie am meisten zählt.

## Anleitung

Zwei Fassungen: eine aufklappbare Kurzfassung mit sechs Schritten auf der Einstiegsseite
(vor dem Öffnen einer Klasse) und der Navigationspunkt *Anleitung* mit der ausführlichen
Fassung inklusive Speicher- und Sicherungshinweisen.

## Datei sichern

Eigener Bereich in der Navigation, bewusst schlank: eine Hinweiszeile und zwei Knöpfe über die
volle Breite -- **Klassendaten lokal sichern** (eigene Sicherung mit Datum im Dateinamen; die
Arbeitsdatei bleibt, wo sie ist) und **Klasse schließen**. Darunter die Kennzahlen der Klasse.
Im Beispielmodus ist das Sichern gesperrt.

### Automatisch oder von Hand

`schreibtStillZurueck()` entscheidet das: Automatisch gesichert wird **nur** mit einem
beschreibbaren Dateigriff (0,8 s nach der letzten Änderung). Fehlt er, fiele `speichern()` auf
einen Download zurück -- bei dieser Taktung entstünde pro Änderung eine neue Datei, nach einem
Klassendurchgang rund 70 Stück `Klasse-8b-2026-27 (37).gradu`, und welche die aktuelle ist,
wüsste niemand mehr. Betrifft **Safari immer** und Chrome dann, wenn der Speicherort-Dialog
abgebrochen wurde.

Dort tritt an die Stelle der Statusanzeige in der Leiste der Knopf **Sichern (n)** mit der Zahl
der offenen Änderungen. Weil sein Klick eine echte Nutzergeste ist, darf `speichern()` von dort
aus auch den Speicherort erfragen -- klappt das, wird ab dann wieder automatisch gesichert.
Der Hinweistext im Datei-Bereich (`#datei-modus`) beschreibt jeweils den geltenden Weg.

`offeneAenderungen` zählt die Änderungen; `gesichertFertig()` zieht nach dem Schreiben nur ab,
was auch in der Datei gelandet ist -- währenddessen kann weitergetippt worden sein. Die Warnung
beim Verlassen der Seite hängt an diesem Zähler.

### Nie zwei Schreibvorgänge gleichzeitig

`speichern()` reiht die Aufrufe an `schreibvorgang` auf und ruft erst dann `dateiSchreiben()`.
Ohne diese Kette könnte die nächste Änderung einen zweiten Schreibstrom auf dieselbe Datei
öffnen, während der erste noch läuft -- das Ergebnis wäre eine halb geschriebene Klassendatei,
und die ist verschlüsselt, also nicht von Hand zu retten.

### Der Tresor

`tresor.js` gibt nicht mehr Passphrasen entgegen, sondern einen **Tresor**: Salz plus den daraus
abgeleiteten Schlüssel.

- `tresorAnlegen(passphrase)` -- neue Klasse: frisches Salz, Schlüssel ableiten
- `tresorOeffnen(bytes, passphrase)` -- `{ tresor, inhalt }`; das Salz der Datei wird übernommen
- `verschluesseln(objekt, tresor)` -- neuer IV, kein erneutes Ableiten

Grund: Die Ableitung kostet 250.000 PBKDF2-Runden. Gemessen im Browser sind das rund 55 ms
einmalig gegenüber 0--3 ms je Speichervorgang danach -- vorher fielen die 55 ms bei **jeder**
Änderung an, bei einem Klassendurchgang also dutzende Male.

Dass das Salz je Datei gleich bleibt, ist unbedenklich: Es schützt gegen vorberechnete Tabellen
über verschiedene Passwörter und Dateien hinweg, dafür genügt ein Zufallswert je Datei. Frisch
sein muss bei AES-GCM der **IV**, und der wird weiterhin bei jeder Verschlüsselung neu gezogen.
Eine Prüfung in `pruefen.mjs` sichert genau das ab.

Nebeneffekt: Die Passphrase steht nach dem Öffnen nirgends mehr. `lehrkraft.js` hält statt
`passwort` nur noch den Tresor, dessen Schlüssel nicht auslesbar ist (`extractable: false`),
und leert das Eingabefeld. Ein Passwortwechsel ist damit weiterhin nicht vorgesehen.

## Eine Wahrheit je Sache

`katalog.json` ist die Datenquelle, `katalog.js` die einzige Stelle, die sie auswertet.
Es gab dort drei Doppelungen, die jetzt weg sind -- sie liefen auseinander, sobald jemand
den Katalog ändert:

| Frage | Zuständig |
|---|---|
| Welche Stufe kommt nach einer Entscheidung? | `stufeNachEntscheidung()` |
| Welche Stufe liegt darüber/darunter? | `nachbarStufe()` |
| „im Hafen", „an der Boie", … | `praeposition()` |
| Welche Rückstufungsgründe gelten? | `rueckstufungsgruende()` |

`klassendatei.js` kennt den Katalog bewusst nicht. `coachingEintragen()` bekommt die Zielstufe
deshalb als Angabe `nachStufe` vom Aufrufer -- vorher stand dort eine zweite, hart verdrahtete
Stufenkette `['hafen', 'ankerplatz', 'boie', 'freie-see']`.

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

**Wie die Klassenliste entsteht:** entweder beim Anlegen als Namensliste (eine Zeile je Kind),
über *+ Kind hinzufügen* oder aus den ersten Selbsteinschätzungen. In allen drei Wegen gilt
dieselbe Regel gegen Dubletten: ein bereits vorhandener Name (auch in anderer Schreibweise)
wird abgewiesen, ein ähnlicher löst eine Rückfrage aus. Sonst entstünden zwei Einträge zum
selben Kind, und `lernendeSuchen()` fände danach immer nur den ersten -- der zweite bekäme nie
eine Selbsteinschätzung zugeordnet.

Unbekannte Namen aus Importen werden nie still angelegt --
sie landen unter „Bitte entscheiden" mit den Möglichkeiten *neu anlegen*, *zuordnen*
(mit Vorschlag ähnlicher Namen gegen Tippfehler) oder *verwerfen*. Beim Erstaufbau,
wenn alle Namen neu sind, gibt es einen Sammelknopf für die ganze Klasse.
