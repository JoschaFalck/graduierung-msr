// Erfundene Klasse zum Ausprobieren -- damit man die Anwendung ansehen kann,
// ohne echte Kinderdaten anzulegen. Bewusst deterministisch: derselbe Aufruf
// erzeugt immer dieselbe Klasse, sonst sieht man bei jedem Öffnen etwas anderes.

import { kriterienDerStufe, bewertungszeilen, stufeNachEntscheidung } from './katalog.js';
import {
  klasseAnlegen, lernendeAnlegen, einschaetzungSetzen, coachingEintragen,
} from './klassendatei.js';

// Startstufe und der Weg durchs Schuljahr: was bei jedem Coaching passiert.
// 'hoch' | 'gleich' | 'runter' -- drei Coachings = zwölf Zeiträume.
const KINDER = [
  ['Ayla Kilic',     'ankerplatz', ['hoch', 'hoch', 'gleich']],
  ['Ben Hartmann',   'hafen',      ['hoch', 'gleich', 'hoch']],
  ['Clara Weiß',     'ankerplatz', ['gleich', 'hoch', 'gleich']],
  ['David Nowak',    'hafen',      ['gleich', 'gleich', 'hoch']],
  ['Elif Yildiz',    'boie',       ['gleich', 'runter', 'hoch']],
  ['Finn Bergmann',  'hafen',      ['gleich', 'hoch', 'runter']],
  ['Greta Sommer',   'boie',       ['hoch', 'gleich', 'gleich']],
  ['Hamed Rahimi',   'hafen',      ['hoch', 'gleich', 'gleich']],
  ['Ida Kraus',      'ankerplatz', ['hoch', 'gleich', 'runter']],
  ['Jonas Peters',   'hafen',      ['gleich', 'gleich', 'gleich']],
  ['Klara Möller',   'ankerplatz', ['hoch', 'hoch', 'gleich']],
  ['Luca Fischer',   'hafen',      ['gleich', 'hoch', 'gleich']],
  ['Marie Schuster', 'ankerplatz', ['gleich', 'gleich', 'hoch']],
  ['Nils Behrens',   'hafen',      ['gleich', 'gleich', 'gleich']],
];

// Belegsatz und das Kriterium, zu dem er gehört -- als Paar, nicht getrennt.
// Vorher wurde der Text zufällig gezogen und immer über das *erste* Kriterium
// der Stufe geschrieben; im Coaching-Bogen stand dann viermal „Ich gehe
// respektvoll ... um" über Sätzen zum Logbuch und zum Bruchrechnen.
const BELEGE = [
  ['H5', 'Ich habe mein Fach jeden Montag aufgeräumt.'],
  ['H6', 'Ich habe mir vorgenommen, im Input nicht zu reden – das hat meistens geklappt.'],
  ['H3', 'Ich war zweimal zu spät mit den Aufgaben, das will ich ändern.'],
  ['A1', 'Ich habe meine Wochenziele ins Logbuch geschrieben und abgehakt.'],
  ['A2', 'Ich habe den Klassendienst übernommen, obwohl ich nicht dran war.'],
  ['B2', 'Ich habe Finn beim Bruchrechnen geholfen, weil er es nicht verstanden hat.'],
  ['B3', 'Ich habe in Mathe zweimal nachgefragt, statt einfach abzuschreiben.'],
  ['F1', 'Ich lese jede Woche mit meinem Lernpaten aus der 5b.'],
];

const BEGRUENDUNGEN = {
  gleich: 'Die Verantwortung wird überwiegend erfüllt, bei den Terminen fehlt noch Verlässlichkeit. Wir schauen in acht Wochen erneut.',
  hoch: '',
  runter: '',
};

const VEREINBARUNGEN = [
  'Ich schreibe alle Termine sofort ins Logbuch und zeige es freitags vor.',
  'Ich melde mich in Inputphasen, statt dazwischenzurufen.',
  'Ich räume mein Fach jeden Freitag auf.',
];

function wuerfel(startwert) {
  let zustand = startwert;
  return () => {
    zustand = (zustand * 1103515245 + 12345) % 2147483648;
    return zustand / 2147483648;
  };
}

/**
 * Baut eine Beispielklasse über ein halbes Schuljahr: zwölf Zeiträume,
 * drei Coaching-Gespräche mit Hoch- und Rückstufungen. Damit lässt sich der
 * Entwicklungsverlauf ansehen, nicht nur ein einzelner Zeitraum.
 */
