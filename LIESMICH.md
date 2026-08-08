# Graduierungs-App — Aufbau des Codes

```
app/                       ← dieser Ordner wird als Website veröffentlicht
  index.html                 Startseite mit den beiden Eingängen
  seite.css                  Aussehen der Seiten außerhalb der Anwendungen
  impressum.html             ENTWURF -- Platzhalter noch zu füllen
  datenschutz.html           ENTWURF -- Platzhalter noch zu füllen
  sw.js                      Service Worker (offline-Betrieb)
  symbole/                   App-Symbole (Anker) und Schullogo
  material/                  eigene Seite mit dem analogen Material als PDF
    vorschau/                Bild der ersten Seite je PDF (aus den PDFs gerendert)
  bilder/                    Titelbild der Startseite, Stufenbilder, freigestellte Motive
    stufen/                  Bild je Lernstufe für den Ausweis (3:1)
  gemeinsam/
    beispieldaten.js         erfundene Klasse zum Ausprobieren (Beispielmodus)
    katalog.json           ← einzige Datenquelle: Stufen, Kriterien, Privilegien, Rückstufungstexte
    katalog.js               Laden, Stufenvererbung, Sammelzeilen, Stufenwechsel, Rückstufungsbogen
    uebergabe.js             Format der Datei Kind → Lehrkraft (erzeugen, benennen, prüfen)
    tresor.js                Verschlüsselung der Klassendatei (AES-GCM, PBKDF2)
    klassendatei.js          Datenmodell: Lernende, Zeiträume, Einschätzungen, Import
    griffe.js                merkt Dateigriffe zwischen Sitzungen (IndexedDB)
    speicher.js              wo die Klassendatei liegt -- die Schnittstelle aus KONZEPT 7
    qr.js                    QR-Code erzeugen (eigener Encoder, keine Bibliothek)
    kataloge/                eingefrorene Katalogfassungen, je Version eine Datei
    material.js              Aufzählung des analogen Materials -- für beide Stellen
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
  pruefen.mjs                91 Prüfungen -- `node app/pruefen.mjs`
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
| `graduierung.schueler.entwurf` | die angefangene, noch nicht gesendete Einschätzung |
| `graduierung.schueler.vereinbarung` | die Vereinbarung aus dem letzten Coaching (per QR übernommen) |

Alles löschbar über „Alles auf diesem Gerät löschen" im Ausweis-Bereich.
Es verlässt das Gerät nur, was das Kind selbst über „Senden" abschickt.

**Der Entwurf** wird nach jeder Eingabe still mitgeschrieben und beim Öffnen
wiederhergestellt. Grund: iPadOS wirft Safari-Tabs beim App-Wechsel gern aus dem
Speicher — ohne Entwurf hieße das „8 von 14 Antworten weg, von vorn". Beim
Senden wird er gelöscht, ebenso bei einem Stufenwechsel (dann passt er nicht
mehr zu den Fragen).

## Service Worker

Strategie ist **Netz zuerst, Cache als Rückfall**. Eine neu veröffentlichte Fassung ist damit
sofort da, sobald WLAN vorhanden ist; offline läuft die App trotzdem. Cache-zuerst wäre schneller,
würde aber alte Fassungen auf 25 iPads festhalten, die man nicht einzeln entstauben kann.

Bei inhaltlichen Änderungen die Konstante `FASSUNG` in `sw.js` hochzählen.

**Beide** Anwendungen melden den Worker an (`offlineBereitstellen()` in `schueler.js` und in
`lehrkraft.js`), mit Geltungsbereich `../` — ein Worker in `schueler/` könnte `gemeinsam/`
nicht abfangen. Lange tat das nur die Schüleranwendung, obwohl `sw.js` die Lehrkraft-Dateien
im `VORRAT` mitführte; die Lehrkraft-App war damit als einzige nicht offline lauffähig.

Zwischengespeichert wird ausschließlich die Anwendung. Die Klassendaten liegen als Datei auf
der Festplatte und laufen nie durch `fetch` — sie können gar nicht in einen Cache geraten.

**Beim lokalen Testen wichtig:** Weil der Geltungsbereich `../` ist, liefert der Worker auch
die Lehrkraft-Dateien aus. Nach einer Änderung kann deshalb das alte Stylesheet erscheinen,
obwohl der Miniserver längst das neue ausliefert. Dann in der Konsole abmelden:
`navigator.serviceWorker.getRegistrations().then(r => r.forEach(x => x.unregister()))`, Caches
leeren, neu laden. Im Betrieb greift das nicht — dort gilt Netz zuerst.

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

## Materialspeicher

`app/material/` enthält das gedruckte Material zum System, erreichbar über den
Navigationspunkt *Material*: Ausweise zum Ausdrucken, Coaching-Bögen und Rückstufungsbögen.
Gedacht für drei Fälle -- Ausweise für die Kinder drucken, in einer Fortbildung zeigen, oder
eine Runde ganz auf Papier führen, wenn jemand das lieber mag.

Die Dateien sind aus den beiden Original-PDFs im Projektordner herausgetrennt (`pypdf`), **je
Stufe eine Datei**: Man druckt genau die, die man gerade braucht -- acht Ausweise „Hafen" für die
acht Kinder im Hafen, nicht acht Sätze mit allen vier Stufen.

| Woher | Seiten | Wird zu |
|---|---|---|
| `Graduierung_final MS Rednitzhembach.pdf` | 1–2, 3–4, 5–6, 7–8 | `ausweis-<stufe>.pdf` (je zwei gleiche Karten in A6) |
| `Reflexion_Graduierung MS Rednitzhembach.pdf` | 1, 2, 3, 4 | `coaching-bogen-<stufe>.pdf` |
| dieselbe Datei | 5, 6, 7 | `rueckstufung-<stufe>.pdf` (Ziel der Rückstufung) |

Dazu beide Originale ungeteilt als `ausweise-alle-stufen.pdf` und `reflexionsboegen-alle.pdf`.
**Die Originale im Projektordner bleiben unangetastet** -- `material/` enthält Kopien.

Die Liste in der Anwendung entsteht aus dem Katalog, nicht aus einer zweiten Aufzählung: Kommt
eine Stufe dazu, stimmen Reihenfolge und Namen von allein, die Dateinamen folgen der Stufen-ID.
Rückstufungsbögen gibt es nur bis zur vorletzten Stufe -- auf die höchste wird niemand
zurückgestuft.

Zwei Dinge, die dort bewusst so sind:

- **Die PDFs stehen nicht im `VORRAT` des Service Workers.** Sein Geltungsbereich ist `../`, der
  Vorrat würde also auch auf jedes Schüler-iPad geladen -- rund 1,7 MB, die dort niemand
  braucht. Der fetch-Handler legt sie nach dem ersten Öffnen ohnehin ab; damit sind sie danach
  offline verfügbar, und zwar nur auf dem Gerät, das sie benutzt.
- **Ein Hinweis sagt, dass Papier und Anwendung nicht deckungsgleich sind.** Der Katalog fasst
  gegenüber den gedruckten Bögen einzelne Punkte zusammen und ergänzt einen
  (`docs/KRITERIENKATALOG_Entwurf.md`, noch nicht abgenommen). Wer beides nebeneinander nutzt,
  soll das vorher wissen und nicht im Gespräch.

Startseite, Materialübersicht, Impressum und Datenschutz teilen sich **`seite.css`**. Vorher
standen die Farbwerte doppelt -- inline in `index.html` und in `lehrkraft/stil.css` -- und wären
beim nächsten Anfassen auseinandergelaufen. Die beiden Anwendungen behalten ihre eigenen
Stylesheets; sie sind Oberfläche, die vier Seiten sind Dokumente.

**Es gibt ihn an zwei Stellen**, und `gemeinsam/material.js` ist die einzige Aufzählung dahinter:

- `material/index.html` — eine **eigene Seite ohne geöffnete Klasse**, verlinkt von der
  Einstiegskarte („Analoge Vorlage des Graduierungssystems"). Mit Vorschaubild je Datei, für
  Fortbildungen und fürs schnelle Ausdrucken. Sie nutzt `lehrkraft/stil.css` mit, damit sie kein
  zweites Farbschema mitbringt.
- Der Navigationspunkt *Material* in der Anwendung, für den Griff zwischendurch — dort ohne
  Vorschaubilder, weil man beim Arbeiten weiß, was man sucht.

Die Vorschaubilder in `material/vorschau/` sind mit `pypdfium2` aus der ersten Seite jedes PDFs
gerendert (520 px breit, JPEG). Wird ein PDF ersetzt, gehört das Bild neu erzeugt.

## Impressum und Datenschutz

`impressum.html` und `datenschutz.html` liegen im Wurzelverzeichnis und sind aus **jeder**
Fußzeile erreichbar -- auch aus beiden Anwendungen, nicht nur von der Startseite.

**Beide sind als ENTWURF gekennzeichnet und noch nicht freigegeben.** Was fehlt, ist rot
hervorgehoben (`.offen`): Name der Schulleitung, Telefon und E-Mail, Aufsichtsbehörde, Kontakt
der/des Datenschutzbeauftragten, Aufbewahrungsfrist für Rückstufungsdokumente und das Datum der
Freigabe. So kann der Text nicht versehentlich unvollständig online gehen.

Zwei inhaltliche Punkte, die man nicht wegkürzen darf:

- **Der Abschnitt zum Hosting.** Die Seiten liegen bei GitHub Pages; beim Abruf gehen
  IP-Adresse und technische Angaben an diesen Anbieter. Das ist die **einzige** Stelle, an der
  überhaupt Daten das Gerät verlassen -- und deshalb gehört sie hinein, so kurz der Rest auch
  ist. Zieht die Schule um, muss der Abschnitt mit.
- **Keine externen Ressourcen.** Nachgeprüft mit einer Suche über alle HTML-, JS-, CSS- und
  JSON-Dateien: Es gibt keine einzige `http`-Adresse im Projekt. Keine Schriften, keine Skripte,
  keine Bilder von fremden Servern. Wer eine einbaut, macht die Datenschutzerklärung falsch.

## Die beiden Startkarten

Die **Ersteinrichtung der Schüleranwendung ist für die Kinder die Startseite** — sie bekommen den
Link auf `.../schueler/`, nicht auf die Übersichtsseite davor. Deshalb trägt sie dasselbe Kopfbild
(`bilder/header.jpg`, 4:1) mit dem Logo oben rechts darin, und dieselbe Karte ist über
`.karte-breit` auf 52 rem gesetzt: Name und Klasse stehen ab 34 rem nebeneinander (2:1 — „8a"
braucht keine halbe Bildschirmbreite), die vier Stufen ab 40 rem zweispaltig.

Die **Einstiegskarte der Lehrkraft-Anwendung** ist genauso breit (52 rem) und trägt oben
dasselbe `header.jpg` — dort **ohne Logo**, weil die Schule in der Überschrift steht
(„Graduierung der MS Rednitzhembach"). Das Kompass-Motiv `einstieg-lehrkraft.jpg` schließt die
Karte unten als `.karten-fuss` ab. Auf der breiten Karte stehen *Neue Klasse anlegen* und
*Beispielklasse ansehen* nebeneinander, ebenso Klasse und Schuljahr im Anlegen-Formular.

**Anleitung und Materialverweis sind ein Paar** (`.einstieg-mehr`): beide führen von der Klasse
weg und sind Nachschlagewerk, beide haben deshalb dieselbe leise Fläche, denselben dünnen
Rahmen, dieselbe Rundung und dieselbe linksbündige, halbfette Zeile. Damit heben sie sich von
den drei Knöpfen darüber ab, ohne laut zu werden. Fläche, Rahmen und Abstände stehen **einmal**
bei `.einstieg-mehr` — vorher hatte `.anleitung-kurz` sie für sich, und der Verweis daneben
blieb eckig, weil `border-radius` nur auf `button` stand und er ein `<a>` ist.

Das Fußband ist **6:1 mit `object-position: center 30%`** — gerechnet, nicht geraten: Auf der
832 px breiten Karte bleiben davon die Bildzeilen 120 bis 320 von 600 übrig. Kompass, Tasse und
Karte sind ganz drin, Lineal und Bleistift fallen unten heraus. Ein Band, das abschließt, statt
ein zweiter Kopf zu sein.

Kleinigkeiten mit Absicht: Der Satz unter der Überschrift steht auf `0.9rem`, damit er auf eine
Zeile passt (gemessen kippt er bei 0,92 rem). Das schwarze Dreieck des `<details>` ist weg — es
war das einzige schwarze Zeichen auf der Karte; stattdessen steht rechts ein leiser Winkel,
passend zum `→` des Verweises darunter. Für Safari braucht es dafür **beides**, `list-style:
none` und `::-webkit-details-marker`. Im Impressum steht „Zur Startseite" über `flex-end` rechts
auf Höhe der letzten Zeile, unter 34 rem klappt es untereinander.

Drei Dinge stecken darin, die man leicht wieder kaputtmacht:

- Das Bild sitzt randlos über **negative Ränder** (`calc(100% + 3.5rem)` und `-1.75rem`, also
  zweimal das Padding der Karte). Ändert sich das Padding, muss beides mit.
- Die Karte braucht `overflow: hidden`, sonst nimmt das Bild die Rundung nicht mit.
- **`aspect-ratio` und `max-height` dürfen nicht zusammenstehen.** Die beiden ziehen auch die
  Breite mit, und rechts bliebe ein weisser Streifen. Deshalb allein das Verhältnis.

Und eine Falle, die erst mit dem Kopfbild auffiel: Der Vollbild-Hintergrund richtet die Karte mit
**`align-items: safe center`** aus, nicht mit `place-items: center`. Wird die Karte höher als das
Fenster, ließe zentriertes Ausrichten sie oben *und* unten überstehen — und der obere Teil wäre
nicht wegscrollbar. `safe` fällt in dem Fall auf `start` zurück.

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

Die Ausweiskarte zeigt ihr Stufenbild über `aspect-ratio: 3 / 1` **vollständig** -- auf Handy
und iPad wird vertikal nichts beschnitten. Zwei Fallstricke stecken darin:

- `aspect-ratio` und `max-height` dürfen nicht zusammenstehen: Die beiden ziehen auch die
  Breite mit, und rechts bliebe ein weisser Streifen. Ab 75 rem Fensterbreite steht deshalb
  eine feste `height` (17 rem) **statt** `aspect-ratio`. Nur dort wird überhaupt beschnitten.
  Die 17 rem sind gerechnet: Die Karte ist höchstens 1152 px breit, 272 px Bandhöhe ergeben
  darauf 4,2:1 — fast das Verhältnis, in dem `ankerplatz.jpg` ohnehin vorliegt. Mit den
  vorherigen 15 rem waren es 4,8:1, und die beiden ungetrimmten 3:1-Bilder verloren über ein
  Drittel ihrer Höhe: Beim Hafen ging der Schnitt mitten durch die Hausdächer. Deshalb
  zusätzlich `object-position: center 55%` **nur** für den Hafen (`data-stufe` am Bild, gesetzt
  in `ausweisZeichnen()`) — damit sind Häuser, Kran, Boot, Poller und Boje vollständig drin.
- `ankerplatz.jpg` und `freie-see.jpg` kamen mit weissen Balken oben und unten aus der
  Bilderzeugung. Die sind entfernt; beide Bilder sind dadurch flacher als 3:1 und werden von
  `object-fit: cover` seitlich statt vertikal beschnitten -- bei diesen Panoramen unkritisch.
  **Bei neuen Bildern die Ränder prüfen**, solange sie beschnitten dargestellt werden, fällt
  so etwas nicht auf.

Beide Ausweislisten — Privilegien **und** Verantwortung — sind nach Stufen gruppiert
(`.liste .gruppe`). Ohne die Zwischenüberschriften stehen auf Freier See zwölf Privilegien
ununterscheidbar nebeneinander, und die Frage „Was darf ich jetzt mehr?", der eigentliche Reiz
des Systems, bleibt unbeantwortet.

Die Kopfzeile der Karte lautet „Ich lerne im Hafen" -- eine Zeile statt zwei, ganz in der
Stufenfarbe. Die Präposition kommt aus `praeposition()` im Katalog, damit hier keine zweite
Schreibweise entsteht. Unter 30 rem weicht das kleine Stufensymbol: Es zeigt dasselbe wie das
Bild darüber, und ohne es passt die Zeile aufs Handy.

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
Für Screenreader steht davor ein verstecktes „erfasst:", und das ✓ trägt das Wort
„vollständig" — sonst liest die Stimme je nach Einstellung „Häkchen" oder gar nichts.

Legende und Raster stehen zusammen auf `max-width: 60rem`. Über die volle Fensterbreite lagen
zwischen Kriteriumstext und den X/~/O-Knöpfen auf 1440 px über 1000 px, und der Blick musste bei
jeder Zeile einmal quer — beim meistgenutzten Handgriff der App. Die Legende über dem Raster
(`#fremd-legende`, gefüllt aus `katalog.skala`) erklärt die drei Zeichen; die Wortmarken in den
Knöpfen selbst bleiben `.nur-lesen`, weil sie dort keinen Platz haben.

