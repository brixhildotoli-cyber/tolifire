// All'avvio: controlla se è richiesto il portale cliente
(async function() {
  var isPortale = await checkPortaleCliente();
  if(isPortale) return; // Non mostrare login

  // Altrimenti controlla sessione normale
  var {data:{session}} = await db.auth.getSession();
  if(session) {
    var {data:ud} = await db.from('utenti').select('*').eq('id', session.user.id).maybeSingle();
    if(ud) { await boot(ud); return; }
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
