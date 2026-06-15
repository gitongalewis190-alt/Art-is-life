/* ═══════════════════════════════════════════════════════════════════════
   arten.js — Arten: AI Creative Concierge for Art is Life Foundation
   Client mode: voice Q&A about artworks, artist, commissions
   Admin mode:  full access to artworks, orders, can trigger edits
   Uses: Web Speech API (SpeechRecognition + SpeechSynthesis)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Config ── */
  var WAKE_WORD     = 'arten';
  var ADMIN_KEYWORD = 'admin';
  var isAdmin       = false;
  var isListening   = false;
  var isSpeaking    = false;
  var recognition   = null;
  var synth         = window.speechSynthesis;
  var lastTranscript = '';
  var artenVisible  = false;

  /* ── Build UI ── */
  function buildUI() {
    if (document.getElementById('arten-widget')) return;

    var widget = document.createElement('div');
    widget.id  = 'arten-widget';
    widget.innerHTML = [
      '<div id="arten-orb" onclick="ArtenToggle()" aria-label="Arten AI Assistant" title="Talk to Arten">',
        '<div class="arten-face">',
          '<div class="arten-eye left"></div>',
          '<div class="arten-eye right"></div>',
          '<div class="arten-mouth" id="artenMouth"></div>',
        '</div>',
        '<div class="arten-glow"></div>',
      '</div>',
      '<div class="arten-wave-wrap" id="artenWaveWrap">',
        '<div class="arten-wave-bar"></div>',
        '<div class="arten-wave-bar"></div>',
        '<div class="arten-wave-bar"></div>',
        '<div class="arten-wave-bar"></div>',
        '<div class="arten-wave-bar"></div>',
      '</div>',
      '<div class="arten-panel" id="artenPanel">',
        '<div class="arten-panel-head">',
          '<span class="arten-name">Arten</span>',
          '<span class="arten-status" id="artenStatus">Ready</span>',
          '<button class="arten-close" onclick="ArtenToggle()">×</button>',
        '</div>',
        '<div class="arten-transcript" id="artenTranscript">',
          '<div class="arten-bubble arten-bubble-ai">Hi! I\'m Arten, your Art is Life guide. Ask me about any artwork, commissions, or Lewis\'s story. Just tap the mic or type below.</div>',
        '</div>',
        '<div class="arten-input-row">',
          '<button class="arten-mic-btn" id="artenMicBtn" onclick="ArtenListen()" title="Hold to speak">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>',
          '</button>',
          '<input class="arten-text-input" id="artenTextInput" type="text" placeholder="Ask Arten…" onkeydown="if(event.key===\'Enter\')ArtenSendText()">',
          '<button class="arten-send-btn" onclick="ArtenSendText()">',
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
          '</button>',
        '</div>',
      '</div>',
    ].join('');

    document.body.appendChild(widget);
    setupRecognition();
  }

  /* ── Knowledge base: artworks + artist ── */
  function getArtworks() {
    return window.artworks || window.LOCAL_ARTWORKS || [];
  }

  var ARTIST_BIO = {
    name: 'Lewis Gitonga',
    title: 'Founder & CEO, Art Is Life Foundation',
    location: 'Nairobi, Kenya',
    mission: 'To use art as a bridge between emotions and the people who need to feel them. Every canvas here began as a feeling before it became a colour.',
    goal: 'To build a successful creative ecosystem that connects artists with collectors and communities across Africa and beyond.',
    style: 'Emotional contemporary art — portraits, nature, and abstract expressions rooted in lived experience.',
    commission: 'Commissions are open. Lewis creates bespoke pieces tailored to the client\'s vision, emotion, and space. Contact via WhatsApp at 0704 708 178.',
    contact: 'WhatsApp: 0704 708 178 · Email: artislifefoundation2023@gmail.com · Instagram: @lewis_art.is.life'
  };

  /* ── Intent matching ── */
  function matchIntent(text) {
    var t = text.toLowerCase().trim();
    var artworks = getArtworks();

    // Greeting
    if (/^(hi|hello|hey|hujambo|habari|good (morning|afternoon|evening))/i.test(t)) {
      return speak('Hello! Welcome to Art Is Life Foundation. I\'m Arten, your personal guide to Lewis Gitonga\'s artworks. You can ask me about any piece, commissions, prices, or the artist\'s story.');
    }

    // Who are you / what is arten
    if (/who are you|what are you|what is arten|introduce yourself/i.test(t)) {
      return speak('I\'m Arten — the intelligent creative concierge of Art Is Life Foundation. I know every artwork in this gallery, the artist\'s story, and can help you find the perfect piece or start a commission. Think of me as a 24/7 art advisor built specifically for this gallery.');
    }

    // Artist story / about Lewis
    if (/lewis|founder|artist|who (is|made|created)|about (the artist|the founder)|your story|his story/i.test(t)) {
      return speak('Lewis Gitonga is the Founder and CEO of Art Is Life Foundation, based in Nairobi, Kenya. ' + ARTIST_BIO.mission + ' His work spans emotional portraits, nature pieces, and abstract expressions — all rooted in real human experience. ' + ARTIST_BIO.goal);
    }

    // Goals / mission
    if (/goal|mission|vision|foundation|ecosystem/i.test(t)) {
      return speak('The mission of Art Is Life Foundation is simple: ' + ARTIST_BIO.mission + ' The long-term goal is ' + ARTIST_BIO.goal + ' Every piece in this gallery is a step toward that vision.');
    }

    // Commission
    if (/commission|custom|bespoke|my (own|portrait)|personalised/i.test(t)) {
      return speak('Yes, commissions are open! ' + ARTIST_BIO.commission + ' Lewis will work with you to understand your vision, emotion, and the space the piece will live in. Expect a deeply personal result.');
    }

    // Price / cost
    if (/price|cost|how much|afford|ksh|kes|payment|pay/i.test(t)) {
      var available = artworks.filter(function(a) { return a.status !== 'sold'; });
      if (available.length === 0) {
        return speak('Prices range across the collection. Please check individual artworks for their prices. You can also contact Lewis directly for more information.');
      }
      var min = Math.min.apply(null, available.map(function(a){return a.priceNum||0;}));
      var max = Math.max.apply(null, available.map(function(a){return a.priceNum||0;}));
      return speak('Artworks in this collection range from ' + min.toLocaleString() + ' to ' + max.toLocaleString() + ' Kenyan Shillings. Each piece is an original, one-time creation. Payment can be made via M-Pesa or bank transfer. Would you like to know about a specific piece?');
    }

    // Available works
    if (/available|for sale|buy|purchase|collect/i.test(t)) {
      var avail = artworks.filter(function(a){return a.status!=='sold';});
      if (avail.length === 0) return speak('All pieces are currently sold. New works are added regularly — follow us on Instagram at lewis_art.is.life to be notified.');
      return speak('There are currently ' + avail.length + ' available works in the gallery. Some highlights: ' + avail.slice(0,3).map(function(a){return '"' + a.title + '" at ' + a.price;}).join(', ') + '. Would you like to know more about any of these?');
    }

    // Specific artwork lookup by name
    for (var i = 0; i < artworks.length; i++) {
      var a = artworks[i];
      if (a.title && t.indexOf(a.title.toLowerCase()) !== -1) {
        var dims = a.dimensions ? ' It measures ' + a.dimensions + '.' : '';
        var status = a.status === 'sold' ? 'This piece has been sold.' : 'It is available for ' + a.price + '.';
        return speak('"' + a.title + '" — ' + a.desc + dims + ' ' + status);
      }
    }

    // Dimensions / size
    if (/size|dimension|how (big|large|small)|centimetre|cm|canvas/i.test(t)) {
      var withDims = artworks.filter(function(a){return a.dimensions;});
      if (withDims.length === 0) return speak('Dimensions vary by piece. Please check the individual artwork card or contact Lewis for specifics.');
      return speak('Each piece has its own dimensions shown on its card. Some examples: ' + withDims.slice(0,4).map(function(a){return '"' + a.title + '" is ' + a.dimensions;}).join(', ') + '. Lewis also takes custom size commissions.');
    }

    // Contact / WhatsApp
    if (/contact|whatsapp|email|phone|call|reach/i.test(t)) {
      return speak('You can reach Lewis Gitonga on WhatsApp at 0704 708 178, by email at artislifefoundation2023@gmail.com, or on Instagram at lewis underscore art dot is dot life. The gallery is based in Nairobi, Kenya.');
    }

    // Shipping / delivery
    if (/ship|deliver|international|courier|transport/i.test(t)) {
      return speak('Lewis ships artworks both locally within Nairobi and nationally across Kenya. International shipping can be arranged — contact him directly on WhatsApp at 0704 708 178 to discuss packaging, insurance, and shipping costs for your location.');
    }

    // Style / medium
    if (/style|medium|oil|acrylic|watercolour|charcoal|pastel|paint|draw/i.test(t)) {
      return speak('Lewis works primarily in oil and acrylic on canvas, with occasional charcoal and mixed-media pieces. His style blends emotional realism with symbolic abstraction — each piece carries a feeling before it carries a colour.');
    }

    // How long / timeline
    if (/how long|time|weeks|days|timeline|when will|quick/i.test(t)) {
      return speak('A standard commission takes between 3 and 6 weeks depending on size and complexity. Lewis works closely with clients throughout the process, sharing progress updates. Rush commissions can sometimes be accommodated — ask directly.');
    }

    // Instagram / social
    if (/instagram|social media|follow|tiktok|facebook/i.test(t)) {
      return speak('Follow Lewis\'s creative journey on Instagram at lewis_art.is.life — that\'s where new works are previewed, studio processes are shared, and the community connects.');
    }

    // Thank you
    if (/thank(s| you)|asante|cheers/i.test(t)) {
      return speak('You\'re most welcome! It\'s a pleasure to guide you through this gallery. Is there anything else you\'d like to know?');
    }

    // Admin commands (only if admin mode)
    if (isAdmin) {
      if (/show (artworks|all works|collection)/i.test(t)) {
        var list = getArtworks().map(function(a){return a.title;}).join(', ');
        return speak('Current artworks: ' + list);
      }
      if (/how many orders/i.test(t)) {
        return speak('I don\'t have live order data loaded right now. Open the Orders tab in your admin dashboard for a full view.');
      }
      if (/open (console|dashboard|admin)/i.test(t)) {
        if (typeof window.openAdminDashboard === 'function') {
          window.openAdminDashboard();
          return speak('Opening your admin dashboard now.');
        }
      }
    }

    // Fallback
    var q = text.trim();
    return speak('That\'s a great question. I\'m still learning everything about this gallery. For detailed answers about "' + q.substring(0,40) + '", I\'d recommend reaching out to Lewis directly on WhatsApp at 0704 708 178 — he\'ll give you the most personal answer.');
  }

  /* ── Speech synthesis ── */
  function speak(text) {
    addBubble(text, 'ai');
    if (!synth) return;
    synth.cancel();
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-GB';
    utt.rate = 0.92;
    utt.pitch = 1.05;
    utt.volume = 0.95;
    // Prefer a female voice
    var voices = synth.getVoices();
    var preferred = voices.find(function(v){return v.lang==='en-GB' && /female|woman/i.test(v.name);})
                 || voices.find(function(v){return /samantha|karen|victoria|moira|fiona/i.test(v.name);})
                 || voices.find(function(v){return v.lang.startsWith('en');});
    if (preferred) utt.voice = preferred;
    utt.onstart   = function() { setWave(true); setStatus('Speaking…'); isSpeaking = true; };
    utt.onend     = function() { setWave(false); setStatus('Ready'); isSpeaking = false; };
    utt.onerror   = function() { setWave(false); setStatus('Ready'); isSpeaking = false; };
    synth.speak(utt);
  }

  /* ── Speech recognition ── */
  function setupRecognition() {
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    recognition = new SpeechRec();
    recognition.continuous    = false;
    recognition.interimResults = true;
    recognition.lang          = 'en-US';
    recognition.onstart  = function() { setStatus('Listening…'); setWave(true); isListening = true; document.getElementById('artenMicBtn').classList.add('active'); };
    recognition.onend    = function() { setStatus('Ready'); setWave(false); isListening = false; document.getElementById('artenMicBtn').classList.remove('active'); };
    recognition.onerror  = function() { setStatus('Ready'); setWave(false); isListening = false; };
    recognition.onresult = function(e) {
      var transcript = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      document.getElementById('artenTextInput').value = transcript;
      if (e.results[e.results.length-1].isFinal) {
        lastTranscript = transcript;
        addBubble(transcript, 'user');
        document.getElementById('artenTextInput').value = '';
        matchIntent(transcript);
        // Check admin mode toggle
        if (transcript.toLowerCase().indexOf('admin mode') !== -1 && window._firebaseAdmin) {
          isAdmin = true;
          speak('Admin mode activated. I now have access to your dashboard data.');
        }
      }
    };
  }

  /* ── UI helpers ── */
  function addBubble(text, who) {
    var container = document.getElementById('artenTranscript');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'arten-bubble arten-bubble-' + who;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function setWave(active) {
    var wrap = document.getElementById('artenWaveWrap');
    if (wrap) wrap.classList[active ? 'add' : 'remove']('active');
  }

  function setStatus(text) {
    var el = document.getElementById('artenStatus');
    if (el) el.textContent = text;
  }

  /* ── Public API ── */
  window.ArtenToggle = function() {
    var panel = document.getElementById('artenPanel');
    if (!panel) return;
    artenVisible = !artenVisible;
    panel.classList[artenVisible ? 'add' : 'remove']('open');
    if (artenVisible && synth && synth.getVoices().length === 0) {
      synth.onvoiceschanged = function(){};
    }
    // Check admin status
    if (window._firebaseAdmin) {
      isAdmin = true;
      document.getElementById('artenStatus').textContent = 'Admin Ready';
    }
  };

  window.ArtenListen = function() {
    if (!recognition) { alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.'); return; }
    if (isSpeaking) { synth.cancel(); isSpeaking = false; }
    if (isListening) { recognition.stop(); return; }
    try { recognition.start(); } catch(e) { setStatus('Ready'); }
  };

  window.ArtenSendText = function() {
    var input = document.getElementById('artenTextInput');
    if (!input || !input.value.trim()) return;
    var text = input.value.trim();
    input.value = '';
    addBubble(text, 'user');
    matchIntent(text);
  };

  /* ── Init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
