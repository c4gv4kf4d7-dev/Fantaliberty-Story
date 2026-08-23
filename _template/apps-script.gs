/**
 * FantaLiberty — endpoint di raccolta risposte
 *
 * Il gioco NON invia a un Google Form: fa un POST form-urlencoded a un
 * Apps Script pubblicato come Web App, che scrive una riga sul Foglio.
 * Questo evita del tutto la mappatura degli `entry.ID`, che era il punto
 * più fragile delle vecchie edizioni.
 *
 * ─── SETUP (5 minuti) ─────────────────────────────────────────────────
 * 1. Crea un nuovo Foglio Google per l'edizione
 * 2. Estensioni → Apps Script, incolla questo file
 * 3. Distribuisci → Nuova distribuzione → tipo "App web"
 *      · Esegui come:        Me
 *      · Chi ha accesso:     Chiunque            ← obbligatorio
 * 4. Copia l'URL /exec e incollalo in APPS_SCRIPT_URL dentro il gioco
 * 5. Esegui `test_scriviRigaFinta()` dall'editor e controlla che la riga
 *    compaia sul Foglio
 *
 * ⚠️  Ogni volta che modifichi questo script devi creare una NUOVA
 *     distribuzione (o aggiornare quella esistente): salvare non basta.
 */

/** Colonne del Foglio, nell'ordine in cui verranno scritte.
 *  La chiave è il nome del parametro inviato dal gioco. */
var COLONNE = [
  { key: null,          header: 'Timestamp'  },  // aggiunto dal server
  { key: 'nome',        header: 'Nome'       },
  { key: 'cognome',     header: 'Cognome'    },
  { key: 'reparto',     header: 'Reparto'    },
  { key: 'seniority',   header: 'In Apple da'},
  { key: 'iphone',      header: 'iPhone'     },
  { key: 'store',       header: 'Store'      },
  { key: 'email',       header: 'Email'      },
  { key: 'profilo',     header: 'Profilo'    },  // ← il badge, calcolato dalle scelte
  { key: 'previsioni',  header: 'Previsioni' }
];

function doPost(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    // Intestazioni alla prima esecuzione
    if (foglio.getLastRow() === 0) {
      foglio.appendRow(COLONNE.map(function (c) { return c.header; }));
      foglio.getRange(1, 1, 1, COLONNE.length).setFontWeight('bold');
      foglio.setFrozenRows(1);
    }

    var riga = COLONNE.map(function (c) {
      if (c.key === null) return new Date();
      return p[c.key] || '';
    });
    foglio.appendRow(riga);

    // Se il gioco inizia a mandare parametri nuovi non ancora previsti,
    // lo si scopre dai log invece di perderli in silenzio.
    var attesi = COLONNE.map(function (c) { return c.key; });
    Object.keys(p).forEach(function (k) {
      if (attesi.indexOf(k) === -1) {
        console.warn('Parametro non mappato: "' + k + '" = ' + p[k]);
      }
    });

    return risposta({ ok: true });
  } catch (err) {
    console.error(err);
    return risposta({ ok: false, error: String(err) });
  }
}

/** Il gioco invia in mode:'no-cors' e non legge la risposta, ma un GET
 *  sull'URL è comodo per verificare a occhio che la Web App sia viva. */
function doGet() {
  return risposta({ ok: true, service: 'FantaLiberty', ts: new Date().toISOString() });
}

function risposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Scrive una riga finta, per verificare il collegamento col Foglio
 *  senza dover aprire il gioco. Eseguilo dall'editor Apps Script. */
function test_scriviRigaFinta() {
  doPost({ parameter: {
    nome: 'Mario', cognome: 'Rossi', reparto: 'Shopping',
    seniority: '0–3 anni', iphone: '17 Pro', store: 'Piazza Liberty',
    email: 'test@example.com', profilo: 'Scommettitore',
    previsioni: 'Previsione A | Previsione B'
  }});
  console.log('Fatto: controlla la prima riga libera del Foglio.');
}
