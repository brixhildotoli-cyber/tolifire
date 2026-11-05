// ── F14.6 — NOTIFICHE SUL TELEFONO PER GLI AVVISI URGENTI (sql/66) ─────
// Gli avvisi URGENTI (avvisi.urgente, sql/65) arrivano entro un minuto come
// notifica sul telefono e per email: li manda il database (trigger di
// sql/66 → pg_net → Edge Function supabase/functions/avvisi-urgenti, con le
// chiavi VAPID e la chiave di Brevo SOLO nei segreti della funzione). Gli
// avvisi normali restano nella campanella e nel riepilogo delle 8:00.
// Questo file:
// - legge se le notifiche sono configurate (RPC configurazione_push); se
//   no (sql/66 non eseguito, Vault vuoto) NON fa nulla: nessun service
//   worker, nessun permesso chiesto, nessun bottone;
// - registra il service worker sw.js (registraServiceWorker di js/01);
// - "🔔 Attiva le notifiche": chiede il permesso (solo dopo il tocco),
//   iscrive il dispositivo (registra_dispositivo_push); "Spegni" lo toglie;
// - iPhone/iPad: le notifiche funzionano da iOS 16.4 SOLO con l'app
//   installata (Condividi → Aggiungi alla schermata Home): al primo accesso
//   da Safari compare l'invito "Installa l'app";
// - rientrando, il dispositivo di chi l'aveva attivato si ricollega da solo;
//   "Esci" lo scollega (doLogout di js/01 → scollegaDispositivoPush);
// - riquadro "📱 Notifiche sul telefono" in cima alla finestra Avvisi
//   (js/58); per il titolare anche impostazioni (notifiche, email degli
//   urgenti, riepilogo e ora, urgenti anche a lui), "🚨 Avviso urgente di
//   prova" a se stesso, "✉️ Riepilogo di prova" e la spunta "Urgente" nella
//   finestra dell'avviso di prova.

const PUSH = { config: null, lettura: null, sub: null, mio: false, avviato: false, occupato: false };
const CHIAVE_PUSH_UTENTI = 'toli_push_utenti';       // utenti che l'hanno attivato su questo dispositivo
const CHIAVE_PUSH_INVITO = 'toli_push_invito_';      // + utente: invito chiuso il (ms)
const PUSH_INVITO_DI_NUOVO_MS = 7 * 24 * 3600 * 1000; // "Non ora": si ripropone dopo 7 giorni

function pushSupportato() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}

function dispositivoIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function appInstallata() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

function nomeDispositivoPush() {
  const ua = navigator.userAgent;
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || dispositivoIOS() && /Mac/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Dispositivo';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return (sistema + (browser ? ' – ' + browser : '') + (appInstallata() ? ' (app)' : '')).slice(0, 200);
}

function erroreConfigPushMancante(error) {
  if (!error) return false;
  return ['PGRST202', '42883', '42P01', 'PGRST205'].includes(error.code) ||
    /configurazione_push|could not find the function/i.test(String(error.message || ''));
}

// { attivo, chiave_pubblica, ... } ; { mancante: true } senza sql/66 ; null = errore
async function leggiConfigurazionePush(forza) {
  if (!forza && PUSH.config) return PUSH.config;
  if (PUSH.lettura) return PUSH.lettura;
  PUSH.lettura = (async function() {
    try {
      const { data, error } = await db.rpc('configurazione_push');
      if (error) {
        if (erroreConfigPushMancante(error)) return (PUSH.config = { attivo: false, mancante: true });
        console.warn('Notifiche:', error.message);
        return null;
      }
      return (PUSH.config = data || { attivo: false });
    } catch (e) {
      return null;
    }
  })();
  try { return await PUSH.lettura; } finally { PUSH.lettura = null; }
}

