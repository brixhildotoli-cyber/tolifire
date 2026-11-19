// ── Mail del cliente nel progetto tecnico (19/11/2026, richiesta di Erika) ──
// Primo passo, prima del collegamento con Outlook (API di Microsoft 365, da
// preparare con chi amministra la posta e il via di Toli): il rappresentante
// del cliente (o il titolare) allega al progetto la mail della richiesta,
// trascinata da Outlook (.eml, anche .msg di Outlook per Windows). Da un .eml
// si leggono mittente, oggetto e data; per un .msg si propongono dal nome del
// file e si correggono a mano. La mail è un file del progetto come gli altri
// (bucket progetti-tecnici, riga in progetti_tecnici_allegati, js/56
// caricaFileNelProgetto) nella cartella mail/, con il nome
// "gg/mm/aaaa — Mittente — Oggetto.eml" e il tipo application/octet-stream
// (message/rfc822 il database non lo accetta). Nessun SQL.
// La regola "almeno un allegato" per l'invio all'ufficio tecnico non conta
// le mail (js/17, js/67: allegatiSenzaMail).
// Scheda del progetto (js/17 openProgettoDetail): sezione #pd-mail.

const CARTELLA_MAIL_PROGETTO = 'mail';
let mailProgettoAperto = null;   // progetto della scheda aperta
let mailDaAllegare = null;       // { file, estensione }

function eMailProgetto(allegato) {
  return !!allegato && /\/mail\/[^/]+$/.test(String(allegato.storage_path || ''));
}

function allegatiSenzaMail(allegati) {
  return (allegati || []).filter(function(a) { return !eMailProgetto(a); });
}

function puoAllegareMailProgetto(progetto) {
  if (!progetto) return false;
  if (ROLE === 'titolare') return true;
  return ROLE === 'rappresentante' && !!ME && progetto.rappresentante_id === ME.id;
}

// Parole codificate delle intestazioni (RFC 2047: =?utf-8?B?...?= e =?...?Q?...?=)
function decodificaParoleMail(testo) {
  return String(testo || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, function(_, cs, enc, txt) {
    try {
      let bytes;
      if (enc.toUpperCase() === 'B') {
        const bin = atob(txt);
        bytes = Uint8Array.from(bin, function(c) { return c.charCodeAt(0); });
      } else {
        const s = txt.replace(/_/g, ' ');
        const arr = [];
        for (let i = 0; i < s.length; i++) {
          if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { arr.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
          else arr.push(s.charCodeAt(i));
        }
        bytes = new Uint8Array(arr);
      }
      return new TextDecoder(cs.toLowerCase()).decode(bytes);
    } catch (e) {
      return txt;
    }
  });
}

// Mittente, oggetto e giorno (AAAA-MM-GG) da un file .eml; '' se mancano
async function leggiIntestazioneMail(file) {
  const testo = await file.slice(0, 65536).text();
  const fine = testo.search(/\r?\n\r?\n/);
  const testa = (fine > 0 ? testo.slice(0, fine) : testo).replace(/\r?\n[ \t]+/g, ' ');
  const campo = function(nome) {
    const m = testa.match(new RegExp('^' + nome + ':[ \\t]*(.*)$', 'im'));
    return m ? decodificaParoleMail(m[1]).replace(/\s+/g, ' ').trim() : '';
  };
  const data = campo('Date');
  const d = data ? new Date(data) : null;
  return {
    mittente: campo('From').replace(/^"([^"]*)"/, '$1'),
    oggetto: campo('Subject'),
    giorno: d && !isNaN(d) ? dataLocaleISO(d) : ''
  };
}

