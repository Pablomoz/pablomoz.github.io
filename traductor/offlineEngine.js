// Offline Smart Translation Engine
// Relies on dictionary.js (attached to window.dictionary or imported)

class OfflineEngine {
  constructor() {
    this.dict = window.dictionary || { phrases: {}, words: {} };
    this.reversePhrases = {};
    this.reverseWords = {};
    this.buildReverseDictionary();
  }

  // Helper to normalize strings for comparison (lowercase, strip punctuation)
  normalize(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .trim()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!]/g, "")
      .replace(/\s+/g, " ");
  }

  // Parse dictionary entry translation fields (which might contain "/" or alternative terms)
  // and map them back to the source word
  buildReverseDictionary() {
    // 1. Reverse Phrases
    for (const [enPhrase, esPhrase] of Object.entries(this.dict.phrases)) {
      const normEs = this.normalize(esPhrase);
      const normEn = this.normalize(enPhrase);
      if (normEs) {
        this.reversePhrases[normEs] = esPhrase; // original case/accent Spanish phrase
        this.reversePhrases[normEs + "_target"] = enPhrase; // Maps to English phrase
      }
    }

    // 2. Reverse Words
    for (const [enWord, details] of Object.entries(this.dict.words)) {
      const translations = details.tr.split('/');
      for (let tr of translations) {
        tr = this.normalize(tr);
        if (tr) {
          // If we haven't mapped this Spanish word yet, or if we want to add it as an option
          if (!this.reverseWords[tr]) {
            this.reverseWords[tr] = [];
          }
          this.reverseWords[tr].push({
            word: enWord,
            pos: details.pos,
            allTranslations: details.tr
          });
        }
      }
    }
  }

  // Main translation function
  // returns { translatedText: string, isExact: boolean, wordDetails: Array }
  translate(text, sourceLang, targetLang) {
    const normText = this.normalize(text);
    if (!normText) {
      return { translatedText: '', isExact: false, wordDetails: [] };
    }

    // --- 1. Check for Exact Phrase Match ---
    if (sourceLang === 'en' && targetLang === 'es') {
      // Direct phrase check
      for (const [enPhrase, esPhrase] of Object.entries(this.dict.phrases)) {
        if (this.normalize(enPhrase) === normText) {
          return {
            translatedText: esPhrase,
            isExact: true,
            wordDetails: [{ source: text, target: esPhrase, pos: 'phrase' }]
          };
        }
      }
    } else {
      // Reverse phrase check
      const matchedEnPhrase = this.reversePhrases[normText + "_target"];
      if (matchedEnPhrase) {
        const originalEsPhrase = this.reversePhrases[normText];
        return {
          translatedText: matchedEnPhrase,
          isExact: true,
          wordDetails: [{ source: originalEsPhrase || text, target: matchedEnPhrase, pos: 'phrase' }]
        };
      }
    }

    // --- 2. Word-by-Word Fallback ---
    // Tokenize text, keeping track of punctuation spacing where possible, or doing a simple split
    const words = text.split(/(\s+|[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!]+)/);
    const translatedTokens = [];
    const wordDetails = [];

    for (let token of words) {
      const normToken = this.normalize(token);
      
      // If it's spacing or punctuation, keep it as is
      if (!normToken || /^\s+$/.test(token) || /^[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡!]+$/.test(token)) {
        translatedTokens.push(token);
        continue;
      }

      let translatedWord = token; // Fallback to original
      let foundDetails = null;

      if (sourceLang === 'en' && targetLang === 'es') {
        const details = this.dict.words[normToken];
        if (details) {
          // Use the first translation before any "/" for simple inline replacement
          const cleanTr = details.tr.split('/')[0].trim();
          translatedWord = this.matchCase(token, cleanTr);
          foundDetails = {
            source: token,
            target: details.tr,
            pos: details.pos
          };
        }
      } else {
        const matches = this.reverseWords[normToken];
        if (matches && matches.length > 0) {
          // Pick the first English match
          const primaryMatch = matches[0];
          translatedWord = this.matchCase(token, primaryMatch.word);
          foundDetails = {
            source: token,
            target: primaryMatch.word,
            pos: primaryMatch.pos,
            alternatives: matches.map(m => m.word).join(', '),
            allTranslations: primaryMatch.allTranslations
          };
        }
      }

      translatedTokens.push(translatedWord);
      if (foundDetails) {
        wordDetails.push(foundDetails);
      } else {
        wordDetails.push({
          source: token,
          target: '?',
          pos: 'unknown'
        });
      }
    }

    const translatedText = translatedTokens.join('');
    
    // Check if we actually translated anything
    const hasTranslations = wordDetails.some(d => d.pos !== 'unknown');

    return {
      translatedText: hasTranslations ? translatedText : `[No translation found offline: "${text}"]`,
      isExact: false,
      wordDetails: wordDetails.filter(d => d.pos !== 'unknown')
    };
  }

  // Preserve uppercase / titlecase where possible
  matchCase(original, translation) {
    if (!original || !translation) return translation;
    if (original === original.toUpperCase()) return translation.toUpperCase();
    if (original[0] === original[0].toUpperCase()) {
      return translation.charAt(0).toUpperCase() + translation.slice(1);
    }
    return translation.toLowerCase();
  }

  // Full dictionary lookups for search utility
  searchDictionary(query) {
    const norm = this.normalize(query);
    if (!norm) return [];

    const results = [];

    // Check English words
    for (const [enWord, details] of Object.entries(this.dict.words)) {
      if (enWord.includes(norm) || this.normalize(details.tr).includes(norm)) {
        results.push({
          english: enWord,
          spanish: details.tr,
          pos: details.pos,
          type: 'word'
        });
      }
    }

    // Check Phrases
    for (const [enPhrase, esPhrase] of Object.entries(this.dict.phrases)) {
      if (this.normalize(enPhrase).includes(norm) || this.normalize(esPhrase).includes(norm)) {
        results.push({
          english: enPhrase,
          spanish: esPhrase,
          pos: 'phrase',
          type: 'phrase'
        });
      }
    }

    return results;
  }
}

// Export class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflineEngine;
} else {
  window.OfflineEngine = OfflineEngine;
}
