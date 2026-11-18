// Caricare dopo 21-presidi-import.js e prima di 19-init.js. Form e scheda delle manichette.
function annoScadenzaManichetta(testo) {
  const valore = String(testo ?? '').trim();
  if (!valore) return null;
  if (!/^\d{4}$/.test(valore) || Number(valore) < 1900 || Number(valore) > 2200) {
    throw new Error('Anno di scadenza non valido: usa quattro cifre, per esempio 2031.');
  }
  return Number(valore);
}

// Sostituisce il contenuto del form e rimuove i contenitori duplicati.
const formManichette = [...document.querySelectorAll('[id="fm"]')];
if (formManichette.length) {
  const form = formManichette[0];
  formManichette.slice(1).forEach(el => el.remove());
  form.innerHTML = `
    <div class="fr">
      <div class="f"><label>Numero / ID manichetta *</label><input id="mm1" type="text" placeholder="Es. 1"></div>
      <div class="f"><label>Numero progressivo</label><input id="mm-progressivo" type="text"></div>
    </div>
    <div class="fr">
      <div class="f"><label>Tipo / modello</label><input id="mm2" type="text" placeholder="UNI 45"></div>
      <div class="f"><label>Marca</label><input id="mm-marca" type="text"></div>
    </div>
    <div class="f"><label>Ubicazione</label><input id="mm3" type="text" placeholder="Da compilare se non indicata nel documento"></div>
    <div class="fr"><div class="f"><label>Piano</label><input id="mm4"></div><div class="f"><label>Locale</label><input id="mm5"></div></div>
    <div class="fr">
      <div class="f"><label>Data effettiva della verifica</label><input id="mm6" type="date"></div>
      <input id="mm7" type="hidden">
    </div>
    <div class="fr">
      <div class="f"><label>Scadenza — data precisa, se nota</label><input id="mm8" type="date"></div>
      <div class="f"><label>Scadenza indicata solo come anno</label><input id="mm-anno" type="number" min="1900" max="2200" placeholder="Es. 2031"></div>
    </div>
  <div class="f">
  <label>Stato della manichetta</label>
  <select id="mm9">
    <option value="">Da verificare / non compilato</option>
    <option value="ok">✅ OK</option>
    <option value="anomalia">⚠️ Anomalia</option>
    <option value="scaduto">❌ Scaduta</option>
    <option value="fuori_servizio">🔴 Fuori servizio</option>
  </select>
</div>
   <div class="f">
  <label>Stato — anomalia o appunto del tecnico</label>
  <textarea
    id="mm-esito"
    rows="3"
    placeholder="Es. Cartellonistica mancante, lastra da sostituire..."
  ></textarea>
</div>
    <div class="f"><label>Controlli SI — una voce per riga</label><textarea id="mm-si"></textarea></div>
    <div class="f"><label>Controlli NO — una voce per riga</label><textarea id="mm-no"></textarea></div>
    <div class="f"><label>Controlli senza esito — una voce per riga</label><textarea id="mm-vuote"></textarea></div>
    <div class="f"><label>Note</label><textarea id="mm10"></textarea></div>
    <div class="f"><label>Documento di origine</label><input id="mm-fonte"></div>
  `;
}

const resetPFPrimaManichette = resetPF;
resetPF = function() {
  resetPFPrimaManichette();
  ['mm-progressivo','mm-marca','mm-anno','mm-esito','mm-si','mm-no','mm-vuote','mm-fonte'].forEach(id => { if (ge(id)) ge(id).value = ''; });
  if (ge('mm9')) ge('mm9').value = '';
  if (ge('mm2')) ge('mm2').value = 'UNI 45';
};
const editPPrimaManichette = editP;
editP = function(id) {
  editPPrimaManichette(id);
  const p = PA.find(r => r.id === id);
  if (!p || p.tipo !== 'manichetta') return;
  const righe = a => Array.isArray(a) ? a.join('\n') : '';
  const valori = {'mm-progressivo':p.numero_progressivo,'mm-marca':p.marca,
    'mm-anno':p.anno_scadenza,'mm-esito':p.esito_verifica,
    'mm-si':righe(p.voci_x_si),'mm-no':righe(p.voci_x_no),'mm-vuote':righe(p.voci_x_vuote),
    'mm-fonte':p.fonte_pdf,'mm9':p.stato,'mm2':p.modello};
  Object.entries(valori).forEach(([campo,valore]) => { ge(campo).value = valore ?? ''; });
};