function nomeFileMail(giorno, mittente, oggetto, estensione) {
  const pulisci = function(s) { return String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  const da = String(mittente || '').replace(/<([^>]*)>/, '($1)');
  const parti = [giorno ? fd(giorno) : '', pulisci(da).slice(0, 70), pulisci(oggetto).slice(0, 90)].filter(Boolean);
  return '✉️ ' + (parti.join(' — ') || 'Mail del cliente') + '.' + estensione;
}

// ── Sezione nella scheda del progetto ─────────────────────────────────
async function caricaMailProgetto(progetto) {
  const box = ge('pd-mail');
  if (!box) return;
  mailProgettoAperto = progetto || null;
  if (!progetto) { box.innerHTML = ''; return; }
  const { data, error } = await db.from('progetti_tecnici_allegati')
    .select('id,nome_file,storage_path,caricato_il')
    .eq('progetto_id', progetto.id)
    .like('storage_path', '%/' + CARTELLA_MAIL_PROGETTO + '/%')
    .order('caricato_il', { ascending: false });
  if (mailProgettoAperto !== progetto) return;
  const puo = puoAllegareMailProgetto(progetto);
  const mail = error ? [] : (data || []).filter(eMailProgetto);
  if (!puo && !mail.length && !error) { box.innerHTML = ''; return; }
  const link = mail.length ? await firmaFileInBlocco('progetti-tecnici', mail.map(function(m) { return m.storage_path; }), 3600) : {};
  if (mailProgettoAperto !== progetto) return;
  box.innerHTML = '<div class="card" style="margin-top:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">' +
      '<div style="font-size:14px;font-weight:700">✉️ Mail del cliente</div>' +
      (puo ? '<button type="button" class="btn sm p" onclick="ge(\'pd-mail-file\').click()">✉️ Allega mail del cliente</button>' +
        '<input type="file" id="pd-mail-file" accept=".eml,.msg,message/rfc822,application/vnd.ms-outlook" style="display:none" onchange="sceltaMailProgetto(this)">' : '') +
    '</div>' +
    (error ? '<div class="al2 e">Mail non caricate: ' + esc(error.message) + '</div>'
      : (mail.length ? mail.map(function(m) {
        const url = link[m.storage_path];
        return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:0.5px solid var(--bo)">' +
          '<div style="font-size:13px;overflow-wrap:anywhere;min-width:0">' + esc(m.nome_file.replace(/\.(eml|msg)$/i, '')) + '</div>' +
          (url ? '<a class="btn sm" style="flex-shrink:0" href="' + esc(url) + '" target="_blank" rel="noopener" download="' + esc(m.nome_file.replace(/^✉️\s*/, '')) + '">⬇ Apri in Outlook</a>'
            : '<span style="font-size:12px;color:var(--r)">File non disponibile</span>') +
          '</div>';
      }).join('') : '<div style="font-size:12px;color:var(--m)">Nessuna mail allegata. Trascina la mail della richiesta da Outlook sul desktop (diventa un file .eml o .msg) e allegala qui.</div>')) +
    '</div>';
}

async function sceltaMailProgetto(input) {
  const file = input && input.files && input.files[0];
  if (input) input.value = '';
  if (!file || !mailProgettoAperto) return;
  const estensione = (String(file.name).match(/\.([a-z0-9]+)$/i) || [])[1];
  const est = String(estensione || '').toLowerCase();
  if (est !== 'eml' && est !== 'msg') { toast('Scegli il file della mail (.eml o .msg): trascina la mail da Outlook sul desktop', 'err'); return; }
  let dati = { mittente: '', oggetto: '', giorno: '' };
  if (est === 'eml') {
    try { dati = await leggiIntestazioneMail(file); } catch (e) { console.warn('Mail non letta:', e); }
  }
  if (!dati.oggetto) dati.oggetto = String(file.name).replace(/\.[^.]+$/, '');
  if (!dati.giorno && file.lastModified) dati.giorno = dataLocaleISO(new Date(file.lastModified));
  mailDaAllegare = { file: file, estensione: est };
  apriFinestraMailProgetto(dati, est === 'msg');
}

function apriFinestraMailProgetto(dati, daControllare) {
  let el = ge('m-mail-progetto');
  if (!el) {
    el = document.createElement('div');
    el.className = 'mbg';
    el.id = 'm-mail-progetto';
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="modal" style="max-width:480px">' +
    '<button class="x" onclick="closeM(\'m-mail-progetto\')">×</button>' +
    '<h3>✉️ Allega mail del cliente</h3>' +
    (daControllare ? '<div class="al2 i" style="margin-bottom:10px;font-size:12px">Dal file .msg il gestionale non legge il mittente: controlla i dati qui sotto.</div>' : '') +
    '<div class="f"><label>Da (mittente)</label><input type="text" id="mmp-mittente" maxlength="120" value="' + esc(dati.mittente) + '" placeholder="Es. Mario Rossi &lt;mario@cliente.it&gt;"></div>' +
    '<div class="f"><label>Oggetto</label><input type="text" id="mmp-oggetto" maxlength="200" value="' + esc(dati.oggetto) + '"></div>' +
    '<div class="f"><label>Ricevuta il</label><input type="date" id="mmp-giorno" value="' + esc(dati.giorno) + '"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button class="btn" onclick="closeM(\'m-mail-progetto\')">Annulla</button>' +
      '<button class="btn p" id="mmp-salva" onclick="salvaMailProgetto()">✉️ Allega al progetto</button>' +
    '</div></div>';
  openM('m-mail-progetto');
}

async function salvaMailProgetto() {
  const progetto = mailProgettoAperto, scelta = mailDaAllegare;
  if (!progetto || !scelta) return;
  if (!puoAllegareMailProgetto(progetto)) { toast('La mail la allega il rappresentante del cliente (o il titolare)', 'err'); return; }
  const btn = ge('mmp-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Caricamento…'; }
  const nome = nomeFileMail(v('mmp-giorno'), v('mmp-mittente'), v('mmp-oggetto'), scelta.estensione);
  const file = new File([scelta.file], nome, { type: 'application/octet-stream', lastModified: scelta.file.lastModified });
  const { data: auth } = await db.auth.getUser();
  const uid = auth && auth.user && auth.user.id;
  if (!uid) { toast('Sessione scaduta: rientra e riprova', 'err'); if (btn) { btn.disabled = false; btn.textContent = '✉️ Allega al progetto'; } return; }
  const r = await caricaFileNelProgetto(progetto.id, uid, file, Object.assign({ cartella: CARTELLA_MAIL_PROGETTO }, ME && ME.id !== uid ? { caricatoDa: ME.id } : {}));
  if (btn) { btn.disabled = false; btn.textContent = '✉️ Allega al progetto'; }
  if (!r.alleg) { toast(r.doppione ? 'Questa mail è già nel progetto' : (r.errore || 'Mail non allegata'), 'err'); return; }
  mailDaAllegare = null;
  closeM('m-mail-progetto');
  toast('Mail allegata al progetto ✓', 'ok');
  await caricaMailProgetto(progetto);
}