function chiaveVapidInByte(b64) {
  const s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function stessaChiaveVapid(sub, chiave) {
  try {
    const k = sub && sub.options && sub.options.applicationServerKey;
    if (!k) return true; // il browser non la dice: si tiene
    const a = new Uint8Array(k), b = chiaveVapidInByte(chiave);
    return a.length === b.length && a.every(function(x, i) { return x === b[i]; });
  } catch (e) { return true; }
}

function utentiPushQui() {
  try { return JSON.parse(localStorage.getItem(CHIAVE_PUSH_UTENTI) || '[]'); } catch (e) { return []; }
}
function segnaUtentePushQui(id, attivo) {
  const l = utentiPushQui().filter(function(x) { return x !== id; });
  if (attivo) l.push(id);
  try { localStorage.setItem(CHIAVE_PUSH_UTENTI, JSON.stringify(l.slice(-10))); } catch (e) {}
}

async function registrazionePush() {
  if (typeof registraServiceWorker !== 'function') return null;
  return registraServiceWorker();
}

async function salvaIscrizionePush(sub) {
  const j = sub.toJSON ? sub.toJSON() : {};
  const keys = j.keys || {};
  const { error } = await db.rpc('registra_dispositivo_push', {
    p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_dispositivo: nomeDispositivoPush()
  });
  if (error) throw new Error(error.message);
  PUSH.sub = sub;
  PUSH.mio = true;
  if (typeof ME !== 'undefined' && ME && ME.id) segnaUtentePushQui(ME.id, true);
}

// Al login (boot, js/01). Non chiede MAI il permesso da solo.
async function avviaNotifichePush() {
  PUSH.config = null; PUSH.sub = null; PUSH.mio = false; PUSH.avviato = true;
  nascondiInvitoPush();
  const cfg = await leggiConfigurazionePush(true);
  if (!cfg || !cfg.attivo) return;
  if (!pushSupportato()) {
    if (dispositivoIOS() && !appInstallata()) mostraInvitoPush('installa');
    return;
  }
  const reg = await registrazionePush();
  if (!reg || !reg.pushManager) return;
  let sub = null;
  try { sub = await reg.pushManager.getSubscription(); } catch (e) {}
  const mioQui = typeof ME !== 'undefined' && ME && utentiPushQui().indexOf(ME.id) >= 0;
  if (sub && Notification.permission === 'granted' && mioQui) {
    try {
      if (!stessaChiaveVapid(sub, cfg.chiave_pubblica)) {
        // chiavi VAPID cambiate sul server: nuova iscrizione con la chiave nuova
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapidInByte(cfg.chiave_pubblica) });
      }
      await salvaIscrizionePush(sub);
    } catch (e) {
      console.warn('Notifiche: dispositivo non ricollegato', e && e.message);
    }
    return;
  }
  PUSH.sub = sub;
  if (Notification.permission !== 'denied') mostraInvitoPush('attiva');
}

// Dal tocco su "Attiva le notifiche": il permesso si chiede SUBITO (iPhone lo
// vuole dentro il tocco, prima di altre attese).
async function attivaNotifichePush() {
  if (PUSH.occupato) return;
  if (!pushSupportato()) {
    toast(dispositivoIOS() && !appInstallata()
      ? 'Su iPhone le notifiche arrivano solo dall\'app installata: Condividi → Aggiungi alla schermata Home'
      : 'Questo browser non riceve notifiche', 'err');
    return;
  }
  PUSH.occupato = true;
  try {
    const permesso = await Notification.requestPermission();
    if (permesso !== 'granted') {
      toast(permesso === 'denied'
        ? 'Notifiche bloccate: riattivale dalle impostazioni del telefono o del browser'
        : 'Notifiche non attivate', 'err');
      return;
    }
    const cfg = await leggiConfigurazionePush(false);
    if (!cfg || !cfg.attivo) { toast('Le notifiche non sono configurate sul server', 'err'); return; }
    const reg = await registrazionePush();
    if (!reg || !reg.pushManager) { toast('Questo browser non riceve notifiche', 'err'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (sub && !stessaChiaveVapid(sub, cfg.chiave_pubblica)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveVapidInByte(cfg.chiave_pubblica) });
    await salvaIscrizionePush(sub);
    nascondiInvitoPush();
    toast('✅ Notifiche attive su questo dispositivo', 'ok');
  } catch (e) {
    toast('Notifiche non attivate: ' + (e && e.message ? e.message : e), 'err');
  } finally {
    PUSH.occupato = false;
    disegnaBoxPush();
  }
}

async function spegniNotifichePush() {
  if (PUSH.occupato) return;
  PUSH.occupato = true;
  try {
    const reg = await registrazionePush();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const { error } = await db.rpc('togli_dispositivo_push', { p_endpoint: sub.endpoint, p_motivo: 'Spente dall\'utente' });
      if (error) { toast('Errore: ' + error.message, 'err'); return; }
      // l'iscrizione del browser si toglie solo se nessun altro utente l'usa qui
      const altri = utentiPushQui().filter(function(x) { return !ME || x !== ME.id; });
      if (!altri.length) { try { await sub.unsubscribe(); } catch (e) {} }
    }
    if (ME && ME.id) segnaUtentePushQui(ME.id, false);
    PUSH.mio = false;
    toast('Notifiche spente su questo dispositivo', 'ok');
  } finally {
    PUSH.occupato = false;
    disegnaBoxPush();
  }
}