## Die Punkte in der Klassenübersicht

Ein Punkt je Zeitraum des Blocks. Die drei Zustände unterscheiden sich in der **Form** —
leerer Ring, halb gefüllt, voll — und nicht nur in der Farbe: Grün/Orange/Grau war bei
Rot-Grün-Schwäche nicht zu trennen. Eine Legende steht über der Liste.

Die Karten selbst sind echte `<button>` mit `aria-label` („Ayla Kilic, Freie See, 3 von 4
Zeiträumen vollständig"). Vorher waren sie `<article role="button" tabindex="0">` und wurden
als „Schaltfläche" ohne zugänglichen Namen vorgelesen. Die eigene Tastaturbehandlung in
`klassenlisteVerdrahten()` ist damit weggefallen — Enter und Leertaste kommen vom Element.
Weil `<button>` eigene Vorgaben mitbringt, stehen in `.kind` jetzt `width: 100%`,
`text-align: left`, `color: inherit` und `border: 0`.

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

### Wo die Datei liegt: `speicher.js`

KONZEPT Abschnitt 7 verlangt den Speicherzugriff hinter einer Schnittstelle -- „heute
`DateiSpeicher`, später eventuell `SchulcloudSpeicher`". `lehrkraft.js` spricht deshalb nirgends
mehr direkt mit der File System Access API; es kennt nur `speicher.lesen()`,
`speicher.schreiben()`, `speicher.kopieAblegen()` und die Ordnerfunktionen.

Was bewusst **nicht** im Speicher steht, weil es Sache der Anwendung ist: die Verschlüsselung,
die Reihenfolge der Schreibvorgänge (`schreibvorgang`), die Zählung offener Änderungen und die
Entscheidung, ob überhaupt automatisch gesichert wird. Der Speicher kennt nur Bytes, Namen und
Orte.

`schreiben()` gibt zurück, *was* passiert ist: `datei`, `download` oder `abgebrochen`. Genau
diese Unterscheidung braucht die Anwendung -- bei `abgebrochen` bleibt der Änderungszähler
stehen, weil nichts geschrieben wurde.

### Gemerkte Griffe und die Wochensicherung

`gemeinsam/griffe.js` legt Dateigriffe in IndexedDB ab. Ein `FileSystemHandle` lässt sich nicht
als Text speichern, wohl aber strukturiert klonen — deshalb IndexedDB und nicht localStorage.
Gespeichert wird ein **Verweis samt Berechtigung**, nie ein Inhalt.

Zwei Griffe liegen dort:

| Schlüssel | Wofür |
|---|---|
| `graduierung.lehrkraft.dateigriff` | die zuletzt geöffnete Klassendatei |
| `graduierung.lehrkraft.sicherungsordner` | der Ordner für die Wochenkopien |

**Zuletzt geöffnet** steht auf der Einstiegsseite: ein Klick, Passwort, fertig — kein Dateidialog
(das ist die Zusage aus KONZEPT Abschnitt 6). Nach der Berechtigung wird bewusst erst **im Klick**
gefragt. Außerhalb einer Nutzergeste beantwortet der Browser `requestPermission()` ohne Rückfrage
mit Nein, und der gemerkte Griff wäre verbrannt. Aus demselben Grund läuft
`wochensicherungPruefen()` direkt hinter dem Absenden des Passworts.

**Die Wochensicherung** legt beim Öffnen alle `SICHERUNG_TAGE` Tage eine datierte Kopie im
gewählten Ordner ab und behält die letzten `SICHERUNGEN_BEHALTEN`. Warum ein eigener Ordner und
nicht „neben der Arbeitsdatei" wie im Konzept: Ein Dateigriff kennt sein Verzeichnis nicht, die
Anwendung kann von sich aus nicht daneben schreiben.

Zwei Dinge, die man leicht kaputtmacht:

- `altSicherungenLoeschen()` fasst **nur** an, was zum Namensmuster dieser Klasse passt
  (`Klasse-<klasse>-<schuljahr>_JJJJ-MM-TT.gradu`). Fremde Dateien im Ordner — auch Sicherungen
  anderer Klassen — bleiben unberührt. Der Klassenname geht durch `regexSicher()`, weil „8b
  (Beispiel)" Klammern enthält.
- Sortiert wird nach Dateinamen. Das geht nur auf, weil der Name auf ein ISO-Datum endet.

Datenschutzlich ist das kein zweiter Schauplatz: Die Kopien sind dieselben verschlüsselten Bytes
wie die Arbeitsdatei. Wo sie liegen, ist deshalb gleichgültig — genau die Zusage aus KONZEPT 9.
In Safari gibt es keinen Ordnerzugriff; dort sagt der Bereich das und verweist auf „Klassendaten
lokal sichern".

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
und leert das Eingabefeld.

### Passwort ändern

`passwortWechseln()` im Bereich *Datei*. Technisch heißt das: **neues Salz, neuer Schlüssel,
Datei einmal komplett neu geschrieben** — vorhandene Bytes lassen sich nicht nachträglich
umschlüsseln.

Drei Entscheidungen stecken darin:

- **Das alte Passwort wird nicht abgefragt.** Es steht nach dem Öffnen nirgends mehr, ließe sich
  also nur durch einen zweiten Entschlüsselungsversuch auf die Datei prüfen. Der Aufwand lohnt
  nicht: Wer im Bereich *Datei* steht, hat die Klasse bereits offen — ein neues Passwort
  verschafft ihm keinen Zugang, den er nicht schon hätte.
- **Der neue Tresor gilt erst, wenn das Schreiben geklappt hat.** Bricht der Speicherort-Dialog
  ab, wird auf den alten zurückgeschaltet. Ohne diese Rückabwicklung läge in der Datei noch das
  alte Passwort, während die Anwendung schon das neue annähme — beim nächsten Öffnen käme
  „Passwort falsch", und die Klasse wäre für ein Schuljahr zu.
- **Ältere Sicherungskopien behalten ihr altes Passwort.** Sie tragen den Schlüssel, der beim
  Ablegen galt. Steht als Hinweis über dem Formular, sonst wäre es eine böse Überraschung.

Ohne beschreibbaren Dateigriff (Safari) entsteht ein Download, den man über die bisherige Datei
legen muss — die Erfolgsmeldung sagt das dann ausdrücklich.

Die Warnung an der Stelle, wo die Passphrase gesetzt wird, ist ein `.warnfeld` mit rotem
Streifen. Sie stand vorher als leiser `.hinweis` da; was hier schiefgeht, ist aber das einzige
wirklich Unumkehrbare in dieser Anwendung.

## Auskunft nach Art. 15 DSGVO

Im Verlauf eines Kindes: ein Blatt mit allem, was über es gespeichert ist — Stammdaten,
Stufenverlauf, sämtliche Selbst- und Fremdeinschätzungen im Klartext (Kriterium für Kriterium,
gegen die *damals* gültige Stufe aufgelöst), alle Gespräche und ein Abschnitt zu Herkunft,
Zweck, Empfängern, Speicherort, Dauer und Betroffenenrechten.

**Bewusst kein Dateidownload.** Eine Textdatei mit Verhaltensdaten läge unverschlüsselt im
Downloads-Ordner und wanderte auf einem Mac mit synchronisiertem Schreibtisch unbemerkt in die
iCloud — genau die Falle aus KONZEPT Abschnitt 9. Für Ausdrucke macht das Konzept die Ausnahme
(„die gehören gedruckt und nicht abgelegt"), für Dateien nicht. Deshalb Druckansicht.

Ist das Schuljahr bereits abgeschlossen, sagt eine Fußnote auf dem Blatt, wann gelöscht wurde
und dass die Auskunft nur den verbliebenen Bestand zeigt.

## Schuljahr abschließen

Im Bereich *Datei*. `rohdatenLoeschen()` in `klassendatei.js` löscht alle Einschätzungen samt
Belegsätzen. Die Coachings bleiben als **Gerüst** stehen — Datum, Entscheidung, von welcher auf
welche Stufe — denn daraus leitet `stufenverlauf()` die Historie ab, die laut KONZEPT 11.3
ausdrücklich bleiben soll. „Löschen ist hier eine Funktion, kein Versäumnis."

Die **Freitexte der Gespräche** (Begründungen, Vereinbarungen, Rückstufungsgründe) hängen an
einem eigenen Häkchen und gehen nicht automatisch mit. Sie sind zwar genau das, was KONZEPT 11.3
meint mit „ein digitales Register, das jahrelang ‚hält sich nicht an Klassenregeln' konserviert" —
ob sie weg dürfen, hängt aber an der Aufbewahrungsfrist für Rückstufungsdokumente, und die Frage
steht im Konzept offen. Deshalb entscheidet das der Aufrufer, nicht `rohdatenLoeschen()`.

Vor dem Löschen steht eine Bilanz, die **beides** nennt: was verschwindet und was bleibt. „Löschen"
allein sagt nicht, dass die Stufenhistorie erhalten bleibt, und genau das ist hier der Punkt.
`datei.abschluss` hält Datum und Umfang fest.

**Achtung beim Erweitern:** Die Fremdeinschätzung ruft bewusst nicht `allesZeichnen()` auf,
sondern zählt nur nach — sonst springt beim Tippen der Fokus. Der Datei-Bereich stand dadurch
auf einem veralteten Stand. Er frischt jetzt beim Öffnen auf (`navigationVerdrahten()`). Wer dort
weitere Zahlen anzeigt, muss das mitbedenken.

## Der Rückweg aufs Kindergerät (QR)

Nach dem Coaching zeigt die Lehrkraft einen QR-Code, das Kind scannt ihn mit der iPad-Kamera und
hat die neue Stufe auf dem eigenen Gerät (KONZEPT Abschnitt 5). Damit verschwindet der letzte
große Bruch: Vorher füllte ein hochgestuftes Kind so lange den falschen Kriteriensatz aus, bis es
seine Stufe von Hand umstellte.

**Warum kein Decoder gebraucht wird:** Die iPad-Kamera erkennt QR-Codes von sich aus und öffnet
die Adresse. Der Code enthält nur `…/schueler/#s=<stufe>&v=<vereinbarung>`. Bewusst ein Fragment
und kein `?`-Parameter -- Fragmente werden nie an einen Server gesendet, dieselbe Überlegung wie
beim Klassen-Link.

**`gemeinsam/qr.js`** ist ein eigener Encoder: Byte-Modus, Fehlerkorrektur M, Fassungen 1 bis 10,
also bis 213 Zeichen. Fehlerkorrektur M statt L, weil der Code schräg und bei schlechtem Licht
gescannt wird. Ausgegeben wird SVG, damit er beim Vergrößern und Drucken scharf bleibt.

Die Tabelle `BAUART` stammt aus ISO/IEC 18004, Tabelle 9. **Dort nichts raten:** Eine falsche
Zeile ergibt einen Code, der tadellos aussieht und sich nicht lesen lässt. Geprüft wurde gegen
`BarcodeDetector` -- jede der zehn Fassungen an ihrer Kapazitätsgrenze.

**Übernommen wird nie still.** Das Kind sieht die neue Stufe, das Motto und die Vereinbarung und
sagt Ja oder „Nicht jetzt". Ein Code, der von selbst am Profil dreht, wäre auch der bequemste
Weg für einen Scherz auf dem Pausenhof. Nach der Entscheidung leert `history.replaceState()` das
Fragment, sonst stellt ein Neuladen dieselbe Frage noch einmal.

Ist die Vereinbarung so lang, dass kein Code mehr passt, wird sie weggelassen und der Code trägt
nur die Stufe -- lieber das als gar keinen Code.

## Der Klassen-Link als QR-Code und Plakat

Die Anleitung sagt in Schritt 2 „QR-Code an die Wand" — erzeugen musste ihn bisher ein
fremder Dienst, genau das, was das Projekt sonst vermeidet. Jetzt steht in der Übersicht
der Knopf **Klassen-Link zeigen**: derselbe Encoder wie beim Stufen-Rückweg
(`gemeinsam/qr.js`), kodiert wird nur die Adresse der Schüleranwendung mit der Klasse im
Fragment (`…/schueler/#8a`). Zum Projizieren am Beamer oder über **Als Plakat drucken**
als Aushang fürs Klassenzimmer.

Das Plakat ist kein eigenes Dokument, sondern derselbe Kasten unter Druckregeln: Der
Druckknopf setzt `plakat-druck` auf `body`, die Regeln in `lehrkraft/stil.css` blenden
alles andere aus und ziehen Kopfband (`bilder/header.jpg`), Titel und Code groß auf.
`afterprint` nimmt die Klasse wieder weg — auch wenn der Druckdialog abgebrochen wurde.
Zwei Fallen dabei:

- Die allgemeine Druckregel blendet `.hinweis` aus; die Adresse unter dem Code
  (`#klassencode-adresse`) wird auf dem Plakat per `!important` wieder eingeblendet —
  sie ist der Rückfall, wenn eine Kamera klemmt.
- Im normalen Druck (Coaching-Bogen, Auskunft) ist `.klassencode` ausgeblendet, damit
  er nicht mitten im Bogen auftaucht, falls er noch offen steht.

## Katalogfassungen

`katalog.json` ist die heute gültige Fassung. Daneben liegt in `kataloge/` je Version ein
eingefrorenes Archiv. Eine Klassendatei trägt in `katalogVersion`, mit welcher sie angelegt
wurde; `katalogFassung()` lädt genau die.

Warum das nötig ist (KONZEPT Abschnitt 7): Ein im Oktober gesetztes Kreuz muss weiter auf den
Text zeigen, der damals danebenstand. Sonst ändert sich rückwirkend, was ein Kind angekreuzt
hat -- bei einer Verhaltensbeurteilung kein Schönheitsfehler.

**Wenn du `katalog.json` änderst:**

1. die bisherige Fassung nach `kataloge/katalog-<alte-version>.json` kopieren,
2. `version` in `katalog.json` hochzählen,
3. die neue Fassung ebenfalls als Archiv ablegen,
4. beides in den `VORRAT` in `sw.js` eintragen.

Eine Prüfung wacht darüber, dass die laufende Fassung archiviert ist und inhaltlich
übereinstimmt. In der Lehrkraft-Anwendung sind `katalogAktuell` (heute ausgeliefert) und
`katalog` (gilt für die geöffnete Datei) getrennt; weichen sie ab, sagt der Datei-Bereich das
und bietet das Umstellen als Entscheidung an. Fehlt ein Archiv, werden die heutigen Texte
gezeigt und auch das steht dort.

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

### Vereinbarungen gehören zu jedem Ausgang

Das Feld war lange an „Rückstufung" gekoppelt. Nach KONZEPT Abschnitt 2 und dem Datenmodell in
Abschnitt 7 gehört die Vereinbarung aber zu allen drei Ausgängen -- bei „Stufe halten" ist sie
sogar das eigentliche Ergebnis des Gesprächs. `entscheidungWechsel()` blendet sie deshalb nicht
mehr aus, sondern wechselt nur die Frage im Feld (`VEREINBARUNG_FRAGE`). Pflichtfeld ist sie
bewusst nicht -- das wäre eine pädagogische Festlegung, keine technische.

### Belegsätze in den Beispieldaten

`BELEGE` in `beispieldaten.js` ist eine Liste aus Paaren `[kriteriumId, Satz]`, und `belegBauen()`
zieht nur aus dem, was auf der Stufe des Kindes gilt. Vorher stand die `kriteriumId` fest auf dem
ersten Kriterium der Stufe, während der Text zufällig kam -- im Bogen stand dann „Ich gehe
respektvoll ... um" über einem Satz zum Bruchrechnen.

Zwei Fallstricke stecken darin: Im Hafen stehen nur drei Sätze zur Wahl, der Bogen zeigt aber
vier Zeiträume nebeneinander -- deshalb schließt `belegBauen()` das zuletzt gezogene Kriterium
aus. Und für eine neue Stufe braucht es auch einen neuen Satz, sonst greifen die Kinder dort
immer auf geerbte Kriterien zurück.

## Noch offen in der Lehrkraft-Anwendung

- **Personalisierter Ausweis zum Drucken** (die Ausweiskarte mit Namen des Kindes)
- **Unterschriften**: Der gedruckte Bogen hat eine Unterschriftenzeile, in der Anwendung
  selbst wird nichts signiert -- unterschrieben wird auf Papier

**Stufe klären beim Import:** Meldet ein Kind eine andere Stufe, als die Klassendatei führt
(`stufeWeicht`), steht das im Import unter *Stufe klären* mit zwei Knöpfen. *„<Stufe>
übernehmen"* macht die gemeldete zur geführten, *„Kind hat sich vertan"* lässt alles wie es ist.
Die Abweichung heißt nämlich nicht zwangsläufig, dass die Klassendatei recht hat: Ein Kind kann
sich bei der Einrichtung vertippt haben, und es kann außerhalb der App aufgestiegen sein.

Die Liste liegt in `stufenkonflikte`, nicht in der Ergebnisliste des einen Imports -- sonst
verschwände sie beim nächsten Neuzeichnen. Bleibt es bei der geführten Stufe, muss das Kind sie
auf seinem Gerät umstellen; tut es das nicht, steht der Punkt beim nächsten Import wieder da,
und das ist die gewünschte Erinnerung. Der QR-Rückweg aus KONZEPT Abschnitt 5, der die Stufe von
sich aus zurückbrächte, ist weiterhin nicht gebaut.

**Umbenennen und Entfernen** stehen im Verlauf eines Kindes, nicht in der Übersicht: Beides
passiert selten, und Entfernen löscht den ganzen Verlauf mit — wer dort steht, hat ihn gerade
vor sich. `lernendeUmbenennen()` weist einen bereits vergebenen Namen ab, aus demselben Grund
wie beim Anlegen. `lernendeEntfernen()` nimmt **Einschätzungen und Coachings mit**; blieben sie
stehen, wären sie in keiner Ansicht mehr sichtbar, aber weiter in der Datei — bei
Verhaltensdaten Minderjähriger das Gegenteil dessen, was Löschen leisten soll (KONZEPT 11.3).
Die Rückfrage nennt vorher, wie viel daran hängt.

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
