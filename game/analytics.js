/* FantaLiberty — utility centralizzata per Google Analytics 4 (gtag.js).

   Il motore (engine.js) non chiama mai gtag() direttamente: passa sempre da
   qui, cosi' gli eventi restano in un punto solo e il gioco non si blocca se
   Analytics non c'e' (rete, adblock, sviluppo locale, test headless).

   Cosa fa questo file, e cosa NON fa:
   - non installa il tag (quello sta in index.html, come da specifica Google:
     deve partire prima possibile, non dopo che il motore ha caricato);
   - non decide QUANDO si spara un evento: quello lo decide engine.js, che sa
     cos'e' successo davvero in partita;
   - offre solo due funzioni, track() e trackOnce(), piu' un canale d'errore
     silenzioso — nessuna eccezione di qui puo' mai arrivare al motore.

   Elenco eventi e trigger: docs/analytics.md. */
(function (global) {
  'use strict';

  var MEASUREMENT_ID = 'G-SYX1RZLNNE';

  function track(eventName, params) {
    try {
      if (typeof global.gtag === 'function') global.gtag('event', eventName, params || {});
    } catch (e) { /* Analytics non deve mai far cadere il gioco */ }
  }

  /* Per gli eventi "una volta per partita" la deduplica vero e proprio la fa
     engine.js appoggiandosi al salvataggio (VN.state), che gia' sopravvive a
     refresh e riaperture nei giorni fra la registrazione e il keynote —
     esattamente la persistenza che la specifica chiede di riusare. trackOnce()
     qui e' solo una comodita' per chi chiama una volta sola nello stesso giro
     di codice (non attraverso un refresh): tiene un elenco a parte, per chiave
     libera, utile ad esempio ai test. */
  var fattiInProcesso = {};
  function trackOnce(chiave, eventName, params) {
    if (fattiInProcesso[chiave]) return false;
    fattiInProcesso[chiave] = true;
    track(eventName, params);
    return true;
  }

  global.FLAnalytics = {
    id: MEASUREMENT_ID,
    track: track,
    trackOnce: trackOnce
  };
})(typeof window !== 'undefined' ? window : globalThis);
