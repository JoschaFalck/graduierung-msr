// Erfundene Klasse zum Ausprobieren -- damit man die Anwendung ansehen kann,
// ohne echte Kinderdaten anzulegen. Bewusst deterministisch: derselbe Aufruf
// erzeugt immer dieselbe Klasse, sonst sieht man bei jedem Öffnen etwas anderes.

import { kriterienDerStufe, bewertungszeilen } from './katalog.js';
import { klasseAnlegen, lernendeAnlegen, einschaetzungSetzen } from './klassendatei.js';

const KINDER = [
  ['Ayla Kilic', 'freie-see'],
  ['Ben Hartmann', 'ankerplatz'],
  ['Clara Weiß', 'boie'],
  ['David Nowak', 'hafen'],
  ['Elif Yildiz', 'ankerplatz'],
  ['Finn Bergmann', 'hafen'],
  ['Greta Sommer', 'boie'],
  ['Hamed Rahimi', 'ankerplatz'],
  ['Ida Kraus', 'hafen'],
  ['Jonas Peters', 'ankerplatz'],
  ['Klara Möller', 'boie'],
  ['Luca Fischer', 'hafen'],
  ['Marie Schuster', 'ankerplatz'],
  ['Nils Behrens', 'hafen'],
];

const BELEGE = [
  'Ich habe mein Fach jeden Montag aufgeräumt.',
  'Ich habe mir vorgenommen, im Input nicht zu reden – das hat meistens geklappt.',
  'Ich habe Finn beim Bruchrechnen geholfen, weil er es nicht verstanden hat.',
  'Ich habe meine Wochenziele ins Logbuch geschrieben und abgehakt.',
  'Ich habe den Klassendienst übernommen, obwohl ich nicht dran war.',
  'Ich war zweimal zu spät mit den Aufgaben, das will ich ändern.',
];

/** Kleiner Pseudozufall mit festem Startwert -- reproduzierbar. */
function wuerfel(startwert) {
  let zustand = startwert;
  return () => {
    zustand = (zustand * 1103515245 + 12345) % 2147483648;
    return zustand / 2147483648;
  };
}

/**
 * Baut eine vollständige Beispielklasse mit Selbst- und Fremdeinschätzungen
 * über mehrere Zeiträume -- inklusive gewollter Abweichungen zwischen beidem,
 * weil genau die im Coaching-Gespräch der interessante Teil sind.
 */
export function beispielklasse(katalog, zeitraeume = 4) {
  const datei = klasseAnlegen({
    klasse: '8b (Beispiel)',
    schuljahr: '2026/27',
    zyklusStart: startvorZeitraeumen(zeitraeume),
    katalogVersion: katalog.version,
  });

  for (const [name, stufe] of KINDER) lernendeAnlegen(datei, name, stufe);

  const zufall = wuerfel(4711);
  const werte = katalog.skala.map((s) => s.id);

  for (const kind of datei.lernende) {
    // Tendenz je Kind: manche liegen durchgehend gut, andere schwanken
    const tendenz = zufall();

    for (let z = 1; z <= zeitraeume; z++) {
      // ein Kind gibt in einem Zeitraum nichts ab -- die Fehlliste soll etwas zeigen
      const abwesend = kind.name === 'Nils Behrens' && z === zeitraeume;

      if (!abwesend) {
        einschaetzungSetzen(datei, {
          schuelerId: kind.id,
          zeitraum: z,
          quelle: 'selbst',
          stufe: kind.stufe,
          bewertungen: bewertungenBauen(kriterienDerStufe(katalog, kind.stufe).map((k) => k.id),
            werte, zufall, tendenz + 0.15),
          beleg: {
            kriteriumId: kriterienDerStufe(katalog, kind.stufe)[0].id,
            text: BELEGE[Math.floor(zufall() * BELEGE.length)],
          },
        });
      }

      // Fremdeinschätzung auf den Sammelzeilen, etwas strenger als die Selbstsicht
      if (z < zeitraeume) {
        einschaetzungSetzen(datei, {
          schuelerId: kind.id,
          zeitraum: z,
          quelle: 'fremd',
          bewertungen: bewertungenBauen(bewertungszeilen(katalog, kind.stufe).map((r) => r.id),
            werte, zufall, tendenz - 0.1),
        });
      }
    }
  }

  datei.beispiel = true;
  return datei;
}

function bewertungenBauen(ids, werte, zufall, guete) {
  const gebaut = {};
  for (const id of ids) {
    const wurf = zufall() * 0.6 + guete;
    gebaut[id] = wurf > 0.85 ? werte[0] : wurf > 0.45 ? werte[1] : werte[2];
  }
  return gebaut;
}

/** Startdatum so wählen, dass heute im gewünschten Zeitraum liegt. */
function startvorZeitraeumen(anzahl) {
  const start = new Date();
  start.setDate(start.getDate() - (anzahl - 1) * 14 - 3);
  return start.toISOString().slice(0, 10);
}
