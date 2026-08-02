// Das analoge Material zum Graduierungssystem: Ausweise, Coaching- und
// Rückstufungsbögen als PDF, dazu je ein Vorschaubild der ersten Seite.
//
// Diese Datei ist die einzige Aufzählung davon. Sie wird an zwei Stellen
// gebraucht -- in der Lehrkraft-Anwendung unter *Material* und auf der
// öffentlichen Seite `material/`, die auch ohne geöffnete Klasse erreichbar
// ist. Zwei Listen liefen auseinander, sobald eine Datei dazukommt.
//
// Die Stufen kommen aus dem Katalog, nicht aus einer eigenen Liste: Kommt eine
// dazu, stimmen Reihenfolge und Namen von allein. Die Dateinamen folgen der
// Stufen-ID.

/**
 * Gruppen mit ihren Stücken. `datei` und `vorschau` sind relativ zum
 * Materialordner; `basisPfad` legt der Aufrufer davor.
 */
export function materialGruppen(katalog) {
  const stufen = [...katalog.stufen].sort((a, b) => a.reihenfolge - b.reihenfolge);
  const hoechste = stufen.at(-1);

  const stueck = (grundname, titel, zusatz, farbe) => ({
    datei: `${grundname}.pdf`,
    vorschau: `vorschau/${grundname}.jpg`,
    titel,
    zusatz,
    farbe,
  });

  return [
    {
      id: 'ausweise',
      titel: 'Ausweise zum Ausdrucken',
      hinweis:
        'Je Datei zwei gleiche Karten in A6. Auf A4 drucken und einmal in der Mitte ' +
        'schneiden – dann hast du zwei Ausweise.',
      stuecke: stufen.map((s) =>
        stueck(`ausweis-${s.id}`, `Ausweis ${s.name}`, 'PDF · zwei Karten in A6', s.farbe)
      ),
    },
    {
      id: 'coaching',
      titel: 'Coaching-Bögen',
      hinweis:
        'Der Bogen für das Gespräch, je ein Blatt pro Stufe: vier Zeiträume, Selbst- und ' +
        'Fremdeinschätzung nebeneinander, Auswertung und Unterschriften.',
      stuecke: stufen.map((s) =>
        stueck(`coaching-bogen-${s.id}`, `Coaching-Bogen ${s.name}`, 'PDF · ein Blatt A4', s.farbe)
      ),
    },
    {
      id: 'rueckstufung',
      titel: 'Rückstufungsbögen',
      hinweis:
        'Ankreuzliste der Gründe und Platz für die Vereinbarungen – benannt nach der Stufe, ' +
        'auf die zurückgestuft wird. Auf die höchste Stufe wird niemand zurückgestuft, ' +
        'deshalb ist sie hier nicht dabei.',
      stuecke: stufen
        .filter((s) => s.reihenfolge < hoechste.reihenfolge)
        .map((s) =>
          stueck(`rueckstufung-${s.id}`, `Rückstufung auf ${s.name}`, 'PDF · ein Blatt A4', s.farbe)
        ),
    },
    {
      id: 'gesamt',
      titel: 'Alles am Stück',
      hinweis: 'Die beiden ungeteilten Originaldateien – zum Nachlesen und zum Weitergeben.',
      ohneVorschau: true,
      stuecke: [
        {
          datei: 'ausweise-alle-stufen.pdf',
          titel: 'Ausweise aller vier Stufen',
          zusatz: 'PDF · 8 Seiten A6',
        },
        {
          datei: 'reflexionsboegen-alle.pdf',
          titel: 'Alle Reflexionsbögen',
          zusatz: 'PDF · 7 Seiten A4',
        },
      ],
    },
  ];
}

/**
 * Steht an beiden Stellen: Der Katalog der Anwendung ist gegenüber den
 * gedruckten Bögen zusammengeführt worden und noch nicht abgenommen. Wer
 * beides nebeneinander nutzt, soll das vorher wissen und nicht im Gespräch.
 */
export const MATERIAL_ABGLEICH =
  'Papier und Anwendung sind noch nicht deckungsgleich. Die PDFs sind die Originale; ' +
  'der Kriterienkatalog der Anwendung fasst einzelne Punkte zusammen und ergänzt einen. ' +
  'Wer beides nebeneinander nutzt, sollte das wissen.';
