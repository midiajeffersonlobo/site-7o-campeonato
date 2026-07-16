/* ==========================================================================
   gerar-pdf.js — preenche o template .docx com os dados do formulário,
   envia pra Supabase Edge Function (que fala com a CloudConvert) e
   disponibiliza o PDF final pra download.
   ========================================================================== */

// Depois de fazer o deploy da function (ver supabase/README.md), cole aqui
// a URL final, algo como: https://xxxxxxxxx.supabase.co/functions/v1/gerar-pdf
const SUPABASE_FUNCTION_URL = 'https://grwoatyylzbfsufzkeyx.supabase.co/functions/v1/gerar-pdf';

const DOCX_TEMPLATE_URL = 'assets/docx/oficio-template-v3.docx';
const POLL_INTERVAL_MS = 1500;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('fillForm');
  if (!form) return; // só existe na versão genérica

  /* ------------------------------------------------------------------------
     Dropdowns de dia / mês
     ------------------------------------------------------------------------ */
  (function populateDiaMes() {
    const diaSelect = form.querySelector('select[name="dia"]');
    const mesSelect = form.querySelector('select[name="mes"]');
    if (!diaSelect || !mesSelect) return;

    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement('option');
      opt.value = String(d).padStart(2, '0');
      opt.textContent = String(d).padStart(2, '0');
      diaSelect.appendChild(opt);
    }

    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
    ];
    meses.forEach((mes) => {
      const opt = document.createElement('option');
      opt.value = mes;
      opt.textContent = mes.charAt(0).toUpperCase() + mes.slice(1);
      mesSelect.appendChild(opt);
    });
  })();

  /* ------------------------------------------------------------------------
     Dropdowns customizados (visual harmônico com o site) para dia / mês.
     O <select> nativo continua no DOM (escondido visualmente, mas focável)
     pra manter validação/acessibilidade; o botão + lista abaixo são só a
     camada visual, sincronizada com o valor do select real.
     ------------------------------------------------------------------------ */
  (function initCustomSelects() {
    const wrappers = form.querySelectorAll('[data-fill-select]');

    wrappers.forEach((wrapper) => {
      const nativeSelect = wrapper.querySelector('.fill-select-native');
      const trigger = wrapper.querySelector('.fill-select-trigger');
      const triggerValue = wrapper.querySelector('.fill-select-value');
      const list = wrapper.querySelector('.fill-select-list');
      if (!nativeSelect || !trigger || !list) return;

      const placeholderText = triggerValue.textContent;

      function buildList() {
        list.innerHTML = '';
        Array.from(nativeSelect.options).forEach((opt) => {
          if (opt.disabled) return;
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.dataset.value = opt.value;
          li.textContent = opt.textContent;
          if (opt.value === nativeSelect.value) {
            li.classList.add('is-selected');
            li.setAttribute('aria-selected', 'true');
          }
          list.appendChild(li);
        });
      }

      function syncTrigger() {
        const selectedOption = nativeSelect.options[nativeSelect.selectedIndex];
        const hasValue = selectedOption && selectedOption.value !== '';
        triggerValue.textContent = hasValue ? selectedOption.textContent : placeholderText;
        triggerValue.classList.toggle('is-placeholder', !hasValue);
      }

      function closeList() {
        wrapper.classList.remove('is-open');
        list.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }

      function openList() {
        buildList();
        wrapper.classList.add('is-open');
        list.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        const active = list.querySelector('.is-selected') || list.firstElementChild;
        if (active) active.classList.add('is-active');
      }

      function selectValue(value) {
        nativeSelect.value = value;
        nativeSelect.classList.add('is-touched');
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        syncTrigger();
        closeList();
        trigger.focus();
      }

      trigger.addEventListener('click', () => {
        if (wrapper.classList.contains('is-open')) {
          closeList();
        } else {
          openList();
        }
      });

      list.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-value]');
        if (!li) return;
        selectValue(li.dataset.value);
      });

      trigger.addEventListener('keydown', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          if (!wrapper.classList.contains('is-open')) openList();
        }
        if (e.key === 'Escape') closeList();
        if (wrapper.classList.contains('is-open') && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
          const items = Array.from(list.children);
          const current = list.querySelector('.is-active');
          let idx = current ? items.indexOf(current) : -1;
          if (current) current.classList.remove('is-active');
          idx = e.key === 'ArrowDown'
            ? Math.min(idx + 1, items.length - 1)
            : Math.max(idx - 1, 0);
          const next = items[idx];
          if (next) {
            next.classList.add('is-active');
            next.scrollIntoView({ block: 'nearest' });
          }
        }
        if (wrapper.classList.contains('is-open') && (e.key === 'Enter' || e.key === ' ')) {
          const active = list.querySelector('.is-active');
          if (active) selectValue(active.dataset.value);
        }
      });

      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) closeList();
      });

      syncTrigger();
    });
  })();

  /* ------------------------------------------------------------------------
     ViaCEP — busca automática de endereço a partir do CEP
     ------------------------------------------------------------------------ */
  (function initViaCep() {
    const cepInput = document.getElementById('cepInput');
    const numeroInput = document.getElementById('numeroInput');
    const enderecoInput = document.getElementById('enderecoInput');
    const bairroInput = document.getElementById('bairroInput');
    const cidadeInput = document.getElementById('cidadeInput');
    const ufInput = document.getElementById('ufInput');
    const cepStatus = document.getElementById('cepStatus');
    if (!cepInput) return;

    let lastQueriedCep = null;
    let isFetching = false;

    function somenteNumeros(valor) {
      return valor.replace(/\D/g, '');
    }

    function formatarCep(valor) {
      const numeros = somenteNumeros(valor).slice(0, 8);
      if (numeros.length <= 5) return numeros;
      return `${numeros.slice(0, 5)}-${numeros.slice(5)}`;
    }

    function validarCep(numeros) {
      return numeros.length === 8;
    }

    function mostrarMensagemCep(mensagem, tipo) {
      cepStatus.textContent = mensagem;
      cepStatus.classList.remove('is-loading', 'is-success', 'is-error');
      if (tipo) cepStatus.classList.add(tipo);
    }

    function limparCamposDoEndereco() {
      [enderecoInput, bairroInput, cidadeInput, ufInput].forEach((input) => {
        input.value = '';
        input.disabled = true;
      });
    }

    function preencherEndereco(dados) {
      enderecoInput.value = dados.logradouro || '';
      bairroInput.value = dados.bairro || '';
      cidadeInput.value = dados.localidade || '';
      ufInput.value = dados.uf || '';
      [enderecoInput, bairroInput, cidadeInput, ufInput].forEach((input) => {
        input.disabled = false;
      });
    }

    async function consultarCep() {
      const numeros = somenteNumeros(cepInput.value);

      if (!validarCep(numeros)) {
        mostrarMensagemCep('Digite um CEP com 8 números.', 'is-error');
        return;
      }

      if (isFetching || numeros === lastQueriedCep) return;

      isFetching = true;
      lastQueriedCep = numeros;
      limparCamposDoEndereco();
      mostrarMensagemCep('Consultando CEP…', 'is-loading');

      try {
        const resposta = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
        if (!resposta.ok) throw new Error('http-error');

        const dados = await resposta.json();

        if (dados.erro) {
          mostrarMensagemCep('CEP não encontrado.', 'is-error');
          isFetching = false;
          return;
        }

        preencherEndereco(dados);
        mostrarMensagemCep('Endereço encontrado.', 'is-success');
        if (numeroInput) numeroInput.focus();
      } catch (err) {
        mostrarMensagemCep('Não foi possível consultar o CEP. Preencha o endereço manualmente.', 'is-error');
        [enderecoInput, bairroInput, cidadeInput, ufInput].forEach((input) => { input.disabled = false; });
      } finally {
        isFetching = false;
      }
    }

    cepInput.addEventListener('input', () => {
      const posicaoCursor = cepInput.selectionStart;
      const tamanhoAntes = cepInput.value.length;
      cepInput.value = formatarCep(cepInput.value);
      const diff = cepInput.value.length - tamanhoAntes;
      if (posicaoCursor !== null) {
        cepInput.selectionStart = cepInput.selectionEnd = posicaoCursor + diff;
      }

      const numeros = somenteNumeros(cepInput.value);
      if (numeros.length < 8) {
        if (lastQueriedCep !== null) {
          lastQueriedCep = null;
          limparCamposDoEndereco();
          mostrarMensagemCep('', null);
        }
        return;
      }
      if (numeros.length === 8) consultarCep();
    });

    cepInput.addEventListener('blur', () => {
      const numeros = somenteNumeros(cepInput.value);
      if (numeros.length > 0 && numeros.length < 8) {
        mostrarMensagemCep('Digite um CEP com 8 números.', 'is-error');
      }
    });

    cepInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        consultarCep();
      }
    });
  })();

  const progressModal = document.getElementById('progressModal');
  const progressRingFill = document.getElementById('progressRingFill');
  const progressPercent = document.getElementById('progressPercent');
  const progressLabel = document.getElementById('progressLabel');
  const progressError = document.getElementById('progressError');
  const progressCloseBtn = document.getElementById('progressCloseBtn');
  const progressKettlebellImg = document.querySelector('.progress-kettlebell img');

  const RADIUS = 44;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  progressRingFill.style.strokeDasharray = String(CIRCUMFERENCE);
  progressRingFill.style.strokeDashoffset = String(CIRCUMFERENCE);

  // Quanto mais perto de 100%, mais rápido o kettlebell quica:
  // 900ms parado/devagar em 0% até 250ms bem rápido em 100%.
  const BOUNCE_DURATION_MAX = 900;
  const BOUNCE_DURATION_MIN = 250;

  // Quicada com movimento aleatório: cada ciclo sorteia sua própria altura
  // e inclinação (dentro de faixas naturais), sempre voltando ao centro no
  // fim do ciclo, então nunca acumula rotação nem "cai" pra um lado.
  // Usa a Web Animations API (não CSS @keyframes) pra poder gerar valores
  // diferentes a cada rodada — e, de brinde, isso já ignora naturalmente
  // a preferência de "reduzir movimento" do sistema, o que é intencional
  // aqui: é um indicador de atividade, não uma animação decorativa.
  let currentBouncePercent = 0;
  let kettlebellStopped = false;

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function runKettlebellBounce() {
    if (!progressKettlebellImg || kettlebellStopped) return;

    const duration = BOUNCE_DURATION_MAX
      - ((BOUNCE_DURATION_MAX - BOUNCE_DURATION_MIN) * (currentBouncePercent / 100));

    const height = randomBetween(10, 18); // % de translateY
    const tilt = randomBetween(-9, 9); // graus, positivo ou negativo
    const tiltMid = tilt * randomBetween(0.5, 0.85); // leve inclinação já na subida

    const anim = progressKettlebellImg.animate(
      [
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: `translateY(-${(height * 0.55).toFixed(1)}%) rotate(${tiltMid.toFixed(1)}deg)` },
        { transform: `translateY(-${height.toFixed(1)}%) rotate(${tilt.toFixed(1)}deg)` },
        { transform: 'translateY(0) rotate(0deg)' },
      ],
      { duration: Math.round(duration), easing: 'ease-in-out' },
    );

    anim.onfinish = runKettlebellBounce;
  }

  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const offset = CIRCUMFERENCE * (1 - clamped / 100);
    progressRingFill.style.strokeDashoffset = String(offset);
    progressPercent.textContent = `${Math.round(clamped)}%`;
    currentBouncePercent = clamped;
  }

  function openProgressModal() {
    setProgress(0);
    progressLabel.textContent = 'Preparando documento…';
    progressError.classList.remove('is-visible');
    progressCloseBtn.style.display = 'none';
    progressModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    kettlebellStopped = false;
    runKettlebellBounce();
  }

  function closeProgressModal() {
    progressModal.classList.remove('is-open');
    document.body.style.overflow = '';
    kettlebellStopped = true;
  }

  function showProgressError(message) {
    progressLabel.textContent = 'Ocorreu um problema';
    progressError.textContent = message || 'Não foi possível gerar o PDF. Tente novamente.';
    progressError.classList.add('is-visible');
    progressCloseBtn.style.display = 'inline-flex';
  }

  progressCloseBtn.addEventListener('click', closeProgressModal);

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  async function fillDocxTemplate(data) {
    const templateRes = await fetch(DOCX_TEMPLATE_URL);
    if (!templateRes.ok) throw new Error('Não foi possível carregar o modelo do documento.');
    const templateBuffer = await templateRes.arrayBuffer();

    const zip = new PizZip(templateBuffer);
    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
    });

    doc.render(data);

    const out = doc.getZip().generate({
      type: 'arraybuffer',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    return out;
  }

  async function createConversionJob(fileBase64, filename) {
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', fileBase64, filename }),
    });
    const data = await res.json();
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || 'Falha ao iniciar a geração do PDF.');
    }
    return data.jobId;
  }

  function pollJobStatus(jobId) {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const res = await fetch(SUPABASE_FUNCTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status', jobId }),
          });
          const data = await res.json();

          if (data.status === 'error') {
            reject(new Error(data.message || 'Falha ao converter o documento.'));
            return;
          }

          if (data.status === 'finished') {
            setProgress(100);
            progressLabel.textContent = 'Documento pronto!';
            resolve(data);
            return;
          }

          setProgress(data.percent || 0);
          progressLabel.textContent = 'Gerando o PDF…';
          setTimeout(poll, POLL_INTERVAL_MS);
        } catch (err) {
          reject(err);
        }
      };
      poll();
    });
  }

  async function saveFile(blob, suggestedName) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        // Usuário cancelou o diálogo "Salvar como" — não faz nada além disso.
        if (err && err.name === 'AbortError') return;
        // Qualquer outro erro cai no fallback abaixo.
      }
    }

    // Fallback pra navegadores sem File System Access API (Firefox, Safari):
    // baixa direto pra pasta de downloads padrão.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const inputs = Array.from(form.querySelectorAll('input[required], select[required]'));
    let hasInvalid = false;
    inputs.forEach((input) => {
      input.classList.add('is-touched');
      if (!input.value.trim()) hasInvalid = true;
    });

    if (hasInvalid) {
      form.reportValidity();
      return;
    }

    const data = {};
    inputs.forEach((input) => { data[input.name] = input.value.trim(); });

    // fecha o modal de formulário (via o botão real, pra manter o estado
    // interno do main.js sincronizado) e abre o de progresso
    const fillModal = document.getElementById('modal-preencher');
    const fillModalCloseBtn = fillModal && fillModal.querySelector('[data-close-modal]');
    if (fillModalCloseBtn) fillModalCloseBtn.click();
    openProgressModal();

    try {
      progressLabel.textContent = 'Preenchendo o documento…';
      setProgress(5);
      const filledDocxBuffer = await fillDocxTemplate(data);
      const fileBase64 = arrayBufferToBase64(filledDocxBuffer);

      progressLabel.textContent = 'Enviando para conversão…';
      setProgress(10);
      const jobId = await createConversionJob(fileBase64, 'oficio-proposta-parceria.docx');

      const result = await pollJobStatus(jobId);

      progressLabel.textContent = 'Baixando PDF gerado…';
      const pdfRes = await fetch(result.downloadUrl);
      if (!pdfRes.ok) throw new Error('Não foi possível baixar o PDF gerado.');
      const pdfBlob = await pdfRes.blob();

      await saveFile(pdfBlob, result.filename || 'oficio-proposta-parceria.pdf');

      window.setTimeout(closeProgressModal, 900);
    } catch (err) {
      showProgressError(err && err.message ? err.message : String(err));
    }
  });
});