// "Esci" (doLogout, js/01): il dispositivo non è più di chi esce.
async function scollegaDispositivoPush() {
  if (!PUSH.config || !PUSH.config.attivo || !pushSupportato()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
  if (sub) await db.rpc('togli_dispositivo_push', { p_endpoint: sub.endpoint, p_motivo: 'Uscita dal sito' });
}

// ── Invito al primo accesso ──────────────────────────────────────────
function invitoPushChiuso() {
  if (typeof ME === 'undefined' || !ME) return true;
  const t = Number(localStorage.getItem(CHIAVE_PUSH_INVITO + ME.id) || 0);
  return t && Date.now() - t < PUSH_INVITO_DI_NUOVO_MS;
}

function chiudiInvitoPush() {
  try { if (ME && ME.id) localStorage.setItem(CHIAVE_PUSH_INVITO + ME.id, String(Date.now())); } catch (e) {}
  nascondiInvitoPush();
}

function nascondiInvitoPush() {
  const el = ge('push-invito');
  if (el) el.style.display = 'none';
}

function mostraInvitoPush(tipo) {
  if (invitoPushChiuso()) return;
  let el = ge('push-invito');
  if (!el) {
    el = document.createElement('div');
    el.id = 'push-invito';
    el.className = 'push-invito';
    el.setAttribute('role', 'dialog');
    document.body.appendChild(el);
  }
  el.innerHTML = tipo === 'installa'
    ? '<div class="pin-testo"><b>📲 Installa l\'app sul telefono</b><br>Per ricevere subito gli avvisi urgenti (infortunio, cantiere fermo, ispezione…): tocca <b>Condividi</b> ⬆️ in Safari, poi <b>Aggiungi alla schermata Home</b>, e apri Toli Fire dall\'icona. Poi tocca 🔔 e <b>Attiva le notifiche</b>.</div>' +
      '<div class="pin-azioni"><button type="button" class="btn sm p" onclick="chiudiInvitoPush()">Ho capito</button></div>'
    : '<div class="pin-testo"><b>🔔 Avvisi urgenti sul telefono</b><br>Infortunio, cantiere fermo, ispezione… arrivano entro un minuto come notifica. Gli altri avvisi restano nella campanella e nel riepilogo delle 8:00.</div>' +
      '<div class="pin-azioni"><button type="button" class="btn sm p" onclick="attivaNotifichePush()">Attiva le notifiche</button>' +
      '<button type="button" class="btn sm" onclick="chiudiInvitoPush()">Non ora</button></div>';
  el.style.display = 'flex';
}

// ── Riquadro nella finestra Avvisi (js/58) ──────────────────────────
async function disegnaBoxPush() {
  const lista = ge('avv-elenco');
  if (!lista) return;
  let box = ge('avv-push');
  const cfg = await leggiConfigurazionePush(false);
  if (!cfg || cfg.mancante || (!cfg.attivo && ROLE !== 'titolare')) { if (box) box.style.display = 'none'; return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'avv-push';
    box.className = 'avv-push';
    const filtri = ge('avv-filtri');
    (filtri || lista).parentNode.insertBefore(box, filtri || lista);
  }
  box.style.display = '';
  let riga = '';
  if (!cfg.attivo) {
    riga = '<div><b>📱 Notifiche sul telefono:</b> non ancora configurate sul server. ' +
      'Mancano: ' + [cfg.push_attivo === false ? 'notifiche spente qui sotto' : '', cfg.pg_net ? '' : 'estensione pg_net',
        cfg.url_presente ? '' : 'indirizzo della Edge Function', cfg.segreto_presente ? '' : 'chiave condivisa',
        cfg.chiave_pubblica_presente ? '' : 'chiave pubblica VAPID'].filter(Boolean).join(', ') +
      ' (istruzioni in supabase/functions/avvisi-urgenti/LEGGIMI.md).</div>';
  } else if (!pushSupportato()) {
    riga = dispositivoIOS() && !appInstallata()
      ? '<div><b>📱 Notifiche sul telefono:</b> su iPhone arrivano solo dall\'app installata (da iOS 16.4): in Safari tocca <b>Condividi</b> ⬆️ → <b>Aggiungi alla schermata Home</b>, apri Toli Fire dall\'icona e torna qui.</div>'
      : '<div><b>📱 Notifiche sul telefono:</b> questo browser non le riceve. Gli avvisi urgenti ti arrivano comunque per email.</div>';
  } else if (Notification.permission === 'denied') {
    riga = '<div><b>📱 Notifiche sul telefono:</b> bloccate per questo sito. Riattivale dalle impostazioni del telefono o del browser (Notifiche → Toli Fire), poi ricarica.</div>';
  } else {
    let mio = false;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const { data } = await db.rpc('stato_dispositivo_push', { p_endpoint: sub.endpoint });
        mio = !!(data && data.mio);
      }
    } catch (e) {}
    PUSH.mio = mio;
    riga = mio
      ? '<div class="avv-push-riga"><span><b>📱 Notifiche:</b> ✅ attive su questo dispositivo. Gli avvisi urgenti arrivano qui e per email.</span>' +
        '<button type="button" class="btn sm" onclick="spegniNotifichePush()">Spegni</button></div>'
      : '<div class="avv-push-riga"><span><b>📱 Notifiche:</b> spente su questo dispositivo. Gli avvisi urgenti arrivano entro un minuto.</span>' +
        '<button type="button" class="btn sm p" onclick="attivaNotifichePush()">🔔 Attiva le notifiche</button></div>';
  }
  if (ROLE === 'titolare' && cfg.push_attivo !== undefined) riga += htmlImpostazioniPush(cfg);
  box.innerHTML = riga;
}

