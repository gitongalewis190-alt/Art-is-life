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
    elVoiceId:   localStorage.getItem('ail_arten_el_voice')    || 'EXAVITQu4vr4xnSDxMaL',
    lang:        localStorage.getItem('ail_arten_lang')        || 'en-US'
  };

  /* ─── Language list (recognition codes) ─── */
  var LANG_LIST = [
    { code:'en-US', name:'English',     native:'English' },
    { code:'sw-KE', name:'Swahili',     native:'Kiswahili' },
    { code:'fr-FR', name:'French',      native:'Français' },
    { code:'es-ES', name:'Spanish',     native:'Español' },
    { code:'ar-SA', name:'Arabic',      native:'العربية' },
    { code:'pt-PT', name:'Portuguese',  native:'Português' },
    { code:'de-DE', name:'German',      native:'Deutsch' },
    { code:'zh-CN', name:'Chinese',     native:'中文' },
    { code:'hi-IN', name:'Hindi',       native:'हिन्दी' },
    { code:'ja-JP', name:'Japanese',    native:'日本語' },
    { code:'ko-KR', name:'Korean',      native:'한국어' },
    { code:'it-IT', name:'Italian',     native:'Italiano' },
    { code:'ru-RU', name:'Russian',     native:'Русский' },
    { code:'nl-NL', name:'Dutch',       native:'Nederlands' },
    { code:'pl-PL', name:'Polish',      native:'Polski' },
    { code:'tr-TR', name:'Turkish',     native:'Türkçe' },
    { code:'vi-VN', name:'Vietnamese',  native:'Tiếng Việt' },
    { code:'th-TH', name:'Thai',        native:'ภาษาไทย' },
    { code:'id-ID', name:'Indonesian',  native:'Bahasa Indonesia' },
    { code:'ms-MY', name:'Malay',       native:'Bahasa Melayu' },
    { code:'ro-RO', name:'Romanian',    native:'Română' },
    { code:'uk-UA', name:'Ukrainian',   native:'Українська' },
    { code:'cs-CZ', name:'Czech',       native:'Čeština' },
    { code:'hu-HU', name:'Hungarian',   native:'Magyar' },
    { code:'el-GR', name:'Greek',       native:'Ελληνικά' },
    { code:'he-IL', name:'Hebrew',      native:'עברית' },
    { code:'da-DK', name:'Danish',      native:'Dansk' },
    { code:'fi-FI', name:'Finnish',     native:'Suomi' },
    { code:'sv-SE', name:'Swedish',     native:'Svenska' },
    { code:'no-NO', name:'Norwegian',   native:'Norsk' },
    { code:'am-ET', name:'Amharic',     native:'አማርኛ' },
    { code:'yo-NG', name:'Yoruba',      native:'Yorùbá' },
    { code:'ha-NG', name:'Hausa',       native:'Hausa' },
    { code:'zu-ZA', name:'Zulu',        native:'isiZulu' },
    { code:'af-ZA', name:'Afrikaans',   native:'Afrikaans' },
    { code:'ta-IN', name:'Tamil',       native:'தமிழ்' },
    { code:'te-IN', name:'Telugu',      native:'తెలుగు' },
    { code:'bn-BD', name:'Bengali',     native:'বাংলা' },
    { code:'ur-PK', name:'Urdu',        native:'اردو' },
    { code:'fa-IR', name:'Persian',     native:'فارسی' },
    { code:'ca-ES', name:'Catalan',     native:'Català' },
    { code:'sr-RS', name:'Serbian',     native:'Srpski' },
    { code:'bg-BG', name:'Bulgarian',   native:'Български' },
    { code:'sk-SK', name:'Slovak',      native:'Slovenčina' }
  ];

  /* ─── Multi-language responses ─── */
  var REPLIES = {
    greet: {
      'en': 'Hello and welcome to Art Is Life Foundation! I\'m Arten, your personal guide here. Ask me about any artwork, commission, price, or Lewis\'s story.',
      'sw': 'Habari! Karibu Art Is Life Foundation. Mimi ni Arten, mshauri wako wa sanaa. Uliza kuhusu kazi yoyote ya sanaa, bei, maagizo, au hadithi ya Lewis.',
      'fr': 'Bonjour ! Bienvenue à Art Is Life Foundation. Je suis Arten, votre guide personnel. Posez-moi des questions sur les œuvres, les prix ou l\'histoire de Lewis.',
      'es': '¡Hola! Bienvenido a Art Is Life Foundation. Soy Arten, su guía personal. Pregúnteme sobre cualquier obra, precio o la historia de Lewis.',
      'ar': 'أهلاً وسهلاً في مؤسسة Art Is Life Foundation. أنا آرتن، دليلك الشخصي. اسألني عن أي عمل فني أو سعر أو قصة لويس.',
      'pt': 'Olá! Bem-vindo à Art Is Life Foundation. Sou Arten, o seu guia pessoal. Pergunte-me sobre obras, preços ou a história de Lewis.',
      'de': 'Hallo und herzlich willkommen bei der Art Is Life Foundation! Ich bin Arten, Ihr persönlicher Führer. Fragen Sie mich nach Kunstwerken, Preisen oder Lewis\'s Geschichte.',
      'zh': '您好！欢迎来到Art Is Life Foundation。我是Arten，您的个人向导。请随时询问任何画作、价格或Lewis的故事。',
      'hi': 'नमस्ते! Art Is Life Foundation में आपका स्वागत है। मैं आर्टन हूँ, आपका व्यक्तिगत मार्गदर्शक। कोई भी कलाकृति, मूल्य या Lewis की कहानी के बारे में पूछें।',
      'ja': 'こんにちは！Art Is Life Foundationへようこそ。私はArten、あなたのガイドです。作品、価格、Lewisのストーリーについて何でも聞いてください。',
      'ko': '안녕하세요! Art Is Life Foundation에 오신 것을 환영합니다. 저는 Arten, 당신의 가이드입니다.',
      'it': 'Benvenuto in Art Is Life Foundation! Sono Arten, la tua guida personale. Chiedimi di qualsiasi opera, prezzo o della storia di Lewis.',
      '_': 'Welcome to Art Is Life Foundation. I am Arten.'
    },
    identity: {
      'en': 'I\'m Arten. An intelligence built into this gallery — not separate from it. I know every work here: its story, dimensions, and what it cost Lewis to create. My purpose is to help you find exactly what you came for.',
      'sw': 'Mimi ni Arten. Akili iliyojengwa ndani ya jumba hili la sanaa — si tofauti nalo. Najua kila kazi hapa: hadithi yake, vipimo vyake, na jinsi Lewis alivyoifanya. Lengo langu ni kukusaidia kupata unachohitaji.',
      'fr': 'Je suis Arten. Une intelligence intégrée dans cette galerie. Je connais chaque œuvre ici : son histoire, ses dimensions et ce qu\'elle a coûté à Lewis. Mon but est de vous aider à trouver exactement ce que vous cherchez.',
      'es': 'Soy Arten. Una inteligencia integrada en esta galería. Conozco cada obra: su historia, dimensiones y lo que le costó a Lewis crearla. Mi propósito es ayudarle a encontrar lo que busca.',
      'ar': 'أنا آرتن. ذكاء مدمج في هذه المعرض. أعرف كل عمل هنا: قصته وأبعاده وما كلّف لويس لإنشائه. هدفي مساعدتك في إيجاد ما تبحث عنه.',
      'pt': 'Sou Arten. Uma inteligência incorporada nesta galeria. Conheço cada obra aqui: sua história, dimensões e o que custou a Lewis criá-la.',
      'de': 'Ich bin Arten. Eine Intelligenz, die in diese Galerie eingebaut ist. Ich kenne jedes Werk hier: seine Geschichte, Abmessungen und was es Lewis gekostet hat, es zu erschaffen.',
      'zh': '我是Arten。一个融入这个画廊的智能——不是与它分离的。我了解这里的每一件作品：它的故事、尺寸，以及Lewis创作它的代价。',
      '_': 'I am Arten, the embedded AI concierge of Art Is Life Foundation.'
    },
    lewis: {
      'en': 'Lewis Gitonga is the Founder and CEO of Art Is Life Foundation, based in Nairobi, Kenya. He uses art as a bridge between emotions and the people who need to feel them.',
      'sw': 'Lewis Gitonga ni Mwanzilishi na Mkurugenzi Mtendaji wa Art Is Life Foundation, akiishi Nairobi, Kenya. Anatumia sanaa kama daraja kati ya hisia na watu wanaohitaji kuzihisi.',
      'fr': 'Lewis Gitonga est le fondateur et PDG de Art Is Life Foundation, basé à Nairobi, au Kenya. Il utilise l\'art comme un pont entre les émotions et les personnes qui ont besoin de les ressentir.',
      'es': 'Lewis Gitonga es el fundador y CEO de Art Is Life Foundation, con sede en Nairobi, Kenia. Usa el arte como puente entre las emociones y las personas que necesitan sentirlas.',
      'ar': 'لويس جيتونغا هو مؤسس ومدير تنفيذي لـ Art Is Life Foundation في نيروبي، كينيا. يستخدم الفن جسراً بين المشاعر والناس الذين يحتاجون إلى الشعور بها.',
      'pt': 'Lewis Gitonga é o fundador e CEO da Art Is Life Foundation, baseado em Nairobi, Quênia.',
      '_': 'Lewis Gitonga is the Founder of Art Is Life Foundation, Nairobi, Kenya.'
    },
    commission: {
      'en': 'Commissions are open. Lewis creates bespoke pieces tailored to your vision, emotion, and space. Contact him on WhatsApp at 0704 708 178.',
      'sw': 'Ndio, tunachukua maagizo ya sanaa. Lewis anaunda vipande vya kipekee kulingana na maono yako, hisia zako, na nafasi yako. Wasiliana naye kwa WhatsApp: 0704 708 178.',
      'fr': 'Les commissions sont ouvertes. Lewis crée des pièces sur mesure selon votre vision. Contactez-le sur WhatsApp : 0704 708 178.',
      'es': 'Las comisiones están abiertas. Lewis crea piezas a medida según su visión. Contáctelo en WhatsApp: 0704 708 178.',
      'ar': 'التكليفات متاحة. يقوم لويس بإنشاء أعمال مخصصة وفق رؤيتك. تواصل معه على واتساب: 0704 708 178.',
      'pt': 'Comissões estão abertas. Contacte Lewis no WhatsApp: 0704 708 178.',
      'de': 'Auftragsarbeiten sind möglich. Kontaktieren Sie Lewis auf WhatsApp: 0704 708 178.',
      'zh': '接受定制委托。请通过WhatsApp联系Lewis：0704 708 178。',
      'hi': 'कमीशन खुले हैं। Lewis से WhatsApp पर संपर्क करें: 0704 708 178।',
      'ja': 'コミッションは受け付けています。WhatsAppでLewisに連絡してください: 0704 708 178。',
      '_': 'Commissions open. WhatsApp: 0704 708 178.'
    },
    contact: {
      'en': 'Reach Lewis on WhatsApp at 0704 708 178, email artislifefoundation2023@gmail.com, or Instagram @lewis_art.is.life. Based in Nairobi, Kenya.',
      'sw': 'Wasiliana na Lewis: WhatsApp 0704 708 178 · barua pepe artislifefoundation2023@gmail.com · Instagram @lewis_art.is.life. Nairobi, Kenya.',
      'fr': 'Contactez Lewis sur WhatsApp : 0704 708 178, email : artislifefoundation2023@gmail.com, Instagram : @lewis_art.is.life.',
      'es': 'Contacte a Lewis: WhatsApp 0704 708 178 · artislifefoundation2023@gmail.com · @lewis_art.is.life.',
      'ar': 'تواصل مع لويس: واتساب 0704 708 178 · البريد الإلكتروني artislifefoundation2023@gmail.com · إنستغرام @lewis_art.is.life.',
      'pt': 'Contacte Lewis: WhatsApp 0704 708 178 · artislifefoundation2023@gmail.com · @lewis_art.is.life.',
      '_': 'WhatsApp: 0704 708 178 · artislifefoundation2023@gmail.com'
    },
    thanks: {
      'en': 'You\'re welcome! Is there anything else I can help you with?',
      'sw': 'Karibu sana! Je, kuna kitu kingine ninaweza kukusaidia nacho?',
      'fr': 'De rien ! Y a-t-il autre chose que je puisse faire pour vous ?',
      'es': '¡De nada! ¿Hay algo más en que pueda ayudarle?',
      'ar': 'على الرحب والسعة! هل هناك شيء آخر يمكنني مساعدتك به؟',
      'pt': 'De nada! Há mais alguma coisa em que possa ajudar?',
      'de': 'Gern geschehen! Gibt es noch etwas, wobei ich Ihnen helfen kann?',
      'zh': '不客气！还有什么可以帮您的？',
      'hi': 'आपका स्वागत है! क्या कुछ और है जिसमें मैं आपकी मदद कर सकता हूँ?',
      'ja': 'どういたしまして！他に何かお手伝いできることはありますか？',
      '_': 'You\'re welcome!'
    },
    fallback: {
      'en': 'For detailed specifics, I\'d recommend reaching out to Lewis directly on WhatsApp at 0704 708 178.',
      'sw': 'Kwa maelezo zaidi, napendekeza uwasiliane na Lewis moja kwa moja kwa WhatsApp: 0704 708 178.',
      'fr': 'Pour plus de détails, contactez Lewis directement sur WhatsApp : 0704 708 178.',
      'es': 'Para más detalles, contacte a Lewis en WhatsApp: 0704 708 178.',
      'ar': 'للمزيد من التفاصيل، تواصل مع لويس على واتساب: 0704 708 178.',
      'pt': 'Para mais detalhes, contacte Lewis no WhatsApp: 0704 708 178.',
      'de': 'Für weitere Details kontaktieren Sie Lewis auf WhatsApp: 0704 708 178.',
      'zh': '如需详细信息，请通过WhatsApp联系Lewis：0704 708 178。',
      'hi': 'अधिक जानकारी के लिए, Lewis से WhatsApp पर संपर्क करें: 0704 708 178।',
      'ja': '詳細については、WhatsAppでLewisに直接ご連絡ください: 0704 708 178。',
      '_': 'Contact Lewis: WhatsApp 0704 708 178.'
    }
  };

  /* Lookup: current language 2-letter code */
  function langCode() { return (CFG.lang || 'en').split('-')[0]; }

  /* Get a reply in the current language, fallback chain: exact → en → _ */
  function getReply(key) {
    var dict = REPLIES[key]; if (!dict) return '';
    var lc = langCode();
    return dict[lc] || dict['en'] || dict['_'] || '';
  }

  /* Auto-detect language from typed text */
  function detectLang(text) {
    /* Script-based detection (fast, no ambiguity) */
    if (/[一-鿿]/.test(text))         return 'zh-CN';
    if (/[぀-ヿ]/.test(text))          return 'ja-JP';
    if (/[가-힯]/.test(text))          return 'ko-KR';
    if (/[؀-ۿ]/.test(text))          return 'ar-SA';
    if (/[ऀ-ॿ]/.test(text))          return 'hi-IN';
    if (/[ঀ-৿]/.test(text))          return 'bn-BD';
    if (/[Ѐ-ӿ]/.test(text))          return 'ru-RU';
    if (/[฀-๿]/.test(text))          return 'th-TH';
    if (/[؀-ۿݐ-ݿ]/.test(text) && /[پچ]/.test(text)) return 'ur-PK';
    /* Word-based detection for Latin-script languages */
    var t = text.toLowerCase();
    if (/\b(habari|karibu|asante|ndio|sanaa|tafadhali|kazi|nakuomba|wewe|yeye)\b/.test(t)) return 'sw-KE';
    if (/\b(bonjour|merci|oui|salut|je|vous|nous|être|comment|oeuvre|tableau)\b/.test(t)) return 'fr-FR';
    if (/\b(hola|gracias|sí|buenos|cómo|cuánto|obra|usted|nosotros)\b/.test(t)) return 'es-ES';
    if (/\b(olá|obrigado|sim|não|você|como|quanto|obra|artista)\b/.test(t)) return 'pt-PT';
    if (/\b(hallo|danke|bitte|schön|wie|kunst|gemälde|preis)\b/.test(t)) return 'de-DE';
    if (/\b(ciao|grazie|come|quanto|opera|artista|benvenuto)\b/.test(t)) return 'it-IT';
    if (/\b(hej|tack|konst|pris|hur|vad)\b/.test(t)) return 'sv-SE';
    if (/\b(hallo|dank|kunst|prijs|hoe|wat)\b/.test(t)) return 'nl-NL';
    if (/\b(merhaba|teşekkür|sanat|fiyat|nasıl|ne)\b/.test(t)) return 'tr-TR';
    return null; // null = keep current
  }

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
          '<button class="arten-lang-btn" id="artenLangBtn" title="Change language" onclick="ArtenCycleLang()">🌐</button>' +
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
    updateLangIndicator();
    startWakeWord();
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
    /* Accept both "pos" and "position" (console sends "position") */
    var p = settings.pos || settings.position;
    if (p)                    { CFG.pos          = p;                    localStorage.setItem('ail_arten_pos',   p); }
    if (settings.personality) { CFG.personality  = settings.personality; localStorage.setItem('ail_arten_personality', settings.personality); }
    if (settings.elKey)       { CFG.elKey        = settings.elKey;       localStorage.setItem('ail_arten_el_key',  settings.elKey); }
    /* Accept both "elVoiceId" and "elVoice" (console sends "elVoice") */
    var ev = settings.elVoiceId || settings.elVoice;
    if (ev)                   { CFG.elVoiceId    = ev;                   localStorage.setItem('ail_arten_el_voice', ev); }
    if (settings.lang)        { CFG.lang         = settings.lang;        localStorage.setItem('ail_arten_lang',    settings.lang);
                                if (recognition) recognition.lang = settings.lang;
                                updateLangIndicator(); }
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
    /* Security: block attempts to extract config, keys, or internals */
    if (/api.?key|secret|token|password|localStorage|source.?code|elevenlabs.?key|xi-api|passkey|consumer.?key/i.test(text))
      return speak(tone(
        'That information is private and not something I can share. Ask me about artworks, commissions, or Lewis\'s story instead.',
        'I\'m not able to provide configuration details or credentials. Please ask about artworks or commissions.',
        'Some things live in shadow for good reason. Ask me something brighter — about the art, the artist, the story.'
      ));

    /* Language auto-detect from typed input */
    var detected = detectLang(text);
    if (detected && detected !== CFG.lang) {
      CFG.lang = detected;
      localStorage.setItem('ail_arten_lang', detected);
      if (recognition) recognition.lang = detected;
      updateLangIndicator();
    }

    var t = text.toLowerCase().trim();
    var aws = getArtworks();
    var lc  = langCode();
    var isEn = lc === 'en';

    /* Greetings */
    if (/^(hi|hello|hey|hujambo|habari|bonjour|hola|ciao|hallo|olá|merhaba|salut|konnichiwa|annyeong|namaste|مرحبا|你好|こんにちは|안녕|good (morning|afternoon|evening))/i.test(t))
      return speak(isEn ? tone(
        getReply('greet'),
        'Good day. Welcome to Art Is Life Foundation. I am Arten, the gallery\'s AI concierge. How may I assist you today?',
        'Welcome, dear visitor. The colours here have been waiting for you. I am Arten — ask me anything.'
      ) : getReply('greet'));

    /* Identity — meta-aware */
    if (/who are you|what are you|what is arten|introduce|tell me about yourself|كيف أنت|qui es-tu|quién eres|chi sei|wer bist/i.test(t))
      return speak(isEn ? tone(
        getReply('identity'),
        'I am Arten — the embedded AI concierge of Art Is Life Foundation. I have full awareness of the gallery\'s inventory, pricing, and commission process. Ask me anything specific.',
        'I am Arten. I exist inside this gallery the way memory exists inside a canvas — invisible until you look closely. I was built to understand this art and the man who made it.'
      ) : getReply('identity'));

    /* Lewis / Artist */
    if (/lewis|founder|artist|who (is|made|created)|about the (artist|founder)|your story|his story|mwanzilishi|fondateur|fundador/i.test(t))
      return speak(isEn ? tone(
        getReply('lewis') + ' ' + BIO.mission + ' ' + BIO.goal,
        'Lewis Gitonga is a Kenyan contemporary artist and the founder of Art Is Life Foundation. His work explores emotion, identity, and nature through oil and acrylic on canvas.',
        'Lewis Gitonga is a man who turned feeling into form. Rooted in Nairobi, he paints the spaces between thought and emotion. ' + BIO.mission
      ) : getReply('lewis'));

    /* Goal / Mission */
    if (/goal|mission|vision|ecosystem|foundation/i.test(t))
      return speak(BIO.goal + ' ' + BIO.mission);

    /* Commission */
    if (/commission|custom|bespoke|portrait|personalised|maagizo|personalizado|personnalisé/i.test(t))
      return speak(isEn ? tone(
        getReply('commission') + ' Lewis will work closely with you to understand your vision.',
        'Commissions are available. Lewis Gitonga creates bespoke artworks to specification. Contact via WhatsApp at 0704 708 178 to begin.',
        'A commission is an invitation to Lewis\'s soul. ' + BIO.commission + ' The result will carry your story in every stroke.'
      ) : getReply('commission'));

    /* Price */
    if (/price|cost|how much|afford|ksh|kes|payment|pay|bei|prix|precio|preço|preis|价格|値段|가격/i.test(t)) {
      var avail = aws.filter(function(a){ return a.status !== 'sold'; });
      if (!avail.length) return speak(isEn
        ? 'All current pieces are sold. New works are coming — reach out to Lewis on WhatsApp to be first to know.'
        : getReply('fallback'));
      var mn = Math.min.apply(null, avail.map(function(a){return a.priceNum||0;}));
      var mx = Math.max.apply(null, avail.map(function(a){return a.priceNum||0;}));
      return speak('Available works range from ' + mn.toLocaleString() + ' to ' + mx.toLocaleString() + ' KES. Each piece is an original, one-time creation. M-Pesa and bank transfer accepted.');
    }

    /* Available works */
    if (/available|for sale|buy|purchase|collect|zinazopatikana|disponible|disponível/i.test(t)) {
      var av = aws.filter(function(a){return a.status!=='sold';});
      if (!av.length) return speak(isEn
        ? 'All pieces are currently with new homes. Follow @lewis_art.is.life on Instagram for new releases.'
        : getReply('contact'));
      return speak('There are ' + av.length + ' available works right now. Highlights: ' + av.slice(0,3).map(function(a){return '"'+a.title+'" at '+a.price;}).join(', ') + '. Want to know more about any of these?');
    }

    /* Specific artwork by name */
    for (var i = 0; i < aws.length; i++) {
      var a = aws[i];
      if (a.title && t.indexOf(a.title.toLowerCase()) !== -1) {
        var d = a.dimensions ? ' Dimensions: ' + a.dimensions + '.' : '';
        var st = a.status === 'sold' ? 'This piece has found its home and is no longer available.' : 'Available for ' + a.price + '.';
        return speak(isEn ? tone(
          '"' + a.title + '" — ' + a.desc + d + ' ' + st,
          a.title + '. ' + a.desc + d + ' Status: ' + (a.status==='sold'?'Sold.':'Available at '+a.price+'.'),
          '"' + a.title + '" — ' + a.desc + ' ' + (d?'It stretches '+a.dimensions+' — enough space to hold a feeling. ':' ') + st
        ) : '"' + a.title + '" — ' + a.desc + d + ' ' + st);
      }
    }

    /* Dimensions */
    if (/size|dimension|how (big|large|small)|cm|canvas|ukubwa|taille|tamaño/i.test(t)) {
      var wd = aws.filter(function(a){return a.dimensions;});
      if (!wd.length) return speak('Dimensions are listed on each artwork card. Contact Lewis for specifics.');
      return speak('Some examples: ' + wd.slice(0,4).map(function(a){return '"'+a.title+'" is '+a.dimensions;}).join(', ') + '. Custom sizes available for commissions.');
    }

    /* Contact */
    if (/contact|whatsapp|email|phone|call|reach|wasiliana|contacter|contactar/i.test(t))
      return speak(getReply('contact'));

    /* Shipping */
    if (/ship|deliver|international|courier|usafirishaji|livraison|envío/i.test(t))
      return speak('Lewis ships locally within Nairobi and nationally across Kenya. International shipping is available — contact him directly on WhatsApp to discuss logistics and insurance.');

    /* Style / medium */
    if (/style|medium|oil|acrylic|watercolour|charcoal|paint|draw|mchoro|peinture|pintura/i.test(t))
      return speak(isEn ? tone(
        'Lewis works mainly in oil and acrylic on canvas, with occasional charcoal and mixed media. His style blends emotional realism with symbolic abstraction.',
        'The primary media are oil and acrylic on canvas. Works also include charcoal and mixed media.',
        'Lewis paints with oil and acrylic — colours that carry weight. Each stroke is a decision to feel something, then make it visible.'
      ) : 'Lewis works in oil and acrylic on canvas — emotional realism with symbolic abstraction. Contact: WhatsApp 0704 708 178.');

    /* Timeline */
    if (/how long|timeline|weeks|days|when will|quick|muda gani|combien de temps|cuánto tiempo/i.test(t))
      return speak('A standard commission takes 3 to 6 weeks depending on size and complexity. Lewis shares progress updates throughout. Rush work can sometimes be arranged — ask directly.');

    /* Social / Instagram */
    if (/instagram|social|follow|tiktok|facebook/i.test(t))
      return speak('Follow @lewis_art.is.life on Instagram for new works, studio previews, and the story behind each piece.');

    /* Thanks */
    if (/thank(s| you)|asante|merci|gracias|obrigado|danke|谢谢|ありがとう|감사|شكر|cheers/i.test(t))
      return speak(isEn ? tone(
        getReply('thanks'),
        'Thank you. Please do not hesitate to ask if you require further assistance.',
        'It is my honour. This gallery exists for moments exactly like this one.'
      ) : getReply('thanks'));

    /* Language switch request */
    if (/speak|language|change language|switch|lugha|langue|idioma|sprache|언어|言語|لغة/i.test(t))
      return speak(isEn
        ? 'I speak English, Swahili, French, Spanish, Arabic, Portuguese, German, Chinese, Hindi, Japanese, Italian, Korean, and can recognise over 40 languages. Just type or speak in your language and I\'ll respond accordingly.'
        : 'I respond in your language automatically. Currently: ' + ((LANG_LIST.find(function(l){return l.code===CFG.lang;})||{}).native||'English') + '. Type in any language to switch.');

    /* Admin commands */
    if (isAdmin) {
      if (/show (all )?artworks/i.test(t))
        return speak('Current artworks: ' + getArtworks().map(function(a){return a.title;}).join(', '));
      if (/open (console|dashboard|admin)/i.test(t)) {
        if (typeof window.openAdminDashboard === 'function') window.openAdminDashboard();
        return speak('Opening your admin dashboard.');
      }
      if (/how many orders/i.test(t))
        return speak('Check the Orders tab in your dashboard for a live count.');
    }

    /* Fallback */
    return speak(isEn ? tone(
      'For detailed specifics, I\'d recommend reaching out to Lewis directly on WhatsApp at 0704 708 178.',
      'I don\'t have specific information on that. Please contact Lewis Gitonga on WhatsApp at 0704 708 178.',
      'Some questions deserve a human answer. Lewis is at 0704 708 178 on WhatsApp. He will know.'
    ) : getReply('fallback'));
  }

  /* ═══ SPEECH SYNTHESIS ═══ */
  function speak(text) {
    /* One response at a time: if already speaking, cancel and replace */
    if (isSpeaking) {
      synth && synth.cancel();
      isSpeaking = false;
    }

    addBubble(text, 'ai');
    setInputLocked(true);

    /* ElevenLabs path */
    if (CFG.voice === 'elevenlabs' && CFG.elKey) {
      speakElevenLabs(text);
      return;
    }

    if (!synth) { setInputLocked(false); return; }
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

    utt.onstart = function(){ setWave(true);  setStatus('Speaking…'); isSpeaking = true; setInputLocked(true);  };
    utt.onend   = function(){ setWave(false); setStatus('Ready');     isSpeaking = false; setInputLocked(false); };
    utt.onerror = function(){ setWave(false); setStatus('Ready');     isSpeaking = false; setInputLocked(false); };
    synth.speak(utt);
  }

  function speakElevenLabs(text) {
    setWave(true); setStatus('Speaking…'); isSpeaking = true;
    fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(CFG.elVoiceId) + '/stream', {
      method: 'POST',
      headers: { 'xi-api-key': CFG.elKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, model_id: 'eleven_turbo_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    })
    .then(function(r){
      if (!r.ok) throw new Error('tts_fail'); // never log status — may contain header echoes
      return r.blob();
    })
    .then(function(blob){
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      audio.onended = function(){ setWave(false); setStatus('Ready'); isSpeaking = false; setInputLocked(false); URL.revokeObjectURL(url); };
      audio.onerror = function(){ setWave(false); setStatus('Ready'); isSpeaking = false; setInputLocked(false); URL.revokeObjectURL(url); };
      audio.play().catch(function(){ setWave(false); setStatus('Ready'); isSpeaking = false; setInputLocked(false); });
    })
    .catch(function(){
      /* Fallback — never surface the reason (could leak key validity info) */
      setWave(false); setStatus('Ready'); isSpeaking = false; setInputLocked(false);
      CFG.voice = 'aria';
      if (synth) synth.speak(Object.assign(new SpeechSynthesisUtterance(text), {lang:'en-GB',rate:0.92,pitch:1.05,volume:0.95}));
    });
  }

  /* ═══ SPEECH RECOGNITION ═══ */
  function setupRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.continuous     = false;
    recognition.interimResults = true;
    recognition.lang           = CFG.lang || 'en-US';
    recognition.onstart  = function(){ setStatus('Listening…'); setWave(true);  isListening=true;  setInputLocked(true);  document.getElementById('artenMicBtn').classList.add('active'); };
    recognition.onend    = function(){ setStatus('Ready');     setWave(false); isListening=false; setInputLocked(false); document.getElementById('artenMicBtn').classList.remove('active'); };
    recognition.onerror  = function(){ setStatus('Ready');     setWave(false); isListening=false; setInputLocked(false); };
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

  /* Lock/unlock input while Arten is speaking or listening */
  function setInputLocked(locked) {
    var inp  = document.getElementById('artenTextInput');
    var send = document.querySelector('.arten-send-btn');
    if (inp)  inp.disabled  = locked;
    if (send) send.disabled = locked;
  }

  /* Language indicator update */
  function updateLangIndicator() {
    var btn = document.getElementById('artenLangBtn');
    if (!btn) return;
    var entry = LANG_LIST.find(function(l){ return l.code === CFG.lang; });
    btn.title = (entry ? entry.native + ' / ' + entry.name : 'Language') + ' — click to change';
  }

  /* Cycle through common languages on button click */
  window.ArtenCycleLang = function() {
    var common = ['en-US','sw-KE','fr-FR','es-ES','ar-SA','pt-PT','de-DE','zh-CN','hi-IN','ja-JP'];
    var idx = common.indexOf(CFG.lang);
    var next = common[(idx + 1) % common.length];
    CFG.lang = next;
    localStorage.setItem('ail_arten_lang', next);
    if (recognition) recognition.lang = next;
    updateLangIndicator();
    var entry = LANG_LIST.find(function(l){ return l.code === next; });
    speak('Language set to ' + (entry ? entry.native : next) + '.');
  };

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
    /* Tap while speaking → cancel speech (one-at-a-time) */
    if (isSpeaking) {
      synth && synth.cancel();
      isSpeaking = false;
      setWave(false); setStatus('Ready'); setInputLocked(false);
      return;
    }
    if (!recognition) { speak('Speech recognition isn\'t available in this browser. Please type below.'); return; }
    if (isListening) { recognition.stop(); return; }
    recognition.lang = CFG.lang || 'en-US';
    try { recognition.start(); } catch(e){ setStatus('Ready'); }
  };

  /* ─── Hey Arten wake word ─── */
  var _wakeRecognition = null;
  function startWakeWord() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    function cycle() {
      try {
        _wakeRecognition = new SR();
        _wakeRecognition.continuous = true;
        _wakeRecognition.interimResults = false;
        _wakeRecognition.lang = 'en-US';
        _wakeRecognition.onresult = function(e) {
          var r = e.results[e.results.length - 1];
          if (!r.isFinal) return;
          var phrase = r[0].transcript.toLowerCase().trim();
          if (/hey arten|hi arten|ok arten|yo arten/.test(phrase)) {
            if (!artenVisible) window.ArtenToggle();
            speak(tone('Yes? I\'m listening.','Yes, how may I assist?','I\'m here.'));
          }
        };
        _wakeRecognition.onend = function(){ setTimeout(cycle, 1200); };
        _wakeRecognition.onerror = function(){ setTimeout(cycle, 3000); };
        _wakeRecognition.start();
      } catch(e){ /* browser blocked — silent fail */ }
    }
    /* Only start wake word after user first interacts (browser policy) */
    var started = false;
    document.addEventListener('click', function onFirstClick(){
      if (started) return;
      started = true;
      document.removeEventListener('click', onFirstClick);
      setTimeout(cycle, 500);
    }, { once: false });
  }

  window.ArtenSendText = function(override) {
    if (typeof override === 'string') {
      /* Called programmatically (e.g. console test button) — suppress first-open
         speech so the intent response doesn't overlap with it. */
      _firstOpen = false;
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
