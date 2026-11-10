// All'avvio: controlla se è richiesto il portale cliente
(async function() {
  var isPortale = await checkPortaleCliente();
  if(isPortale) return; // Non mostrare login

  // F15.11: service worker per tutti (app e librerie in cache, dati già
  // visti per l'uso senza rete, notifiche di js/59): js/57
  if(typeof registraServiceWorkerApp === 'function') registraServiceWorkerApp();

  // Altrimenti controlla sessione normale
  var {data:{session}} = await db.auth.getSession();
  if(session) {
    var {data:ud, error:erroreUtente} = await db.from('utenti').select('*').eq('id', session.user.id).maybeSingle();
    if(ud) { await boot(ud); return; }
    // F15.11: senza rete si apre con l'utente salvato sul telefono (js/57)
    if(erroreUtente && typeof erroreDiRete === 'function' && erroreDiRete(erroreUtente) &&
       typeof avvioSenzaRete === 'function' && await avvioSenzaRete(session.user.id)) return;
  } else if(typeof avvioSenzaRete === 'function' && await avvioSenzaRete(null)) {
    // F15.11: token scaduto e senza rete per rinnovarlo: utente salvato sul telefono
    return;
  }
  ge('lp').style.display = 'flex';
})();

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const email = ge('lem');
  const password = ge('lpw');

  if (email) {
    email.addEventListener('keydown', e => {
      if (e.key === 'Enter') password?.focus();
    });
  }

  if (password) {
    password.addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  }

  buildSB();
});
