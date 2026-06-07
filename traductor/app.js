// Main Application Controller for Bilingüe
document.addEventListener("DOMContentLoaded", () => {
  // --- State Variables ---
  let isOfflineMode = false;
  let history = JSON.parse(localStorage.getItem("bilingue_history")) || [];
  let currentTranslation = null; // Holds the current active translation state
  let speechSynth = window.speechSynthesis;
  let speechRecog = null;
  let isListening = false;
  let translationTimeout = null;

  // Initialize Offline Engine
  const offlineEngine = new OfflineEngine();

  // --- DOM Elements ---
  const sourceText = document.getElementById("source-text");
  const translatedText = document.getElementById("translated-text");
  const sourceLangSelect = document.getElementById("source-lang-select");
  const targetLangSelect = document.getElementById("target-lang-select");
  const swapLangBtn = document.getElementById("swap-lang-btn");
  
  const charCounter = document.getElementById("char-counter");
  const clearTextBtn = document.getElementById("clear-text-btn");
  const voiceInputBtn = document.getElementById("voice-input-btn");
  const speechSourceBtn = document.getElementById("speech-source-btn");
  const speechTargetBtn = document.getElementById("speech-target-btn");
  const copyTextBtn = document.getElementById("copy-text-btn");
  const favoriteBtn = document.getElementById("favorite-btn");
  
  const offlineDetailPanel = document.getElementById("offline-detail-panel");
  const wordPillsContainer = document.getElementById("word-pills-container");
  const wordCardDetail = document.getElementById("word-card-detail");
  const detailWordTitle = document.getElementById("detail-word-title");
  const detailWordDefinition = document.getElementById("detail-word-definition");
  const detailWordPos = document.getElementById("detail-word-pos");

  const connectionStatus = document.getElementById("connection-status");
  const connectionStatusText = document.getElementById("connection-status-text");
  const offlineSimulator = document.getElementById("offline-simulator");
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");

  const historyList = document.getElementById("history-list");
  const historySearchInput = document.getElementById("history-search-input");
  const clearHistoryBtn = document.getElementById("clear-history-btn");

  const openExplorerBtn = document.getElementById("open-explorer-btn");
  const closeExplorerBtn = document.getElementById("close-explorer-btn");
  const explorerModal = document.getElementById("explorer-modal");
  const explorerSearchInput = document.getElementById("explorer-search-input");
  const explorerResults = document.getElementById("explorer-results");

  const toastNotification = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");

  const dailyWordEn = document.getElementById("daily-word-en");
  const dailyWordEs = document.getElementById("daily-word-es");
  const dailyWordPos = document.getElementById("daily-word-pos");
  const dailyWordExample = document.getElementById("daily-word-example");

  const sourceLangTitle = document.getElementById("source-lang-title");
  const targetLangTitle = document.getElementById("target-lang-title");

  // --- Initial Setup ---
  initTheme();
  updateConnectionState();
  initSpeechRecognition();
  loadWordOfTheDay();
  renderHistory();

  // --- Event Listeners ---
  window.addEventListener("online", updateConnectionState);
  window.addEventListener("offline", updateConnectionState);
  offlineSimulator.addEventListener("change", updateConnectionState);

  sourceText.addEventListener("input", () => {
    const length = sourceText.value.length;
    charCounter.textContent = `${length} / 5000`;
    
    // Clear check
    if (length === 0) {
      clearTranslation();
      return;
    }

    // Debounce translation calls
    clearTimeout(translationTimeout);
    translationTimeout = setTimeout(performTranslation, 400);
  });

  clearTextBtn.addEventListener("click", () => {
    sourceText.value = "";
    charCounter.textContent = "0 / 5000";
    clearTranslation();
    sourceText.focus();
  });

  sourceLangSelect.addEventListener("change", () => {
    updateLangLabels();
    performTranslation();
  });
  
  targetLangSelect.addEventListener("change", () => {
    updateLangLabels();
    performTranslation();
  });

  swapLangBtn.addEventListener("click", () => {
    const srcVal = sourceLangSelect.value;
    sourceLangSelect.value = targetLangSelect.value;
    targetLangSelect.value = srcVal;
    
    updateLangLabels();
    
    // Swap contents if available
    const srcText = sourceText.value;
    const tgtText = translatedText.classList.contains("empty") ? "" : translatedText.textContent.trim();
    
    if (tgtText && !tgtText.startsWith("[No translation")) {
      sourceText.value = tgtText;
      charCounter.textContent = `${tgtText.length} / 5000`;
      performTranslation();
    } else if (srcText) {
      performTranslation();
    }
  });

  themeToggle.addEventListener("click", toggleTheme);

  // Buttons inside panels
  copyTextBtn.addEventListener("click", copyTranslation);
  speechSourceBtn.addEventListener("click", () => speakText(sourceText.value, sourceLangSelect.value));
  speechTargetBtn.addEventListener("click", () => {
    if (!translatedText.classList.contains("empty")) {
      speakText(translatedText.textContent, targetLangSelect.value);
    }
  });

  favoriteBtn.addEventListener("click", toggleFavoriteCurrent);

  // History Event Listeners
  historySearchInput.addEventListener("input", renderHistory);
  clearHistoryBtn.addEventListener("click", clearHistory);

  // Dictionary Explorer Modal
  openExplorerBtn.addEventListener("click", () => {
    explorerModal.style.display = "flex";
    explorerSearchInput.focus();
    performExplorerSearch();
  });

  closeExplorerBtn.addEventListener("click", () => {
    explorerModal.style.display = "none";
    explorerSearchInput.value = "";
  });

  // Close explorer if click outside content
  explorerModal.addEventListener("click", (e) => {
    if (e.target === explorerModal) {
      explorerModal.style.display = "none";
      explorerSearchInput.value = "";
    }
  });

  explorerSearchInput.addEventListener("input", performExplorerSearch);

  // --- Translation Core Logic ---

  async function performTranslation() {
    const text = sourceText.value.trim();
    if (!text) {
      clearTranslation();
      return;
    }

    const sourceLang = sourceLangSelect.value;
    const targetLang = targetLangSelect.value;

    // Prevent matching source and target
    if (sourceLang === targetLang) {
      translatedText.textContent = text;
      translatedText.classList.remove("empty");
      offlineDetailPanel.style.display = "none";
      return;
    }

    setLoadingState(true);

    if (isOfflineMode) {
      // Direct offline translation
      translateOffline(text, sourceLang, targetLang);
    } else {
      // Attempt online translation
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("API Network issue");
        
        const data = await response.json();
        if (data.responseStatus !== 200) {
          // MyMemory specific error (e.g. rate limit), fall back to offline
          console.warn("MyMemory API status error, falling back to offline", data.responseDetails);
          translateOffline(text, sourceLang, targetLang, true);
        } else {
          const translation = data.responseData.translatedText;
          setTranslationResult(text, translation, false, []);
        }
      } catch (err) {
        console.warn("Online translation failed, falling back to offline", err);
        translateOffline(text, sourceLang, targetLang, true);
      }
    }
  }

  function translateOffline(text, sourceLang, targetLang, isFallback = false) {
    const res = offlineEngine.translate(text, sourceLang, targetLang);
    
    // Add fallback visual indicator to user
    let finalTranslation = res.translatedText;
    if (isFallback && !finalTranslation.startsWith("[No translation")) {
      showToast("Conexión perdida. Usando motor offline.");
    }
    
    setTranslationResult(text, finalTranslation, true, res.wordDetails);
  }

  function setTranslationResult(source, target, isOfflineResult, wordDetails) {
    setLoadingState(false);
    
    translatedText.textContent = target;
    translatedText.classList.remove("empty");

    // Populate current translation model
    currentTranslation = {
      id: Date.now(),
      sourceText: source,
      translatedText: target,
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value,
      isOffline: isOfflineResult,
      isFavorite: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Update Favorites button visually based on if it matches a favorite in history
    const match = history.find(h => h.sourceText.toLowerCase() === source.toLowerCase() && h.sourceLang === currentTranslation.sourceLang);
    if (match && match.isFavorite) {
      currentTranslation.isFavorite = true;
      favoriteBtn.classList.add("active");
      favoriteBtn.querySelector("i").className = "bx bxs-star";
    } else {
      favoriteBtn.classList.remove("active");
      favoriteBtn.querySelector("i").className = "bx bx-star";
    }

    // Process offline breakdown displays
    if (isOfflineResult && wordDetails && wordDetails.length > 0) {
      renderOfflineBreakdown(wordDetails);
    } else {
      offlineDetailPanel.style.display = "none";
    }

    // Auto-save to history (debounced or completed translations)
    saveToHistory(currentTranslation);
  }

  function clearTranslation() {
    translatedText.textContent = "La traducción aparecerá aquí...";
    translatedText.classList.add("empty");
    offlineDetailPanel.style.display = "none";
    currentTranslation = null;
    favoriteBtn.classList.remove("active");
    favoriteBtn.querySelector("i").className = "bx bx-star";
    setLoadingState(false);
  }

  function setLoadingState(isLoading) {
    if (isLoading) {
      translatedText.innerHTML = `<div style="display:flex;align-items:center;gap:0.5rem;color:var(--text-muted);">
        <i class="bx bx-loader-alt bx-spin" style="font-size:1.5rem;color:var(--primary);"></i> Translating...
      </div>`;
    }
  }

  // --- Rendering UI Panels ---

  function renderOfflineBreakdown(details) {
    wordPillsContainer.innerHTML = "";
    
    // Filter out unknown words to keep clean
    const knownDetails = details.filter(d => d.pos !== 'unknown');

    if (knownDetails.length === 0) {
      offlineDetailPanel.style.display = "none";
      return;
    }

    offlineDetailPanel.style.display = "flex";
    wordCardDetail.style.display = "none";

    knownDetails.forEach((detail, index) => {
      const pill = document.createElement("button");
      pill.className = "word-pill";
      pill.innerHTML = `${detail.source} <span class="pill-pos">${translatePOS(detail.pos)}</span>`;
      
      pill.addEventListener("click", () => {
        // Remove active class from all pills
        document.querySelectorAll(".word-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        
        // Populate and display details card
        detailWordTitle.innerHTML = `<i class="bx bx-book"></i> ${detail.source}`;
        
        let desc = `<strong>Traducción:</strong> ${detail.target}`;
        if (detail.alternatives) {
          desc += `<br><span style="font-size:0.85rem;color:var(--text-secondary);"><strong>Alternativas en Inglés:</strong> ${detail.alternatives}</span>`;
        }
        if (detail.allTranslations) {
          desc += `<br><span style="font-size:0.85rem;color:var(--text-secondary);"><strong>Traducciones completas:</strong> ${detail.allTranslations}</span>`;
        }
        
        detailWordDefinition.innerHTML = desc;
        detailWordPos.textContent = translatePOS(detail.pos);
        
        wordCardDetail.style.display = "block";
      });

      wordPillsContainer.appendChild(pill);

      // Auto-trigger click on the first pill to show details
      if (index === 0) {
        pill.click();
      }
    });
  }

  function translatePOS(pos) {
    const posMap = {
      'noun': 'sustantivo',
      'verb': 'verbo',
      'adjective': 'adjetivo',
      'adverb': 'adverbio',
      'pronoun': 'pronombre',
      'preposition': 'preposición',
      'conjunction': 'conjunción',
      'determiner': 'determinante',
      'article': 'artículo',
      'phrase': 'frase'
    };
    return posMap[pos] || pos;
  }

  function updateLangLabels() {
    const srcLang = sourceLangSelect.value;
    const tgtLang = targetLangSelect.value;

    sourceLangTitle.innerHTML = `<i class="bx bx-text"></i> ${srcLang === 'en' ? 'Inglés' : 'Español'}`;
    targetLangTitle.innerHTML = `<i class="bx bx-globe"></i> ${tgtLang === 'es' ? 'Español' : 'Inglés'}`;
    
    // Set appropriate placeholder
    if (srcLang === 'en') {
      sourceText.placeholder = "Escribe algo aquí para traducir...";
    } else {
      sourceText.placeholder = "Type something here to translate...";
    }
  }

  // --- Speech (Voice synthesis / recognition) ---

  function speakText(text, langCode) {
    if (!text || !speechSynth) return;

    // Stop speaking if already speaking
    if (speechSynth.speaking) {
      speechSynth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice language matching
    if (langCode === "en") {
      utterance.lang = "en-US";
    } else {
      utterance.lang = "es-ES";
    }

    // Try to find a premium native speaker voice if possible
    const voices = speechSynth.getVoices();
    const matchedVoice = voices.find(v => v.lang.startsWith(utterance.lang));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }

    speechSynth.speak(utterance);
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceInputBtn.style.display = "none";
      return;
    }

    speechRecog = new SpeechRecognition();
    speechRecog.continuous = false;
    speechRecog.interimResults = false;

    speechRecog.onstart = () => {
      isListening = true;
      voiceInputBtn.classList.add("active");
      voiceInputBtn.querySelector("i").className = "bx bx-loader-alt bx-spin";
      showToast("Escuchando...");
    };

    speechRecog.onend = () => {
      isListening = false;
      voiceInputBtn.classList.remove("active");
      voiceInputBtn.querySelector("i").className = "bx bx-microphone";
    };

    speechRecog.onerror = (e) => {
      console.error(e);
      showToast("Fallo de audio: " + e.error);
      isListening = false;
      voiceInputBtn.classList.remove("active");
      voiceInputBtn.querySelector("i").className = "bx bx-microphone";
    };

    speechRecog.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      sourceText.value = transcript;
      charCounter.textContent = `${transcript.length} / 5000`;
      performTranslation();
    };

    voiceInputBtn.addEventListener("click", () => {
      if (isListening) {
        speechRecog.stop();
      } else {
        // Set speech recognition language based on source select
        speechRecog.lang = sourceLangSelect.value === 'en' ? 'en-US' : 'es-ES';
        speechRecog.start();
      }
    });
  }

  // --- Copy to Clipboard & Toast ---

  function copyTranslation() {
    if (translatedText.classList.contains("empty")) return;
    const text = translatedText.textContent.trim();
    
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast("Traducción copiada al portapapeles");
      })
      .catch(err => {
        console.error("Fallo al copiar", err);
      });
  }

  function showToast(message) {
    toastMessage.textContent = message;
    toastNotification.classList.add("show");
    
    setTimeout(() => {
      toastNotification.classList.remove("show");
    }, 2500);
  }

  // --- Connection Status Management ---

  function updateConnectionState() {
    const localSimOffline = offlineSimulator.checked;
    const systemOnline = navigator.onLine;

    // The app operates offline if simulated offline OR if browser indicates offline
    isOfflineMode = localSimOffline || !systemOnline;

    if (isOfflineMode) {
      connectionStatus.className = "status-badge offline";
      connectionStatusText.textContent = "Offline";
    } else {
      connectionStatus.className = "status-badge online";
      connectionStatusText.textContent = "Online";
    }

    // Re-run current translation under new network rules if text exists
    if (sourceText.value.trim()) {
      performTranslation();
    }
  }

  // --- Theme Mode Logic ---

  function initTheme() {
    const savedTheme = localStorage.getItem("bilingue_theme") || "dark";
    if (savedTheme === "light") {
      document.body.classList.add("light-mode");
      themeIcon.className = "bx bx-moon";
    } else {
      document.body.classList.remove("light-mode");
      themeIcon.className = "bx bx-sun";
    }
  }

  function toggleTheme() {
    if (document.body.classList.contains("light-mode")) {
      document.body.classList.remove("light-mode");
      themeIcon.className = "bx bx-sun";
      localStorage.setItem("bilingue_theme", "dark");
    } else {
      document.body.classList.add("light-mode");
      themeIcon.className = "bx bx-moon";
      localStorage.setItem("bilingue_theme", "light");
    }
  }

  // --- History & Favorites Management ---

  function saveToHistory(item) {
    // Avoid double saves if exact source & target matching is already in list
    const index = history.findIndex(h => h.sourceText.toLowerCase() === item.sourceText.toLowerCase() && h.sourceLang === item.sourceLang);
    
    if (index !== -1) {
      // Move existing to top
      const existing = history.splice(index, 1)[0];
      // Keep its favorite state
      item.isFavorite = existing.isFavorite;
      history.unshift(item);
    } else {
      history.unshift(item);
    }

    // Limit history to 50 items
    if (history.length > 50) {
      history.pop();
    }

    localStorage.setItem("bilingue_history", JSON.stringify(history));
    renderHistory();
  }

  function toggleFavoriteCurrent() {
    if (!currentTranslation) return;

    currentTranslation.isFavorite = !currentTranslation.isFavorite;
    
    if (currentTranslation.isFavorite) {
      favoriteBtn.classList.add("active");
      favoriteBtn.querySelector("i").className = "bx bxs-star";
      showToast("Añadido a favoritos");
    } else {
      favoriteBtn.classList.remove("active");
      favoriteBtn.querySelector("i").className = "bx bx-star";
      showToast("Eliminado de favoritos");
    }

    // Find and update in history database
    const index = history.findIndex(h => h.sourceText.toLowerCase() === currentTranslation.sourceText.toLowerCase() && h.sourceLang === currentTranslation.sourceLang);
    if (index !== -1) {
      history[index].isFavorite = currentTranslation.isFavorite;
      localStorage.setItem("bilingue_history", JSON.stringify(history));
      renderHistory();
    } else {
      // If it somehow wasn't in history, add it now
      history.unshift(currentTranslation);
      localStorage.setItem("bilingue_history", JSON.stringify(history));
      renderHistory();
    }
  }

  function renderHistory() {
    historyList.innerHTML = "";
    
    const query = historySearchInput.value.toLowerCase().trim();
    
    // Filter history based on search query
    const filteredHistory = history.filter(item => 
      item.sourceText.toLowerCase().includes(query) || 
      item.translatedText.toLowerCase().includes(query)
    );

    if (filteredHistory.length === 0) {
      historyList.innerHTML = '<div class="no-items">Sin coincidencias</div>';
      return;
    }

    filteredHistory.forEach(item => {
      const el = document.createElement("div");
      el.className = "history-item";
      
      const langPair = `${item.sourceLang.toUpperCase()} ➔ ${item.targetLang.toUpperCase()}`;

      el.innerHTML = `
        <div class="history-text">${item.sourceText}</div>
        <div class="history-translation">${item.translatedText}</div>
        <div class="history-meta">
          <span>${langPair} • ${item.isOffline ? 'Offline' : 'API'}</span>
          <span>${item.timestamp}</span>
        </div>
        <button class="star-btn ${item.isFavorite ? 'active' : ''}">
          <i class="bx ${item.isFavorite ? 'bxs-star' : 'bx-star'}"></i>
        </button>
      `;

      // Click event to load translation
      el.addEventListener("click", (e) => {
        // Prevent loading when clicking star button
        if (e.target.closest(".star-btn")) return;

        sourceLangSelect.value = item.sourceLang;
        targetLangSelect.value = item.targetLang;
        sourceText.value = item.sourceText;
        charCounter.textContent = `${item.sourceText.length} / 5000`;
        updateLangLabels();
        performTranslation();
      });

      // Star toggler inside history item
      const starBtn = el.querySelector(".star-btn");
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        item.isFavorite = !item.isFavorite;
        
        // Update favorite toggle if active on the main translation interface
        if (currentTranslation && 
            currentTranslation.sourceText.toLowerCase() === item.sourceText.toLowerCase() && 
            currentTranslation.sourceLang === item.sourceLang) {
          currentTranslation.isFavorite = item.isFavorite;
          if (item.isFavorite) {
            favoriteBtn.classList.add("active");
            favoriteBtn.querySelector("i").className = "bx bxs-star";
          } else {
            favoriteBtn.classList.remove("active");
            favoriteBtn.querySelector("i").className = "bx bx-star";
          }
        }

        localStorage.setItem("bilingue_history", JSON.stringify(history));
        renderHistory();
        showToast(item.isFavorite ? "Añadido a favoritos" : "Eliminado de favoritos");
      });

      historyList.appendChild(el);
    });
  }

  function clearHistory() {
    if (history.length === 0) return;
    
    if (confirm("¿Seguro que quieres borrar el historial de traducciones?")) {
      history = [];
      localStorage.removeItem("bilingue_history");
      renderHistory();
      clearTranslation();
      showToast("Historial borrado");
    }
  }

  // --- Word of the Day Loading ---

  function loadWordOfTheDay() {
    const wordKeys = Object.keys(window.dictionary.words);
    if (wordKeys.length === 0) return;

    // Select seed word based on calendar date to ensure it only changes daily
    const daySeed = new Date().getDate() + new Date().getMonth() * 31;
    const selectedKey = wordKeys[daySeed % wordKeys.length];
    const details = window.dictionary.words[selectedKey];

    // Simple curated context/example sentences list
    const examples = {
      "hello": "Hello! How can I help you today? | ¡Hola! ¿Cómo te puedo ayudar hoy?",
      "cat": "The black cat is sleeping on the table. | El gato negro está durmiendo sobre la mesa.",
      "dog": "My dog loves running in the park. | A mi perro le encanta correr en el parque.",
      "house": "They bought a beautiful house in the city. | Ellos compraron una casa hermosa en la ciudad.",
      "water": "Please, give me a glass of cold water. | Por favor, dame un vaso de agua fría.",
      "book": "This book is very interesting to read. | Este libro es muy interesante de leer.",
      "happy": "She was very happy with her birthday gifts. | Ella estaba muy feliz con sus regalos de cumpleaños.",
      "beautiful": "The sunset over the beach was beautiful. | El atardecer sobre la playa fue hermoso.",
      "learn": "It is never too late to learn a new language. | Nunca es demasiado tarde para aprender un nuevo idioma.",
      "friend": "A true friend is always there for you. | Un amigo verdadero siempre está ahí para ti.",
      "time": "Time flies when you are having fun. | El tiempo vuela cuando te estás divirtiendo."
    };

    const exText = examples[selectedKey] || `${selectedKey.charAt(0).toUpperCase() + selectedKey.slice(1)} is a common word. | Es una palabra común.`;

    dailyWordEn.textContent = selectedKey;
    dailyWordEs.textContent = details.tr;
    dailyWordPos.textContent = translatePOS(details.pos);
    dailyWordExample.innerHTML = exText.replace(" | ", "<br><span style='color:var(--text-secondary);'>");
  }

  // --- Dictionary Explorer ---

  function performExplorerSearch() {
    const query = explorerSearchInput.value.toLowerCase().trim();
    explorerResults.innerHTML = "";

    const results = offlineEngine.searchDictionary(query);

    if (results.length === 0) {
      if (query === "") {
        explorerResults.innerHTML = '<div class="no-items">Escribe algo para ver las coincidencias offline</div>';
      } else {
        explorerResults.innerHTML = '<div class="no-items">No se encontraron resultados en el diccionario offline</div>';
      }
      return;
    }

    results.slice(0, 30).forEach(item => {
      const el = document.createElement("div");
      el.className = "explorer-item";
      
      el.innerHTML = `
        <div class="explorer-item-words">
          <span class="explorer-en">${item.english}</span>
          <span class="explorer-es">${item.spanish}</span>
        </div>
        <span class="pill-pos">${translatePOS(item.pos)}</span>
      `;

      // Click to translate
      el.addEventListener("click", () => {
        // Load into source and translate
        sourceText.value = item.english;
        charCounter.textContent = `${item.english.length} / 5000`;
        sourceLangSelect.value = "en";
        targetLangSelect.value = "es";
        
        updateLangLabels();
        performTranslation();
        
        explorerModal.style.display = "none";
        explorerSearchInput.value = "";
      });

      explorerResults.appendChild(el);
    });
  }
});
