// ── Richiesta del cliente dal sito (lead) sul cliente e nel progetto ──────
// Richiesta di Erika del 20/11: "nella lista clienti quando viene creato il
// progetto tecnico esce direttamente l'email del cliente e la richiesta".
// Solo sito, nessun SQL: le richieste arrivate dal modulo del sito
// (lead_sito, collegate al cliente con cliente_id) con data, servizio,
// messaggio, email e telefono, più l'email del cliente (referente e PEC):
//   - scheda del cliente (#cd-richieste-sito, js/09 chiama caricaRichiesteSitoCliente);
//   - finestra "Nuovo progetto tecnico" (#mp-richiesta-cliente, js/17), con
//     "↳ Copia nella descrizione tecnica";
//   - scheda del progetto (#pd-richiesta-sito, js/17).
// Le legge chi può leggere i lead (RLS di oggi: titolare e il rappresentante a
// cui il lead è assegnato); per gli altri ruoli si vede solo l'email del cliente.

async function leggiRichiesteSitoCliente(clienteId) {
  if (!clienteId) return { cliente: null, richieste: [] };
  const [rc, rl] = await Promise.all([
    db.from('clienti').select('ragione_sociale, referente_nome, referente_email, referente_telefono, pec').eq('id', clienteId).maybeSingle(),
    db.from('lead_sito').select('id, codice, creato_il, nome, azienda, email, telefono, servizio_richiesto, messaggio')
      .eq('cliente_id', clienteId).order('creato_il', { ascending: false }).limit(20)
  ]);
  // 26/11 (js/120): testo delle mail allegate ai progetti del cliente
  let mail = [];
  if (typeof mailDeiProgettiCliente === 'function') { try { mail = await mailDeiProgettiCliente(clienteId); } catch (e) { console.warn('Mail del cliente:', e); } }
  return { cliente: rc && !rc.error ? rc.data : null, richieste: rl && !rl.error ? (rl.data || []) : [], mail: mail };
}

let richiesteSitoAperte = [];

function htmlRichiesteSito(dati, opz) {
  opz = opz || {};
  const c = dati.cliente || {};
  const email = [c.referente_email, c.pec].filter(function(x) { return String(x || '').trim(); });
  const r = dati.richieste || [];
  const mail = dati.mail || [];
  if (!email.length && !r.length && !mail.length) return '';
  richiesteSitoAperte = r;
  return '<div class="card" style="margin-top:' + (opz.margine || '12px') + ';font-size:13px">' +
    '<div style="font-size:14px;font-weight:700;margin-bottom:4px">📨 Email e richieste del cliente</div>' +
    (email.length ? '<div>✉️ ' + email.map(function(e) { return '<a href="mailto:' + esc(e) + '">' + esc(e) + '</a>'; }).join(' · ') +
      (c.referente_nome ? ' <span style="color:var(--m)">(' + esc(c.referente_nome) + ')</span>' : '') + '</div>' : '') +
    (r.length ? r.map(function(l, i) {
      return '<div style="padding:8px 0 0;margin-top:6px;border-top:0.5px solid var(--bo)">' +
        '<div style="font-size:12px;color:var(--m)">Richiesta dal sito del ' + esc(fd(String(l.creato_il).slice(0, 10))) + (l.codice ? ' · ' + esc(l.codice) : '') +
          (l.servizio_richiesto ? ' · ' + esc(l.servizio_richiesto) : '') + '</div>' +
        (l.messaggio ? '<div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px">' + esc(l.messaggio) + '</div>' : '<div style="color:var(--m)">(nessun messaggio)</div>') +
        '<div style="font-size:12px;color:var(--m);margin-top:2px">' + [l.nome, l.azienda, l.email, l.telefono].filter(Boolean).map(esc).join(' · ') + '</div>' +
        (opz.copia && l.messaggio ? '<button type="button" class="btn sm" style="margin-top:4px" data-i="' + i + '" onclick="copiaRichiestaInDescrizione(this.dataset.i)">↳ Copia nella descrizione tecnica</button>' : '') +
      '</div>';
    }).join('') : '') +
    (mail.length && typeof htmlMailClienteTesto === 'function' ? htmlMailClienteTesto(mail, opz) : '') +
    (!r.length && !mail.length ? '<div style="font-size:12px;color:var(--m);margin-top:4px">Nessuna mail del cliente: trascina la mail della richiesta da Outlook nel progetto (riquadro «✉️ Mail del cliente») e qui compare il testo.</div>' : '') +
    '</div>';
}

async function caricaRichiesteSitoCliente(clienteId, idBox, opz) {
  const box = ge(idBox);
  if (!box) return;
  box.innerHTML = '';
  box.dataset.cliente = clienteId || '';
  if (!clienteId) return;
  let dati;
  try { dati = await leggiRichiesteSitoCliente(clienteId); } catch (e) { console.warn('Richieste del cliente:', e); return; }
  if (box.dataset.cliente !== clienteId) return;
  box.innerHTML = htmlRichiesteSito(dati, opz);
}

function copiaRichiestaInDescrizione(i) {
  const l = richiesteSitoAperte[Number(i)];
  const campo = ge('mp-descrizione');
  if (!l || !campo) return;
  const testo = 'Richiesta del cliente (sito, ' + fd(String(l.creato_il).slice(0, 10)) + '): ' + (l.messaggio || '');
  campo.value = campo.value.trim() ? campo.value.trim() + '\n\n' + testo : testo;
  campo.dispatchEvent(new Event('input'));
  toast('Richiesta copiata nella descrizione tecnica ✓', 'ok');
}