function htmlImpostazioniPush(cfg) {
  const ore = [6, 7, 8, 9, 10, 11, 12].map(function(h) {
    return '<option value="' + h + '"' + (Number(cfg.ora_riepilogo) === h ? ' selected' : '') + '>' + h + ':00</option>';
  }).join('');
  const spunta = function(id, val, testo) {
    return '<label><input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> ' + testo + '</label>';
  };
  const u = cfg.ultimo_invio;
  return '<details class="avv-push-imp"><summary>⚙️ Impostazioni degli invii (titolare)</summary>' +
    '<div class="avv-filtri" style="margin:8px 0">' +
      spunta('pushi-push', cfg.push_attivo, 'Notifiche sul telefono') +
      spunta('pushi-email', cfg.email_urgenti_attiva, 'Email degli urgenti') +
      spunta('pushi-tit', cfg.urgenti_anche_al_titolare, 'Urgenti anche al titolare') +
      spunta('pushi-riep', cfg.riepilogo_attivo, 'Riepilogo per email alle') +
      '<select id="pushi-ora" style="width:auto">' + ore + '</select>' +
      '<button type="button" class="btn sm p" onclick="salvaImpostazioniPush()">💾 Salva</button></div>' +
    '<div style="font-size:12px;color:var(--m)">Dispositivi accesi: ' + Number(cfg.dispositivi_attivi || 0) +
      (u ? ' · ultimo invio: ' + esc(u.canale) + ' ' + esc(u.esito) + ' il ' + esc(new Date(u.il).toLocaleString('it-IT')) +
        (u.errore ? ' (' + esc(u.errore) + ')' : '') : ' · nessun invio ancora') + '</div>' +
    (cfg.attivo
      ? '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
        '<button type="button" class="btn sm" onclick="provaUrgentePush()">🚨 Avviso urgente di prova a me</button>' +
        '<button type="button" class="btn sm" onclick="provaRiepilogoPush()">✉️ Riepilogo di prova a me</button></div>'
      : '') +
    '</details>';
}

