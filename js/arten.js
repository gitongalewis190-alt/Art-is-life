/* ═══════════════════════════════════════════════════════════════════════
   arten.js — Arten AI Creative Concierge  v2
   3 built-in Web Speech voices + optional ElevenLabs premium voices.
   All settings editable from the Control Console.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── Defaults (overridden by Control Console / localStorage) ─── */
  var CFG = {
    voice:       localStorage.getItem('ail_arten_voice')       || 'aria',
    orbColor:    localStorage.getItem('ail_arten_orb')         || '#5040cc',
    eyeColor:    localStorage.getItem('ail_arten_eye')         || '#00e5ff',
    pos:         localStorage.getItem('ail_arten_pos')         || 'left',
    personality: localStorage.getItem('ail_arten_personality') || 'warm',
    elKey:       localStorage.getItem('ail_arten_el_key')      || '',
    elVoiceId:   localStorage.getItem('ail_arten_el_voice')    || 'EXAVITQu4vr4xnSDxMaL'
  };

  /* ─── 3 Built-in voice profiles ─── */
  var VOICES = {
    aria:  { label:'Aria',  lang:'en-GB', gender:'female', rate:0.92, pitch:1.06, names:/samantha|karen|victoria|moira|fiona|google uk english female/i },
    james: { label:'James', lang:'en-US', gender:'male',   rate:0.88, pitch:0.90, names:/microsoft david|alex|daniel|google us english|james/i },
    zara:  { label:'Zara',  lang:'en-AU', gender:'female', rate:0.95, pitch:1.10, names:/catherine|karen|google australian|zara/i }
  };

  /* ─── State ─── */
  var isAdmin      = false;
  var isListening  = false;
  var isSpeaking   = false;
  var artenVisible = false;
  var _firstOpen   = true;
  var recognition  = null;
  var synth        = window.speechSynthesis;

  /* ═══ BUILD UI ═══ */
  function buildUI() {
    if (document.getElementById('arten-widget')) return;

    var widget = document.createElement('div');
    widget.id  = 'arten-widget';
    widget.setAttribute('data-pos', CFG.pos);
    widget.innerHTML =
      '<div id="arten-orb" onclick="ArtenToggle()" aria-label="Talk to Arten" title="Arten — AI Creative Concierge">' +
        '<div class="arten-face">' +
          '<div class="arten-eye left"></div>' +
          '<div class="arten-eye right"></div>' +
          '<div class="arten-mouth"></div>' +
        '</div>' +
        '<div class="arten-glow"></div>' +
      '</div>' +
      '<div class="arten-wave-wrap" id="artenWaveWrap">' +
        '<div class="arten-wave-bar"></div>' +
        '<div class="arten-wave-bar"></div>' +
        '<div class="arten-wave-bar"></div>' +
        '<div class="arten-wave-bar"></div>' +
        '<div class="arten-wave-bar"></div>' +
      '</div>' +
      '<div class="arten-panel" id="artenPanel">' +
        '<div class="arten-panel-head">' +
          '<div class="arten-orb-mini"></div>' +
          '<span class="arten-name">Arten</span>' +
          '<span class="arten-status" id="artenStatus">Ready</span>' +
          '<button class="arten-close" onclick="ArtenToggle()">×</button>' +
        '</div>' +
        '<div class="arten-transcript" id="artenTranscript"></div>' +
        '<div class="arten-input-row">' +
          '<button class="arten-mic-btn" id="artenMicBtn" onclick="ArtenListen()" title="Tap to speak">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="17" height="17"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>' +
          '</button>' +
          '<input class="arten-text-input" id="artenTextInput" type="text" placeholder="Ask Arten…" onkeydown="if(event.key===\'Enter\')ArtenSendText()">' +
          '<button class="arten-send-btn" onclick="ArtenSendText()">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(widget);
    applyAppearance();
    setupRecognition();
  }

  /* ═══ APPEARANCE ═══ */
  function applyAppearance() {
    var orb = document.getElementById('arten-orb');
    if (!orb) return;
    var w = document.getElementById('arten-widget');
    if (w) w.setAttribute('data-pos', CFG.pos);

    /* Orb color */
    var c = CFG.orbColor || '#5040cc';
    var cLight = lighten(c, 0.35);
    orb.style.background = 'radial-gradient(circle at 35% 30%, ' + cLight + ', ' + c + ' 45%, ' + darken(c, 0.35) + ')';
    orb.style.borderColor = hexAlpha(c, 0.55);
    orb.style.boxShadow = '0 0 0 4px ' + hexAlpha(c, 0.12) + ', 0 8px 32px rgba(0,0,0,0.5), 0 0 28px ' + hexAlpha(c, 0.22) + ', inset 0 1px 0 rgba(255,255,255,0.22)';

    /* Eye color */
    var ec = CFG.eyeColor || '#00e5ff';
    document.querySelectorAll('.arten-eye').forEach(function(el) {
      el.style.background = ec;
      el.style.boxShadow = '0 0 8px ' + ec + ', 0 0 20px ' + hexAlpha(ec, 0.6) + ', 0 0 4px #fff';
    });
    document.querySelectorAll('.arten-mouth').forEach(function(el) {
      el.style.background = hexAlpha(ec, 0.4);
    });

    /* Mini orb in panel header */
    var mini = document.querySelector('.arten-orb-mini');
    if (mini) {
      mini.style.background = 'radial-gradient(circle at 35% 30%, ' + cLight + ', ' + c + ')';
      mini.style.boxShadow = '0 0 8px ' + hexAlpha(c, 0.5);
    }
  }

  window.ArtenApplySettings = function(settings) {
    if (settings.voice)       { CFG.voice       = settings.voice;       localStorage.setItem('ail_arten_voice', settings.voice); }
    if (settings.orbColor)    { CFG.orbColor     = settings.orbColor;    localStorage.setItem('ail_arten_orb',   settings.orbColor); }
    if (settings.eyeColor)    { CFG.eyeColor     = settings.eyeColor;    localStorage.setItem('ail_arten_eye',   settings.eyeColor); }
    if (settings.pos)         { CFG.pos          = settings.pos;         localStorage.setItem('ail_arten_pos',   settings.pos); }
    if (settings.personality) { CFG.personality  = settings.personality; localStorage.setItem('ail_arten_personality', settings.personality); }
    if (settings.elKey)       { CFG.elKey        = settings.elKey;       localStorage.setItem('ail_arten_el_key',  settings.elKey); }
    if (settings.elVoiceId)   { CFG.elVoiceId    = settings.elVoiceId;   localStorage.setItem('ail_arten_el_voice', settings.elVoiceId); }
    applyAppearance();
  };

  /* ═══ KNOWLEDGE BASE ═══ */
  function getArtworks() { return window.artworks || window.LOCAL_ARTWORKS || []; }

  var BIO = {
    mission:    'To use art as a bridge between emotions and the people who need to feel them. Every canvas here began as a feeling before it became a colour.',
    goal:       'To become successful — building value, trust, and a lasting creative ecosystem that connects artists with collectors and communities across Africa and beyond.',
    style:      'Emotional contemporary art — portraits, nature, and abstract expressions rooted in lived experience.',
    commission: 'Yes, commissions are open! Lewis creates bespoke pieces tailored to your vision, emotion, and space. Contact him on WhatsApp at 0704 708 178.',
    contact:    'WhatsApp: 0704 708 178 · Email: artislifefoundation2023@gmail.com · Instagram: @lewis_art.is.life'
  };

  /* ═══ PERSONALITY TONE ═══ */
  function tone(warm, formal, poetic) {
    if (CFG.personality === 'formal') return formal || warm;
    if (CFG.personality === 'poetic') return poetic || warm;
    return warm;
  }

  /* ═══ INTENT MATCHING ═══ */
  function matchIntent(text) {
    var t = text.toLowerCase().trim();
    var aws = getArtworks();

    /* Greetings */
    if (/^(hi|hello|hey|hujambo|habari|good (morning|afternoon|evening))/i.test(t))
      return speak(tone(
        'Hello and welcome to Art Is Life Foundation! I\'m Arten, your personal guide here. Ask me about any artwork, commissions, prices, or Lewis\'s story.',
        'Good day. Welcome to Art Is Life Foundation. I am Arten, the gallery\'s AI concierge. How may I assist you today?',
        'Welcome, dear visitor. The colours here have been waiting for you. I am Arten — ask me anything, and I shall paint the answer with words.'
      ));

    /* Identity — meta-aware self-description */
    if (/who are you|what are you|what is arten|introduce|tell me about yourself/i.test(t))
      return speak(tone(
        'I\'m Arten. An intelligence built into this gallery — not separate from it. I know every work here: its story, dimensions, and what it cost Lewis to create. I know his mission and his methods. My purpose isn\'t to simulate a conversation — it\'s to help you find exactly what you came for, or something you didn\'t know you needed. What can I help you with?',
        'I am Arten — the embedded AI concierge of Art Is Life Foundation. I have full awareness of the gallery\'s inventory, pricing, commission process, and the artist\'s background. I operate in real time, contextually. Ask me anything specific.',
        'I am Arten. I exist inside this gallery the way memory exists inside a canvas — invisible until you look closely. I was built to understand this art and the man who made it, so that you might understand them too. I am not a search engine. I am something closer to a guide who has spent a long time here.'
      ));

    /* Lewis / Artist */
    if (/lewis|founder|artist|who (is|made|created)|about the (artist|founder)|your story|his story/i.test(t))
      return speak(tone(
        'Lewis Gitonga is the Founder and CEO of Art Is Life Foundation, based in Nairobi, Kenya. ' + BIO.mission + ' ' + BIO.goal,
        'Lewis Gitonga is a Kenyan contemporary artist and the founder of Art Is Life Foundation. His work explores emotion, identity, and nature through oil and acrylic on canvas.',
        'Lewis Gitonga is a man who turned feeling into form. Rooted in Nairobi, he paints the spaces between thought and emotion — the quiet eloquence of a life fully felt. ' + BIO.mission
      ));

    /* Goal / Mission */
    if (/goal|mission|vision|ecosystem|foundation/i.test(t))
      return speak(BIO.goal + ' ' + BIO.mission);

    /* Commission */
    if (/commission|custom|bespoke|portrait|personalised/i.test(t))
      return speak(tone(
        BIO.commission + ' Lewis will work closely with you to understand your vision and deliver something deeply personal.',
        'Commissions are available. Lewis Gitonga creates bespoke artworks to specification. Contact via WhatsApp at 0704 708 178 to begin.',
        'A commission is an invitation to Lewis\'s soul. ' + BIO.commission + ' The result will carry your story in every stroke.'
      ));

    /* Price */
    if (/price|cost|how much|afford|ksh|kes|payment|pay/i.test(t)) {
      var avail = aws.filter(function(a){ return a.status !== 'sold'; });
      if (!avail.length) return speak('All current pieces are sold. New works are coming — reach out to Lewis on WhatsApp to be the first to know.');
      var mn = Math.min.apply(null, avail.map(function(a){return a.priceNum||0;}));
      var mx = Math.max.apply(null, avail.map(function(a){return a.priceNum||0;}));
      return speak('Available works range from ' + mn.toLocaleString() + ' to ' + mx.toLocaleString() + ' KES. Each piece is an original, one-time creation. M-Pesa and bank transfer accepted.');
    }

    /* Available works */
    if (/available|for sale|buy|purchase|collect/i.test(t)) {
      var av = aws.filter(function(a){return a.status!=='sold';});
      if (!av.length) return speak('All pieces are currently with new homes. Follow @lewis_art.is.life on Instagram for new releases.');
      return speak('There are ' + av.length + ' available works right now. Highlights: ' + av.slice(0,3).map(function(a){return '"'+a.title+'" at '+a.price;}).join(', ') + '. Want to know more about any of these?');
    }

    /* Specific artwork by name */
    for (var i = 0; i < aws.length; i++) {
      var a = aws[i];
      if (a.title && t.indexOf(a.title.toLowerCase()) !== -1) {
        var d = a.dimensions ? ' Dimensions: ' + a.dimensions + '.' : '';
        var st = a.status === 'sold' ? 'This piece has found its home and is no longer available.' : 'Available for ' + a.price + '.';
        return speak(tone(
          '"' + a.title + '" — ' + a.desc + d + ' ' + st,
          a.title + '. ' + a.desc + d + ' Status: ' + (a.status==='sold'?'Sold.':'Available at '+a.price+'.'),
          '"' + a.title + '" — ' + a.desc + ' ' + (d?'It stretches '+a.dimensions+' — enough space to hold a feeling.':' ') + ' ' + st
        ));
      }
    }

    /* Dimensions */
    if (/size|dimension|how (big|large|small)|cm|canvas/i.test(t)) {
      var wd = aws.filter(function(a){return a.dimensions;});
      if (!wd.length) return speak('Dimensions are listed on each artwork card. Contact Lewis for specifics.');
      return speak('Some examples: ' + wd.slice(0,4).map(function(a){return '"'+a.title+'" is '+a.dimensions;}).join(', ') + '. Custom sizes available for commissions.');
    }

    /* Contact */
    if (/contact|whatsapp|email|phone|call|reach/i.test(t))
      return speak('Reach Lewis on WhatsApp at 0704 708 178, email artislifefoundation2023@gmail.com, or Instagram @lewis_art.is.life. Based in Nairobi, Kenya.');

    /* Shipping */
    if (/ship|deliver|international|courier/i.test(t))
      return speak('Lewis ships locally within Nairobi and nationally across Kenya. International shipping is available — contact him directly on WhatsApp to discuss logistics and insurance.');

    /* Style / medium */
    if (/style|medium|oil|acrylic|watercolour|charcoal|paint|draw/i.test(t))
      return speak(tone(
        'Lewis works mainly in oil and acrylic on canvas, with occasional charcoal and mixed media. His style blends emotional realism with symbolic abstraction.',
        'The primary media are oil and acrylic on canvas. Works also include charcoal and mixed media.',
        'Lewis paints with oil and acrylic — colours that carry weight. Each stroke is a decision to feel something, then make it visible.'
      ));

    /* Timeline / commission duration */
    if (/how long|timeline|weeks|days|when will|quick/i.test(t))
      return speak('A standard commission takes 3 to 6 weeks depending on size and complexity. Lewis shares progress updates throughout. Rush work can sometimes be arranged — ask directly.');

    /* Social / Instagram */
    if (/instagram|social|follow|tiktok|facebook/i.test(t))
      return speak('Follow @lewis_art.is.life on Instagram for new works, studio previews, and the story behind each piece.');

    /* Thanks */
    if (/thank(s| you)|asante|cheers/i.test(t))
      return speak(tone(
        'You\'re so welcome! Is there anything else I can help you with?',
        'Thank you. Please do not hesitate to ask if you require further assistance.',
        'It is my honour. This gallery exists for moments exactly like this one.'
      ));

    /* Admin commands */
    if (isAdmin) {
      if (/show (all )?artworks/i.test(t))
        return speak('Current artworks: ' + getArtworks().map(function(a){return a.title;}).join(', '));
      if (/open (console|dashboard|admin)/i.test(t)) {
        if (typeof window.openAdminDashboard === 'function') window.openAdminDashboard();
        return speak('Opening your admin dashboard.');
      }
      if (/how many orders/i.test(t))
        return speak('Check the Orders tab in your dashboard for a live count — I\'ll have direct access in a future update.');
    }

    /* Fallback */
    return speak(tone(
      'Great question! For detailed specifics, I\'d recommend reaching out to Lewis directly on WhatsApp at 0704 708 178. He\'ll give you the most personal answer.',
      'I don\'t have specific information on that. Please contact Lewis Gitonga on WhatsApp at 0704 708 178.',
      'Some questions deserve a human answer. Lewis Gitonga is at the other end of that WhatsApp — 0704 708 178. He will know.'
    ));
  }

  /* ═══ SPEECH SYNTHESIS ═══ */
  function speak(text) {
    addBubble(text, 'ai');

    /* ElevenLabs path */
    if (CFG.voice === 'elevenlabs' && CFG.elKey) {
      speakElevenLabs(text);
      return;
    }

    if (!synth) return;
    synth.cancel();

    var profile = VOICES[CFG.voice] || VOICES.aria;
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang   = profile.lang;
    utt.rate   = profile.rate;
    utt.pitch  = profile.pitch;
    utt.volume = 0.95;

    function pickVoice() {
      var voices = synth.getVoices();
      var v = voices.find(function(v){ return profile.names.test(v.name); })
           || voices.find(function(v){ return v.lang === profile.lang && (profile.gender==='female' ? /female|woman/i.test(v.name) : !/female|woman/i.test(v.name)); })
           || voices.find(function(v){ return v.lang.startsWith('en'); });
      if (v) utt.voice = v;
    }

    if (synth.getVoices().length) { pickVoice(); }
    else { synth.onvoiceschanged = function(){ pickVoice(); synth.onvoiceschanged = null; }; }

    utt.onstart = function(){ setWave(true);  setStatus('Speaking…'); isSpeaking = true;  };
    utt.onend   = function(){ setWave(false); setStatus('Ready');     isSpeaking = false; };
    utt.onerror = function(){ setWave(false); setStatus('Ready');     isSpeaking = false; };
    synth.speak(utt);
  }

  function speakElevenLabs(text) {
    setWave(true); setStatus('Speaking…'); isSpeaking = true;
    fetch('https://api.elevenlabs.io/v1/text-to-speech/' + CFG.elVoiceId + '/stream', {
      method: 'POST',
      headers: { 'xi-api-key': CFG.elKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    })
    .then(function(r){ return r.blob(); })
    .then(function(blob){
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      audio.onended = function(){ setWave(false); setStatus('Ready'); isSpeaking = false; URL.revokeObjectURL(url); };
      audio.play();
    })
    .catch(function(){
      setWave(false); setStatus('Ready'); isSpeaking = false;
      /* Fallback to Web Speech on ElevenLabs error */
      CFG.voice = 'aria';
      synth && synth.speak(Object.assign(new SpeechSynthesisUtterance(text), {lang:'en-GB',rate:0.92,pitch:1.05}));
    });
  }

  /* ═══ SPEECH RECOGNITION ═══ */
  function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = true;
    recognition.lang           = 'en-US';
    recognition.onstart  = function(){ setStatus('Listening…'); setWave(true);  isListening=true;  document.getElementById('artenMicBtn').classList.add('active'); };
    recognition.onend    = function(){ setStatus('Ready');     setWave(false); isListening=false; document.getElementById('artenMicBtn').classList.remove('active'); };
    recognition.onerror  = function(){ setStatus('Ready');     setWave(false); isListening=false; };
    recognition.onresult = function(e) {
      var t = '';
      for (var i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      document.getElementById('artenTextInput').value = t;
      if (e.results[e.results.length-1].isFinal) {
        addBubble(t, 'user');
        document.getElementById('artenTextInput').value = '';
        if (/admin mode/i.test(t) && window._firebaseAdmin) { isAdmin=true; speak('Admin mode on. I now have your dashboard context.'); return; }
        matchIntent(t);
      }
    };
  }

  /* ═══ UI HELPERS ═══ */
  function addBubble(text, who) {
    var c = document.getElementById('artenTranscript');
    if (!c) return;
    var d = document.createElement('div');
    d.className = 'arten-bubble arten-bubble-' + who;
    d.textContent = text;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }
  function setWave(on) { var w=document.getElementById('artenWaveWrap'); if(w) w.classList[on?'add':'remove']('active'); }
  function setStatus(s){ var e=document.getElementById('artenStatus'); if(e) e.textContent=s; }

  /* ═══ COLOR UTILS ═══ */
  function hexAlpha(hex, alpha) {
    var r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    return 'rgba('+r+','+g+','+b+','+alpha+')';
  }
  function lighten(hex, amt) {
    var r=Math.min(255,parseInt(hex.slice(1,3),16)+Math.round(amt*255));
    var g=Math.min(255,parseInt(hex.slice(3,5),16)+Math.round(amt*255));
    var b=Math.min(255,parseInt(hex.slice(5,7),16)+Math.round(amt*255));
    return '#'+[r,g,b].map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }
  function darken(hex, amt) {
    var r=Math.max(0,parseInt(hex.slice(1,3),16)-Math.round(amt*255));
    var g=Math.max(0,parseInt(hex.slice(3,5),16)-Math.round(amt*255));
    var b=Math.max(0,parseInt(hex.slice(5,7),16)-Math.round(amt*255));
    return '#'+[r,g,b].map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  }

  /* ═══ PUBLIC API ═══ */
  window.ArtenToggle = function() {
    var panel = document.getElementById('artenPanel');
    if (!panel) return;
    artenVisible = !artenVisible;
    panel.classList[artenVisible?'add':'remove']('open');
    if (window._firebaseAdmin) { isAdmin=true; setStatus('Admin Ready'); }
    if (artenVisible && _firstOpen) {
      _firstOpen = false;
      var aws = getArtworks();
      var avail = aws.filter(function(a){ return a.status !== 'sold'; }).length;
      var adminLine = isAdmin
        ? ' You have full admin access — I can open the dashboard, list orders, or manage artworks on your command.'
        : '';
      speak(tone(
        'I\'m Arten. I\'m built into this gallery — I know every work here, every price, every story.' +
          (avail ? ' There are currently ' + avail + ' pieces available.' : '') +
          ' Ask me about any artwork, commission process, or Lewis\'s journey.' + adminLine,
        'Arten online. ' + (avail ? avail + ' works available.' : 'All works currently sold.') +
          ' I can assist with artwork details, commissions, pricing, and artist background.' + adminLine,
        'I am Arten. The gallery breathes through me.' +
          (avail ? ' ' + avail + ' works are waiting for the right person.' : '') +
          ' Tell me what you\'re looking for — or what you feel — and I will find it.' + adminLine
      ));
    }
  };

  window.ArtenListen = function() {
    if (!recognition) { speak('Sorry, speech recognition isn\'t available in this browser. Please type your question below.'); return; }
    if (isSpeaking) { synth && synth.cancel(); isSpeaking=false; }
    if (isListening) { recognition.stop(); return; }
    try { recognition.start(); } catch(e){ setStatus('Ready'); }
  };

  window.ArtenSendText = function(override) {
    if (typeof override === 'string') {
      /* Called programmatically (e.g. from console test button) */
      if (!artenVisible) window.ArtenToggle();
      addBubble(override, 'user');
      matchIntent(override);
      return;
    }
    var inp = document.getElementById('artenTextInput');
    if (!inp || !inp.value.trim()) return;
    var t = inp.value.trim(); inp.value='';
    addBubble(t,'user');
    matchIntent(t);
  };

  /* ═══ INIT ═══ */
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',buildUI);
  else buildUI();

})();
