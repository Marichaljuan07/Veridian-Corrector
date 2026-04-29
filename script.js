// script.js (v13.0 - El Compañero Reactivo)
document.addEventListener('DOMContentLoaded', () => {
    const ALE_API_URL = "http://127.0.0.1:5000/api/execute";
    const MODES = { correcciones: 'Corrección', sugerencias: 'Sugerencias', corregido: 'Texto Corregido' };
    const MAX_WORDS = 2000;

    const dom = {
        pulirBtn: document.getElementById('pulir-btn'),
        inputText: document.getElementById('input-text'),
        outputText: document.getElementById('output-text'),
        modeControlsWrapper: document.getElementById('mode-controls-wrapper'),
        tooltip: document.getElementById('tooltip'),
        clearInputBtn: document.getElementById('clear-input-btn'),
        clearOutputBtn: document.getElementById('clear-output-btn'),
        wordCounter: document.getElementById('word-counter'),
        charCounter: document.getElementById('char-counter'),
        startButton: document.getElementById('start-button'),
        introScreen: document.getElementById('intro-screen'),
        editorScreen: document.getElementById('editor-screen'),
        body: document.body,
        editorContainer: document.getElementById('editor-container'),
        focusView: document.getElementById('focus-view'),
        focusTitle: document.getElementById('focus-title'),
        focusContent: document.getElementById('focus-content'),
        focusCloseBtn: document.getElementById('focus-close-btn'),
        focusControlPanel: document.getElementById('focus-control-panel'),
        focusCopyBtn: document.getElementById('focus-copy-btn'),
        focusDownloadBtn: document.getElementById('focus-download-btn'),
        copyBtn: document.getElementById('copy-btn'),
        downloadBtn: document.getElementById('download-btn'),
    };

    let state = {
        originalText: '',
        apiResponse: null,
        changesState: {}, // 'pending', 'accepted', 'ignored'
        activeMode: null,
        isProcessing: false,
        currentTooltip: null,
        isFocusMode: false,
        dictionary: JSON.parse(localStorage.getItem('veridian_dictionary')) || []
    };

    // --- LÓGICA DE COPIAR Y DESCARGAR ---
    const copyToClipboard = async (text, button) => {
        if (!text || !button) return;
        const originalText = button.innerText;
        try {
            await navigator.clipboard.writeText(text);
            button.innerText = '¡Copiado!';
            button.classList.add('confirm');
            setTimeout(() => {
                button.innerText = originalText;
                button.classList.remove('confirm');
            }, 1500);
        } catch (err) {
            console.error('Error al copiar texto: ', err);
        }
    };

    const downloadAsTxt = (text, filename = 'veridian-texto-pulido.txt') => {
        if (!text) return;
        const blob = new Blob([text.replace(/<br>/g, "\n")], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleCopy = (e) => {
        const textToCopy = state.activeMode === 'corregido' ? state.apiResponse?.texto_corregido : dom.outputText.innerText;
        copyToClipboard(textToCopy, e.target);
    };

    const handleDownload = () => {
        const textToDownload = state.activeMode === 'corregido' ? state.apiResponse?.texto_corregido : dom.outputText.innerHTML;
        downloadAsTxt(textToDownload);
    };
    
    const handleFocusCopy = (e) => {
        const textToCopy = state.activeMode === 'corregido' ? state.apiResponse?.texto_corregido : dom.focusContent.innerText;
        copyToClipboard(textToCopy, e.target);
    };

    const handleFocusDownload = () => {
        const textToDownload = state.activeMode === 'corregido' ? state.apiResponse?.texto_corregido : dom.focusContent.innerHTML;
        downloadAsTxt(textToDownload);
    };

    // --- ASIGNACIÓN DE EVENTOS ---
    dom.copyBtn.addEventListener('click', handleCopy);
    dom.downloadBtn.addEventListener('click', handleDownload);
    dom.focusCopyBtn.addEventListener('click', handleFocusCopy);
    dom.focusDownloadBtn.addEventListener('click', handleFocusDownload);

    dom.inputText.addEventListener('input', () => {
        const text = dom.inputText.value;
        const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        dom.wordCounter.textContent = `${wordCount} / ${MAX_WORDS} palabras`;
        dom.charCounter.textContent = `${text.length} caracteres`;
        dom.pulirBtn.disabled = state.isProcessing || wordCount > MAX_WORDS || wordCount === 0;
    });
 
    function updateUI() {
        state.isProcessing ? dom.pulirBtn.classList.add('processing-dots') : dom.pulirBtn.classList.remove('processing-dots');
        dom.pulirBtn.textContent = state.isProcessing ? 'Puliendo...' : 'Pulir Texto';
        dom.pulirBtn.disabled = state.isProcessing || dom.inputText.value.trim() === '' || dom.inputText.value.trim().split(/\s+/).length > MAX_WORDS;

        const counts = { correcciones: '—', sugerencias: '—', corregido: '—' };

        if (state.apiResponse && !state.isProcessing) {
            // *** LÓGICA DE CONTADORES DINÁMICOS ***
            counts.correcciones = state.apiResponse.correcciones.filter(c => state.changesState[c.id] === 'pending').length;
            counts.sugerencias = state.apiResponse.sugerencias.filter(s => state.changesState[s.id] === 'pending').length;
            if (state.apiResponse.correcciones.length === 0) counts.correcciones = '—';
            if (state.apiResponse.sugerencias.length === 0) counts.sugerencias = '—';
            counts.corregido = state.apiResponse.texto_corregido ? '✓' : '—';
        }

        const panelHtml = Object.keys(MODES).map(modeKey => {
            const countClass = (modeKey === 'corregido' && counts[modeKey] === '✓') ? 'count-tick' : 'count';
            const countValue = counts[modeKey];
            const isDisabled = countValue === '—' || (typeof countValue === 'number' && state.apiResponse[modeKey].length === 0);
            return `<div class="mode-control" data-mode="${modeKey}" ${isDisabled ? 'disabled' : ''}><span class="label">${MODES[modeKey]}</span><div class="mode-button-wrapper"><div class="mode-btn-circle"></div><span class="${countClass}">${countValue}</span></div></div>`;
        }).join('');
        
        dom.modeControlsWrapper.innerHTML = panelHtml;
        if (dom.focusControlPanel) dom.focusControlPanel.innerHTML = panelHtml;

        document.querySelectorAll('.mode-control').forEach(btn => {
            const mode = btn.dataset.mode;
            btn.classList.toggle('active', mode === state.activeMode);
            if (!btn.dataset.listenerAdded) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (btn.hasAttribute('disabled')) return;
                    hideTooltip();
                    setActiveMode(state.activeMode === mode ? null : mode);
                });
                btn.dataset.listenerAdded = 'true';
            }
        });
        
        if (!state.isProcessing) renderOutputBox();
    }

    function setActiveMode(mode) {
        state.activeMode = mode;
        updateUI();
        renderOutputBox();
        if (state.isFocusMode) {
            const modeLabel = mode ? MODES[mode] : 'Resultados';
            dom.focusTitle.textContent = `Modo ${modeLabel}`;
        }
    }

    function renderOutputBox() {
        const targetElement = state.isFocusMode ? dom.focusContent : dom.outputText;
        if (!state.apiResponse || state.isProcessing) {
            if (state.isProcessing) return;
            targetElement.innerHTML = '<p style="color: #666;">Aquí aparecerá tu texto pulido...</p>';
            return;
        }
        if (!state.activeMode) {
            targetElement.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Análisis finalizado. Selecciona un modo.</p>';
            return;
        }

        let html = '';
        if (state.activeMode === 'corregido') {
            html = escapeHtml(state.apiResponse.texto_corregido);
        } else {
            const acceptedChanges = [...state.apiResponse.correcciones, ...state.apiResponse.sugerencias].filter(c => state.changesState[c.id] === 'accepted');
            const baseText = applyChanges(state.originalText, acceptedChanges);
            const pendingChanges = state.apiResponse[state.activeMode].filter(c => state.changesState[c.id] === 'pending');
            html = generateHtmlWithHighlights(baseText, pendingChanges);
        }
        targetElement.innerHTML = html.replace(/\n/g, '<br>');
        targetElement.querySelectorAll('.correction, .suggestion').forEach(span => {
            span.addEventListener('click', (event) => { event.stopPropagation(); showTooltip(span); });
        });
    }

    function generateHtmlWithHighlights(baseText, changes) {
        if (!changes || changes.length === 0) return escapeHtml(baseText);
        let lastIndex = 0;
        const parts = [];
        const sortedChanges = changes.map(change => ({ ...change, index: baseText.indexOf(change.original) })).filter(change => change.index !== -1).sort((a, b) => a.index - b.index);
        sortedChanges.forEach(change => {
            if (change.index >= lastIndex) {
                parts.push(escapeHtml(baseText.substring(lastIndex, change.index)));
                parts.push(`<span class="${change.type}" data-id="${change.id}">${escapeHtml(change.original)}</span>`);
                lastIndex = change.index + change.original.length;
            }
        });
        parts.push(escapeHtml(baseText.substring(lastIndex)));
        return parts.join('');
    }

    function applyChanges(text, changes) {
        let tempText = text;
        const sortedChanges = changes.map(c => ({ ...c, index: tempText.indexOf(c.original) })).filter(c => c.index !== -1).sort((a, b) => b.index - a.index);
        sortedChanges.forEach(change => {
            tempText = tempText.substring(0, change.index) + change.replacement + tempText.substring(change.index + change.original.length);
        });
        return tempText;
    }

    dom.tooltip.addEventListener('click', (e) => {
        e.stopPropagation();
        const button = e.target.closest('button');
        if (!button || !state.currentTooltip) return;
        const { change } = state.currentTooltip;
        if (button.classList.contains('accept-btn')) state.changesState[change.id] = 'accepted';
        if (button.classList.contains('ignore-btn')) state.changesState[change.id] = 'ignored';
        if (button.classList.contains('dict-btn')) {
            const word = change.original.toLowerCase();
            if (!state.dictionary.includes(word)) {
                state.dictionary.push(word);
                localStorage.setItem('veridian_dictionary', JSON.stringify(state.dictionary));
            }
            Object.keys(state.changesState).forEach(id => {
                const c = [...state.apiResponse.correcciones, ...state.apiResponse.sugerencias].find(ch => ch.id === id);
                if (c && c.original.toLowerCase() === word) state.changesState[id] = 'ignored';
            });
        }
        hideTooltip();
        // *** ACTUALIZACIÓN INSTANTÁNEA ***
        updateUI();
        renderOutputBox();
    });

    function showTooltip(span) {
        hideTooltip();
        const changeId = span.dataset.id;
        const allChanges = [...(state.apiResponse?.correcciones || []), ...(state.apiResponse?.sugerencias || [])];
        const change = allChanges.find(c => c.id === changeId);
        if (!change) return;
        state.currentTooltip = { change, span };
        const originalHTML = `<span class="original">${escapeHtml(change.original)}</span>`;
        const replacementHTML = `<strong class="replacement">${escapeHtml(change.replacement)}</strong>`;
        const explanationHTML = `<span class="explanation">${escapeHtml(change.reason)}</span>`;
        const buttonsHtml = `<button class="accept-btn">Aceptar</button>${change.type === 'correction' ? '<button class="dict-btn">Diccionario</button>' : ''}<button class="ignore-btn">Ignorar</button>`;
        dom.tooltip.innerHTML = `<div class="tooltip-content">${originalHTML} → ${replacementHTML}${explanationHTML}</div><div class="tooltip-actions">${buttonsHtml}</div>`;
        positionTooltip(dom.tooltip, span);
        dom.tooltip.classList.add('visible');
    }

    function hideTooltip() { if (state.currentTooltip) { dom.tooltip.classList.remove('visible'); state.currentTooltip = null; } }
    function positionTooltip(tooltip, target) { const rect = target.getBoundingClientRect(); let top = rect.bottom + 8, left = rect.left + rect.width / 2; tooltip.style.transform = 'translateX(-50%)'; if (left + (tooltip.offsetWidth / 2) > window.innerWidth - 10) left = window.innerWidth - (tooltip.offsetWidth / 2) - 10; if (left - (tooltip.offsetWidth / 2) < 10) left = (tooltip.offsetWidth / 2) + 10; if (top + tooltip.offsetHeight > window.innerHeight - 10) top = rect.top - tooltip.offsetHeight - 8; tooltip.style.left = `${left}px`; tooltip.style.top = `${top}px`; }
    function escapeHtml(unsafe) { return unsafe ? unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : ""; }

    dom.startButton.addEventListener('click', () => { dom.introScreen.classList.add('hidden'); dom.editorScreen.classList.remove('hidden'); });
    dom.clearInputBtn.addEventListener('click', () => { dom.inputText.value = ''; dom.inputText.dispatchEvent(new Event('input')); });
    dom.clearOutputBtn.addEventListener('click', () => { state.originalText = ''; state.apiResponse = null; state.changesState = {}; state.activeMode = null; updateUI(); dom.outputText.innerHTML = '<p style="color: #666;">Aquí aparecerá tu texto pulido...</p>'; });
    document.addEventListener('click', (e) => { if (state.currentTooltip && !dom.tooltip.contains(e.target) && !e.target.closest('.correction, .suggestion')) hideTooltip(); });
    
    function enterFocusMode(source) {
        state.isFocusMode = true;
        dom.body.classList.add('focus-mode');
        if (source === 'input') {
            dom.focusTitle.textContent = 'Editor de Entrada';
            dom.focusContent.innerHTML = escapeHtml(dom.inputText.value).replace(/\n/g, '<br>');
            dom.focusControlPanel.style.display = 'none';
            dom.focusCopyBtn.style.display = 'none';
            dom.focusDownloadBtn.style.display = 'none';
        } else {
            const modeLabel = state.activeMode ? MODES[state.activeMode] : 'Resultados';
            dom.focusTitle.textContent = `Modo ${modeLabel}`;
            dom.focusControlPanel.style.display = 'flex';
            dom.focusCopyBtn.style.display = 'inline-flex';
            dom.focusDownloadBtn.style.display = 'inline-flex';
            renderOutputBox();
        }
    }
    [dom.inputText, dom.outputText].forEach(box => box.addEventListener('dblclick', () => { if (dom.outputText.innerText.trim() !== 'Aquí aparecerá tu texto pulido...') enterFocusMode(box === dom.inputText ? 'input' : 'output'); }));
    dom.focusCloseBtn.addEventListener('click', () => { state.isFocusMode = false; dom.body.classList.remove('focus-mode'); renderOutputBox(); });

    function createStarryBackground(count, size) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1000; canvas.height = 1000;
        for (let i = 0; i < count; i++) {
            const x = Math.random() * canvas.width, y = Math.random() * canvas.height, opacity = Math.random() * 0.7 + 0.3;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
        }
        return canvas.toDataURL();
    }
    if (dom.introScreen) {
        dom.introScreen.querySelector('#stars-far').style.backgroundImage = `url(${createStarryBackground(300, 0.8)})`;
        dom.introScreen.querySelector('#stars-near').style.backgroundImage = `url(${createStarryBackground(20, 1.2)})`;
    }


    // --- BOTÓN PULIR: llamada al backend con manejo de errores ---
    dom.pulirBtn.addEventListener('click', async () => {
        const texto = dom.inputText.value.trim();
        if (!texto) return;

        state.isProcessing = true;
        state.apiResponse = null;
        state.changesState = {};
        state.activeMode = null;
        state.originalText = texto;
        updateUI();
        dom.outputText.innerHTML = '<p style="color: #888; text-align:center; padding:20px;">Analizando texto...</p>';

        try {
            const response = await fetch(ALE_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: texto })
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Error del servidor (' + response.status + ')');
            }

            const data = await response.json();

            [...(data.correcciones || []), ...(data.sugerencias || [])].forEach(c => {
                state.changesState[c.id] = 'pending';
            });

            state.apiResponse = data;

            if (data.correcciones && data.correcciones.length > 0) {
                state.activeMode = 'correcciones';
            } else if (data.sugerencias && data.sugerencias.length > 0) {
                state.activeMode = 'sugerencias';
            } else if (data.texto_corregido) {
                state.activeMode = 'corregido';
            }

        } catch (error) {
            let mensaje = error.message;
            if (mensaje.includes('fetch') || mensaje.includes('Failed') || mensaje.includes('NetworkError')) {
                mensaje = 'No se pudo conectar al servidor. ¿Está corriendo server.py en Pydroid?';
            }
            dom.outputText.innerHTML = '<p style="color: var(--red-accent); padding: 20px;">⚠️ ' + mensaje + '</p>';
            state.isProcessing = false;
            updateUI();
            return;
        }

        state.isProcessing = false;
        updateUI();
        renderOutputBox();
    });

    dom.inputText.dispatchEvent(new Event('input'));
    updateUI();
});