const savePPrimaManichette = saveP;
let salvataggioManichetta = false;
saveP = async function() {
  if (v('mptp') !== 'manichetta') return savePPrimaManichette();
  if (salvataggioManichetta) return;
  const cliente = v('mpcl'), sede = v('mpsede'), numero = v('mm1').trim();
  if (!cliente || !sede || !numero) { toast('Seleziona cliente, sede e numero della manichetta.','err'); return; }
  const id = v('mpeid');
  const numeroAnno = v('mm8') ? Number(v('mm8').slice(0,4)) : null;
  try {
    const anno = annoScadenzaManichetta(v('mm-anno'));
    if (anno && numeroAnno && anno !== numeroAnno) throw new Error('Anno di scadenza e data precisa non coincidono.');
    salvataggioManichetta = true;
    const {data:sedeVerificata,error:erroreSede} = await db.from('sedi_cliente').select('id').eq('id',sede).eq('cliente_id',cliente).single();
    if (erroreSede || !sedeVerificata) throw new Error('La sede non appartiene al cliente selezionato.');
    const payload = {cliente_id:cliente,sede_id:sede,tipo:'manichetta',matricola:numero,
      numero_progressivo:v('mm-progressivo').trim() || null,modello:v('mm2').trim() || null,
      marca:v('mm-marca').trim() || null,ubicazione:v('mm3').trim() || null,
      piano:v('mm4').trim() || null,locale:v('mm5').trim() || null,
      data_ultimo_controllo:v('mm6') || null,data_prossimo_controllo:null,periodicita_mesi:null,
      data_scadenza_collaudo:v('mm8') || null,anno_scadenza:anno,
      stato:v('mm9') || null,esito_verifica:v('mm-esito').trim() || null,
      voci_x_si:listaControlliScheda(v('mm-si')),voci_x_no:listaControlliScheda(v('mm-no')),
      voci_x_vuote:listaControlliScheda(v('mm-vuote')),note:v('mm10').trim() || null,
      fonte_pdf:v('mm-fonte').trim() || null};
    // F10.2 — annata (anno di fabbricazione), solo con sql/41 (js/40)
    const annata = typeof datiAnnataPresidio === 'function' ? datiAnnataPresidio() : {};
    if (!annata) return;
    Object.assign(payload, annata);
    const query = id ? db.from('impianti').update(payload).eq('id',id) : db.from('impianti').insert(payload);
    const {data,error} = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('Nessuna manichetta salvata: verifica i permessi.');
    closeM('m-presidio');toast('Manichetta salvata.');
    await loadPresidi();
  } catch(e) { toast('Errore: '+e.message,'err'); }
  finally { salvataggioManichetta = false; }
};

const apriSchedaPresidioPrimaManichette = apriSchedaPresidio;
apriSchedaPresidio = async function(id) {
  await apriSchedaPresidioPrimaManichette(id);
  const p = PA.find(r => r.id === id);
  if (!p || p.tipo !== 'manichetta' || !ge('storico-presidio')) return;
  ge('storico-presidio').insertAdjacentHTML('beforebegin',`<div class="card">
    <b>Dati della manichetta</b>
    <div>Numero progressivo: ${esc(p.numero_progressivo || '—')}</div>
    <div>Scadenza indicata solo come anno: ${esc(p.anno_scadenza ?? 'Non indicata')}</div>
    <div>Stato registrato: ${esc(p.stato || 'Non compilato')}</div>
  </div>`);
};


// Import di manichette, naspi ed estintori: js/21-presidi-import.js (riordino del 18/11).