export function beispielklasse(katalog, bloecke = 3) {
  const jeBlock = 4;
  const zeitraeume = bloecke * jeBlock;

  const datei = klasseAnlegen({
    klasse: '8b (Beispiel)',
    schuljahr: '2026/27',
    zyklusStart: startvorZeitraeumen(zeitraeume),
    katalogVersion: katalog.version,
  });

  for (const [name, stufe] of KINDER) lernendeAnlegen(datei, name, stufe);

  const zufall = wuerfel(4711);
  const werte = katalog.skala.map((s) => s.id);

  for (const [name, , weg] of KINDER) {
    const kind = datei.lernende.find((l) => l.name === name);
    const tendenz = zufall();
    let letzterBeleg = null; // damit im Coaching-Bogen nicht viermal dasselbe steht

    for (let block = 0; block < bloecke; block++) {
      // Einschätzungen dieses Blocks -- immer gegen die Stufe, die damals galt
      for (let i = 1; i <= jeBlock; i++) {
        const z = block * jeBlock + i;
        const letzterZeitraum = z === zeitraeume;

        // ein Kind gibt zuletzt nichts ab, damit die Fehlliste etwas zeigt
        if (!(kind.name === 'Nils Behrens' && letzterZeitraum)) {
          const beleg = belegBauen(katalog, kind.stufe, zufall, letzterBeleg);
          letzterBeleg = beleg.kriteriumId;
          einschaetzungSetzen(datei, {
            schuelerId: kind.id, zeitraum: z, quelle: 'selbst', stufe: kind.stufe,
            erstellt: `${datumFuerZeitraum(datei, z)}T09:20:00.000Z`,
            bewertungen: bewertungenBauen(
              kriterienDerStufe(katalog, kind.stufe).map((k) => k.id),
              werte, zufall, tendenz + 0.15 + block * 0.04
            ),
            beleg,
          });
        }

        // die letzte Fremdeinschätzung bleibt offen -- so sieht man den
        // Unterschied zwischen „vollständig“ und „fehlt noch“
        if (!letzterZeitraum) {
          einschaetzungSetzen(datei, {
            schuelerId: kind.id, zeitraum: z, quelle: 'fremd', stufe: kind.stufe,
            erstellt: `${datumFuerZeitraum(datei, z)}T15:40:00.000Z`,
            bewertungen: bewertungenBauen(
              bewertungszeilen(katalog, kind.stufe).map((r) => r.id),
              werte, zufall, tendenz - 0.1 + block * 0.04
            ),
          });
        }
      }

      // Coaching am Ende des Blocks -- das letzte steht noch aus
      const entscheidung = weg[block];
      if (block < bloecke - 1) {
        const zeitraum = (block + 1) * jeBlock;
        coachingEintragen(datei, {
          schuelerId: kind.id,
          zeitraum,
          entscheidung,
          nachStufe: stufeNachEntscheidung(katalog, kind.stufe, entscheidung),
          datum: datumFuerZeitraum(datei, zeitraum),
          gueltigAb: datumFuerZeitraum(datei, zeitraum),
          begruendung: entscheidung === 'gleich' ? BEGRUENDUNGEN.gleich : '',
          vereinbarungen:
            entscheidung === 'runter' ? VEREINBARUNGEN[Math.floor(zufall() * VEREINBARUNGEN.length)] : '',
          gruende: entscheidung === 'runter' ? rueckstufungsauswahl(katalog, kind.stufe, zufall) : [],
          ausweisUebergeben: entscheidung !== 'gleich',
        });
      }
    }
  }

  datei.beispiel = true;
  return datei;
}

/**
 * Ein Belegsatz, der zu seinem Kriterium passt und auf der Stufe auch gilt.
 * Ein Kind im Hafen soll nicht über den Lernpaten schreiben.
 *
 * `zuletzt` bleibt außen vor: Im Hafen stehen nur drei Sätze zur Wahl, und der
 * Coaching-Bogen zeigt vier Zeiträume nebeneinander -- ohne diese Regel stand
 * dort schon mal viermal derselbe Satz.
 */
function belegBauen(katalog, stufenId, zufall, zuletzt = null) {
  const gilt = new Set(kriterienDerStufe(katalog, stufenId).map((k) => k.id));
  const moeglich = BELEGE.filter(([id]) => gilt.has(id));
  const ohneWiederholung = moeglich.filter(([id]) => id !== zuletzt);
  const auswahl = ohneWiederholung.length ? ohneWiederholung : moeglich;
  const [kriteriumId, text] = auswahl[Math.floor(zufall() * auswahl.length)];
  return { kriteriumId, text };
}

/** Zwei plausible Gründe aus dem Katalog, damit der Rückstufungsbogen gefüllt ist. */
function rueckstufungsauswahl(katalog, stufenId, zufall) {
  const moeglich = kriterienDerStufe(katalog, stufenId).map((k) => k.id);
  const erste = Math.floor(zufall() * moeglich.length);
  const zweite = (erste + 1 + Math.floor(zufall() * 2)) % moeglich.length;
  return [...new Set([moeglich[erste], moeglich[zweite]])];
}

function bewertungenBauen(ids, werte, zufall, guete) {
  const gebaut = {};
  for (const id of ids) {
    const wurf = zufall() * 0.6 + guete;
    gebaut[id] = wurf > 0.85 ? werte[0] : wurf > 0.45 ? werte[1] : werte[2];
  }
  return gebaut;
}

function startvorZeitraeumen(anzahl) {
  const start = new Date();
  start.setDate(start.getDate() - (anzahl - 1) * 14 - 3);
  return start.toISOString().slice(0, 10);
}

function datumFuerZeitraum(datei, zeitraum) {
  const d = new Date(`${datei.zyklus.start}T00:00:00`);
  d.setDate(d.getDate() + zeitraum * datei.zyklus.tageJeZeitraum - 1);
  return d.toISOString().slice(0, 10);
}