async function salvaImpostazioniPush() {
  const { error } = await db.rpc('imposta_invio_avvisi', {
    p_push_attivo: ge('pushi-push').checked, p_email_urgenti: ge('pushi-email').checked,
    p_riepilogo: ge('pushi-riep').checked, p_ora_riepilogo: Number(ge('pushi-ora').value),
    p_anche_al_titolare: ge('pushi-tit').checked
  });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('Impostazioni degli invii salvate', 'ok');
  await leggiConfigurazionePush(true);
  disegnaBoxPush();
}

async function provaUrgentePush() {
  const ora = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const { data, error } = await db.rpc('crea_avviso_prova_urgente', {
    p_testo: 'Avviso urgente di prova delle ' + ora, p_destinatario_id: ME.id,
    p_destinatario_ruolo: null, p_rif_tabella: null, p_rif_id: null
  });
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast('🚨 Avviso urgente n. ' + data + ' creato: la notifica e l\'email arrivano entro un minuto', 'ok');
  if (typeof ricaricaDopoAzioneAvviso === 'function') await ricaricaDopoAzioneAvviso();
  setTimeout(function() { leggiConfigurazionePush(true).then(disegnaBoxPush); }, 15000);
}

async function provaRiepilogoPush() {
  const { data, error } = await db.rpc('prova_riepilogo_avvisi');
  if (error) { toast('Errore: ' + error.message, 'err'); return; }
  toast(data ? '✉️ Riepilogo chiesto: arriva alla tua email entro un minuto' : 'Riepilogo non partito: guarda "ultimo invio"', data ? 'ok' : 'err');
  setTimeout(function() { leggiConfigurazionePush(true).then(disegnaBoxPush); }, 15000);
}

// La finestra Avvisi (js/58) mostra il riquadro in cima.
(function() {
  if (typeof apriAvvisi !== 'function') return;
  const apriAvvisiPrimaPush = apriAvvisi;
  apriAvvisi = async function() {
    const r = await apriAvvisiPrimaPush.apply(this, arguments);
    disegnaBoxPush().catch(function() {});
    return r;
  };
})();

// Avviso di prova (js/58): spunta "Urgente" se le notifiche ci sono (sql/66).
(function() {
  if (typeof apriAvvisoProva !== 'function') return;
  const apriAvvisoProvaPrimaPush = apriAvvisoProva;
  apriAvvisoProva = function() {
    const r = apriAvvisoProvaPrimaPush.apply(this, arguments);
    leggiConfigurazionePush(false).then(function(cfg) {
      const esito = ge('avp-esito');
      if (!esito || !cfg || cfg.mancante) return;
      let riga = ge('avp-urgente-riga');
      if (!riga) {
        riga = document.createElement('label');
        riga.id = 'avp-urgente-riga';
        riga.style.cssText = 'display:flex;gap:8px;align-items:center;font-size:13px;font-weight:400;margin:4px 0 8px';
        riga.innerHTML = '<input type="checkbox" id="avp-urgente"> 🚨 Urgente: notifica sul telefono ed email subito (senza scadenza né risalita)';
        esito.closest('label').insertAdjacentElement('afterend', riga);
      }
      ge('avp-urgente').checked = false;
    });
    return r;
  };
})();

// Tocco sulla notifica con il gestionale già aperto (sw.js): apre l'avviso.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(e) {
    const d = e.data || {};
    if (d.tipo !== 'apri-avviso' || !d.avviso_id) return;
    if (typeof ROLE === 'undefined' || !ROLE || typeof apriRottaScheda !== 'function') {
      location.hash = '#/avviso/' + d.avviso_id;
      return;
    }
    apriRottaScheda({ tipo: 'rotta', oggetto: 'avviso', id: String(d.avviso_id), rotta: '/avviso/' + d.avviso_id }, {});
  });
}
