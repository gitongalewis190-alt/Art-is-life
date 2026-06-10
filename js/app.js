
/* ═══════════════════════════════

   APP NAMESPACE (additive)

═══════════════════════════════ */

window.App = window.App || {};

/* ═══════════════════════════════

   ARTWORK DATA (local fallback)

═══════════════════════════════ */

const LOCAL_ARTWORKS = [

  {id:'0',  title:"Resonant Rhythms",         price:"800 KES",  priceNum:800,  image:"resonant.jpg",       desc:"Emotional frequency and the language of nature — a piece that vibrates with feeling.",status:"available"},

  {id:'1',  title:"Dawn of the Gentle Giant", price:"700 KES",  priceNum:700,  image:"giant.jpg",           desc:"Wisdom and strength emerging from the first light. A meditation on quiet power.",status:"available"},

  {id:'2',  title:"The Sovereign Silence",    price:"650 KES",  priceNum:650,  image:"sovereign.jpg",       desc:"Identity found in stillness. The dignity of being fully, quietly oneself.",status:"available"},

  {id:'3',  title:"Kinship of the Canopy",    price:"600 KES",  priceNum:600,  image:"canopy.jpg",          desc:"Nature's belonging — the way trees hold one another without ever touching.",status:"available"},

  {id:'4',  title:"Solace in Grey",           price:"1000 KES", priceNum:1000, image:"solace.jpg",          desc:"Emotional refuge in the spaces between certainty. Rest for the searching soul.",status:"available"},

  {id:'5',  title:"Resilience",               price:"900 KES",  priceNum:900,  image:"resilience.jpg",      desc:"Strength carved through pain. The beauty of something that refused to break.",status:"available"},

  {id:'6',  title:"Kingship & Kindness",      price:"1500 KES", priceNum:1500, image:"kingship.jpg",        desc:"Leadership with empathy — the crown that feels heaviest when worn with care.",status:"available"},

  {id:'7',  title:"Chic & Shadow",            price:"1200 KES", priceNum:1200, image:"chic_shadow.jpg",     desc:"Identity duality — the light and dark that both belong to one extraordinary person.",status:"available"},

  {id:'8',  title:"Neck to Neck",             price:"1100 KES", priceNum:1100, image:"neck_to_neck.jpg",    desc:"Emotional balance between two forces — competition, love, and the space between.",status:"available"},

  {id:'9',  title:"Joyful Blooms",            price:"1000 KES", priceNum:1000, image:"joyful_blooms.jpg",   desc:"Growth and renewal in full colour. The moment a seed decides to become its destiny.",status:"available"},

  {id:'10', title:"Sunset Nomad",             price:"1300 KES", priceNum:1300, image:"sunset_nomad.jpg",    desc:"Endings and beginnings in the same breath. The freedom of always moving forward.",status:"available"},

  {id:'11', title:"Color of Light",           price:"1400 KES", priceNum:1400, image:"color_of_light.jpg",  desc:"Hope rendered visible. Clarity arriving like morning through a dusty window.",status:"available"}

];

// Active artworks — populated from Firestore or fallback

let artworks = [...LOCAL_ARTWORKS];

const CONTACT = { waNum:'254704708178', phone:'0704708178', email:'artislifefoundation2023@gmail.com' };

let cart                      = JSON.parse(localStorage.getItem('ail_cart')  || '[]');

let likes                     = JSON.parse(localStorage.getItem('ail_likes') || '[]');

let storyLiked                = localStorage.getItem('ail_story_liked') === '1';

let currentOrderIndex         = null;

let selectedChannel           = 'wa';

let selectedCommissionChannel = 'wa';

let currentSearch             = '';

let uploadedImageUrl          = '';

let _lastUid                  = '';

let currentCommentTarget      = null; // { id, title }

let _commentUnsubscribe       = null;

const saveCart  = () => localStorage.setItem('ail_cart',  JSON.stringify(cart));

/* ══ REAL-TIME SYNC LISTENERS ══ */

window.addEventListener('artworks_updated', () => {

  const firestoreArts = window._firestoreArtworks || [];

  console.log(`🔄 artworks_updated fired — Firestore items: ${firestoreArts.length}`);

  if (firestoreArts.length > 0) {

    // New artworks (Firestore) appear at TOP. Local artworks that are NOT in Firestore go below.

    const fsIds = new Set(firestoreArts.map(a => a.id));

    const localOnly = LOCAL_ARTWORKS.filter(a => !fsIds.has(a.id));

    artworks = [...firestoreArts, ...localOnly];

  } else {

    artworks = [...LOCAL_ARTWORKS];

  }

  renderGallery(currentSearch);

  const count = artworks.length;

  document.getElementById('heroWorkCount').textContent = count;

  document.getElementById('aboutBadgeNum').textContent = count;

  console.log(`🔄 Gallery updated — total ${count} artworks`);

});

window.addEventListener('likes_updated', () => {

  // ⚡ PERFORMANCE FIX: only update like-count nodes per card — no full gallery re-render
  const counts = window._firestoreLikeCounts || {};

  document.querySelectorAll('.art-card').forEach(card => {

    const likeBtn = card.querySelector('.like-btn');

    if (!likeBtn) return;

    const onclickAttr = likeBtn.getAttribute('onclick') || '';

    const match = onclickAttr.match(/toggleLike\('([^']+)'\)/);

    if (!match) return;

    const artId = match[1];

    const lc = counts[String(artId)] || 0;

    let lcEl = card.querySelector('.art-like-count');

    if (lc > 0) {

      if (!lcEl) {

        lcEl = document.createElement('div');

        lcEl.className = 'art-like-count';

        const artInfo = card.querySelector('.art-info');

        if (artInfo) artInfo.appendChild(lcEl);

      }

      lcEl.innerHTML = `<svg viewBox="0 0 24 24" fill="#e05252" stroke="#e05252" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${lc} like${lc!==1?'s':''}`;

    } else if (lcEl) {

      lcEl.remove();

    }

  });

  updateStoryLikeCount();

});

/* TOAST */

let toastTimer;

function showToast(msg) {

  const t = document.getElementById('toast');

  t.textContent = msg;

  t.classList.add('show');

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);

}

/* ══ HAMBURGER MENU ══ */

function toggleHamburger() {

  const btn = document.getElementById('hamburgerBtn');

  const menu = document.getElementById('hamburgerMenu');

  btn.classList.toggle('open');

  menu.classList.toggle('open');

}

function closeHamburger() {

  document.getElementById('hamburgerBtn').classList.remove('open');

  document.getElementById('hamburgerMenu').classList.remove('open');

}

/* NAV */

function toggleNav() { document.getElementById('headerNav').classList.toggle('open'); }

function scrollToGallery() { document.getElementById('gallery-section').scrollIntoView({behavior:'smooth'}); }

/* ══ IMAGE ZOOM (all images) ══ */

function openZoom(src, caption) {

  const overlay = document.getElementById('imgZoomOverlay');

  document.getElementById('zoomImg').src = src;

  document.getElementById('zoomCaption').textContent = caption || '';

  overlay.classList.add('active');

  document.body.style.overflow = 'hidden';

  track('image_zoom', {src});

}

function closeZoom() {

  document.getElementById('imgZoomOverlay').classList.remove('active');

  document.body.style.overflow = '';

}

/* ══ resolveImage ══ */
function resolveImage(image) {
  if (!image) return 'placeholder.jpg';
  if (typeof image !== 'string') return 'placeholder.jpg';
  const trimmed = image.trim();
  if (!trimmed) return 'placeholder.jpg';
  if (trimmed.startsWith('http')) return trimmed;
  if (trimmed.startsWith('images/')) return trimmed.substring(7);
  return trimmed;
}

/* ══ GALLERY RENDER ══ */

function getLikeCount(id) {

  const counts = window._firestoreLikeCounts || {};

  return counts[String(id)] || 0;

}

function renderGallery(filter) {

  console.log(`🖼️ renderGallery called — artworks: ${artworks.length}, filter: "${filter||''}"`);

  const grid = document.getElementById('gallery');

  const term = (filter||'').toLowerCase().trim();

  const filtered = artworks.filter(a =>

    !term || a.title.toLowerCase().includes(term) || a.desc.toLowerCase().includes(term) || (a.price||'').toLowerCase().includes(term)

  );

  document.getElementById('galleryCount').textContent =

    filtered.length === artworks.length ? `${artworks.length} works` : `${filtered.length} of ${artworks.length} works`;

  if (!filtered.length) {

    grid.innerHTML = `<div class="no-results"><div class="no-results-icon">🖼️</div><h3>No artworks found</h3><p>Try a different search.</p><button onclick="clearSearch()">Show All Works</button></div>`;

    return;

  }

  grid.innerHTML = filtered.map((a,i) => {

    const isLiked = likes.includes(String(a.id)) || likes.includes(a.id);

    const likeCount = getLikeCount(a.id);

    const status = a.status || 'available';

    const badge = status === 'sold'

      ? `<div class="badge-sold">✦ Sold</div>`

      : status === 'featured'

      ? `<div class="badge-featured">✦ Featured</div>`

      : `<div class="badge-available">✦ Available</div>`;

    const imgSrc = resolveImage(a.image);

    return `

    <div class="art-card" style="animation-delay:${i*0.06}s">

      <div class="art-img-wrap" onclick="openZoom('${imgSrc}','${a.title.replace(/'/g,"\\'")}')">

        <img src="${imgSrc}" alt="${a.title}" loading="lazy" onerror="this.src='placeholder.jpg';this.style.minHeight='270px';this.alt='Image unavailable'">

        <div class="art-img-overlay">

          <div class="art-zoom-icon">

            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>

          </div>

        </div>

        ${badge}

      </div>

      <div class="art-info">

        <div class="art-title-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">

          <div class="art-title" style="flex:1;">${a.title}</div>

          <button class="like-btn${isLiked?' liked':''}" onclick="event.stopPropagation();toggleLike('${a.id}')" title="${isLiked?'Unlike':'Like'}" aria-label="${isLiked?'Unlike':'Like'}" style="flex-shrink:0;">

            <svg viewBox="0 0 24 24" fill="${isLiked?'#e05252':'none'}" stroke="${isLiked?'#e05252':'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>

          </button>

        </div>

        <div class="art-price">${a.price}</div>

        <div class="art-desc">${a.desc}</div>

        ${likeCount > 0 ? `<div class="art-like-count"><svg viewBox="0 0 24 24" fill="#e05252" stroke="#e05252" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>${likeCount} like${likeCount!==1?'s':''}</div>` : ''}

      </div>

      <div class="art-actions">

        <button class="art-btn art-btn-order" onclick="openOrder('${a.id}')">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>

          Order This

        </button>

        <button class="art-btn art-btn-cart" onclick="addToCart('${a.id}')">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg>

          Cart

        </button>

        <button class="art-btn art-btn-call" onclick="callGallery('${a.title.replace(/'/g,"\\'")}')">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013 11.66a19.79 19.79 0 01-3.07-8.67A2 2 0 011.91 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>

          Call

        </button>

      </div>

    </div>`;

  }).join('');

  track('gallery_render', {count:filtered.length, filter:term});

}

function handleSearch(val) {

  currentSearch = val;

  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));

  document.querySelector('.filter-chip').classList.add('active');

  if(val) track('search_used',{query:val});

  renderGallery(val);

}

function applyFilter(btn, term) {

  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));

  btn.classList.add('active');

  document.getElementById('searchInput').value = term;

  currentSearch = term;

  renderGallery(term);

}

function clearSearch() {

  document.getElementById('searchInput').value = '';

  currentSearch = '';

  document.querySelectorAll('.filter-chip').forEach((c,i) => c.classList.toggle('active', i===0));

  renderGallery('');

}

/* ══ LIKES (Firestore-backed) ══ */

function triggerHeartBounce(id) {

  const btn = document.querySelector(`.like-btn[onclick*="'${id}'"]`);

  if (!btn) return;

  const rect = btn.getBoundingClientRect();

  const cx = rect.left + rect.width / 2;

  const cy = rect.top + rect.height / 2;

  const el = document.createElement('div');

  el.className = 'heart-bounce-overlay';

  el.textContent = '❤';

  el.style.left = cx + 'px';

  el.style.top = cy + 'px';

  document.body.appendChild(el);

  setTimeout(() => el.remove(), 1500);

}

async function toggleLike(id) {

  const sid = String(id);

  const wasLiked = likes.includes(sid) || likes.includes(id);

  if (wasLiked) {

    likes = likes.filter(l => l !== sid && l !== id);

    showToast('💔 Removed from favourites');

  } else {

    likes.push(sid);

    triggerHeartBounce(sid);

    showToast('❤️ Added to favourites');

    track('like_clicked', {artwork_id: id});

  }

  localStorage.setItem('ail_likes', JSON.stringify(likes));

  // Update ONLY the like button — no full gallery re-render (prevents page shake/reflow)

  const btn = document.querySelector(`.like-btn[onclick*="'${sid}'"]`);

  if (btn) {

    const nowLiked = likes.includes(sid);

    btn.classList.toggle('liked', nowLiked);

    const svg = btn.querySelector('svg');

    if (svg) {

      svg.setAttribute('fill', nowLiked ? '#e05252' : 'none');

      svg.setAttribute('stroke', nowLiked ? '#e05252' : 'currentColor');

    }

    btn.title = nowLiked ? 'Unlike' : 'Like';

    btn.setAttribute('aria-label', nowLiked ? 'Unlike' : 'Like');

    btn.style.transform = 'scale(1.35)';

    setTimeout(() => { btn.style.transform = ''; }, 200);

  }

  // Sync to Firestore

  if (window.toggleLikeFirestore) {

    window.toggleLikeFirestore(sid).catch(e => console.warn('Like sync error:', e));

  }

}

/* ══ STORY LIKE ══ */

function updateStoryLikeCount() {

  const counts = window._firestoreLikeCounts || {};

  const count = counts['story'] || 0;

  document.getElementById('storyLikeCount').textContent = count;

}

function toggleStoryLike() {

  storyLiked = !storyLiked;

  localStorage.setItem('ail_story_liked', storyLiked ? '1' : '0');

  const btn = document.getElementById('storyLikeBtn');

  const icon = document.getElementById('storyLikeIcon');

  if (storyLiked) {

    btn.classList.add('liked');

    icon.setAttribute('fill', '#e05252');

    icon.setAttribute('stroke', '#e05252');

    showToast('❤️ You liked the story!');

    icon.style.animation = 'heartBeat 0.6s ease';

    setTimeout(() => icon.style.animation = '', 600);

    if (window.toggleLikeFirestore) window.toggleLikeFirestore('story');

  } else {

    btn.classList.remove('liked');

    icon.setAttribute('fill', 'none');

    icon.setAttribute('stroke', 'currentColor');

    if (window.toggleLikeFirestore) window.toggleLikeFirestore('story');

  }

}

/* ══ COMMENT SYSTEM ══ */

function openStoryComments() {

  currentCommentTarget = { id: 'story', title: 'The Untold Canvas — My Origin' };

  openCommentModal();

}

function openCommentModal() {

  if (!currentCommentTarget) return;

  document.getElementById('commentModalTitle').textContent = 'Comments';

  document.getElementById('commentModalSub').textContent = currentCommentTarget.title;

  document.getElementById('commentInput').value = '';

  document.getElementById('commentModal').classList.add('active');

  document.body.style.overflow = 'hidden';

  loadComments();

}

function closeCommentModal() {

  document.getElementById('commentModal').classList.remove('active');

  document.body.style.overflow = '';

  if (_commentUnsubscribe) { _commentUnsubscribe(); _commentUnsubscribe = null; }

}

function loadComments() {

  if (!currentCommentTarget) return;

  const list = document.getElementById('commentList');

  list.innerHTML = '<div class="comment-empty" style="color:var(--muted)">Loading…</div>';

  if (window.startCommentsSync) {

    if (_commentUnsubscribe) _commentUnsubscribe();

    _commentUnsubscribe = window.startCommentsSync(currentCommentTarget.id, (comments) => {

      renderComments(comments);

      const sub = document.getElementById('commentModalSub');

      if (sub && currentCommentTarget) {

        sub.textContent = `${currentCommentTarget.title} · ${comments.length} comment${comments.length!==1?'s':''}`;

      }

      // Update count on about section

      document.getElementById('storyCommentCount').textContent = comments.length;

    });

  } else {

    list.innerHTML = '<div class="comment-empty">Comments unavailable offline.</div>';

  }

}

function renderComments(comments) {

  const list = document.getElementById('commentList');

  if (!comments.length) {

    list.innerHTML = '<div class="comment-empty">No comments yet. Be the first!</div>';

    return;

  }

  list.innerHTML = comments.map(c => {

    const time = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString('en-KE', {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';

    return `<div class="comment-item">

      <div class="comment-item-author">${escapeHtml(c.author || 'Visitor')}</div>

      <div class="comment-item-text">${escapeHtml(c.text || '')}</div>

      ${time ? `<div class="comment-item-time">${time}</div>` : ''}

    </div>`;

  }).join('');

  list.scrollTop = list.scrollHeight;

}

async function submitComment() {

  const input = document.getElementById('commentInput');

  const text = input.value.trim();

  if (!text || !currentCommentTarget) return;

  if (text.length < 2) { showToast('⚠️ Comment too short'); return; }

  input.value = '';

  if (window.saveCommentFirestore) {

    const ok = await window.saveCommentFirestore(currentCommentTarget.id, text);

    if (!ok) showToast('❌ Could not post comment');

  } else {

    showToast('💬 Comment feature requires Firebase');

  }

}

function escapeHtml(str) {

  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

}

/* ══ CART ══ */

function addToCart(id) {

  const art = artworks.find(a => String(a.id) === String(id));

  if (!art) return;

  const existing = cart.find(c => String(c.id) === String(id));

  if (existing) { existing.qty = (existing.qty || 1) + 1; saveCart(); updateCartCount(); renderCartDrawer(); showToast(`"${art.title}" qty updated`); return; }

  cart.push({id: String(art.id), title: art.title, price: art.price, priceNum: art.priceNum, qty: 1});

  saveCart(); updateCartCount();

  track('cart_add', {artwork_id: id, title: art.title});

  showToast(`🛒 "${art.title}" added to cart`);

}

function removeFromCart(id) {

  cart = cart.filter(c => String(c.id) !== String(id));

  saveCart(); updateCartCount(); renderCartDrawer();

}

function cartIncreaseQty(id) {

  const item = cart.find(c => String(c.id) === String(id));

  if (!item) return;

  item.qty = (item.qty || 1) + 1;

  saveCart(); updateCartCount(); renderCartDrawer();

}

function cartDecreaseQty(id) {

  const item = cart.find(c => String(c.id) === String(id));

  if (!item) return;

  if ((item.qty || 1) <= 1) { removeFromCart(id); return; }

  item.qty = item.qty - 1;

  saveCart(); updateCartCount(); renderCartDrawer();

}

function clearCart() {

  if (!cart.length) return;

  cart = [];

  saveCart(); updateCartCount(); renderCartDrawer();

  showToast('🗑️ Cart cleared');

}

function updateCartCount() {

  const el = document.getElementById('cartCount');

  el.textContent = cart.length;

  el.style.transform = 'scale(1.3)';

  setTimeout(() => el.style.transform = '', 250);

}

function renderCartDrawer() {

  const wrap = document.getElementById('cartItems');

  const footer = document.getElementById('cartFooter');

  const clearBtn = document.getElementById('cartClearBtn');

  if (!cart.length) {

    wrap.innerHTML = `<div class="cart-empty-state"><div class="cart-empty-icon">🖼️</div><p style="font-weight:600;margin-bottom:6px;">Your cart is empty</p><p style="font-size:0.8rem;color:#bbb;">Browse the collection and add pieces you love.</p></div>`;

    footer.style.display = 'none';

    clearBtn.style.display = 'none';

    return;

  }

  const total = cart.reduce((s,c) => s + ((c.priceNum||0) * (c.qty||1)), 0);

  wrap.innerHTML = cart.map(c => `

    <div class="cart-item">

      <div class="cart-item-info"><strong>${c.title||'Unknown'}</strong><span>${c.price||''}</span></div>

      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">

        <button style="width:26px;height:26px;border:1px solid #e0dbd4;border-radius:50%;background:white;font-size:1rem;line-height:1;display:flex;align-items:center;justify-content:center;color:var(--ink);transition:all 0.2s;" onclick="cartDecreaseQty('${c.id}')" title="Decrease" aria-label="Decrease quantity">−</button>

        <span style="font-size:0.84rem;font-weight:700;min-width:18px;text-align:center;">${c.qty||1}</span>

        <button style="width:26px;height:26px;border:1px solid #e0dbd4;border-radius:50%;background:white;font-size:1rem;line-height:1;display:flex;align-items:center;justify-content:center;color:var(--ink);transition:all 0.2s;" onclick="cartIncreaseQty('${c.id}')" title="Increase" aria-label="Increase quantity">+</button>

        <button class="cart-item-del" onclick="removeFromCart('${c.id}')" title="Remove" aria-label="Remove">

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

        </button>

      </div>

    </div>`).join('');

  document.getElementById('cartItemCount').textContent = cart.length;

  document.getElementById('cartTotal').textContent = total > 0 ? `${total.toLocaleString()} KES` : '—';

  footer.style.display = 'block';

  clearBtn.style.display = 'inline-flex';

}

function openCart() {

  renderCartDrawer();

  document.getElementById('cartOverlay').classList.add('open');

  document.getElementById('cartDrawer').classList.add('open');

  document.body.style.overflow = 'hidden';

  document.getElementById('hamburgerBtn').style.display = 'none';

}

function closeCart() {

  document.getElementById('cartOverlay').classList.remove('open');

  document.getElementById('cartDrawer').classList.remove('open');

  document.body.style.overflow = '';

  document.getElementById('hamburgerBtn').style.display = '';

}

function checkoutFromCart() { closeCart(); openOrderForCart(); }

/* ══ STORY ══ */

function openStory()  { document.getElementById('storyModal').classList.add('active'); document.body.style.overflow='hidden'; track('story_opened'); }

function closeStory() { document.getElementById('storyModal').classList.remove('active'); document.body.style.overflow=''; }

/* ══ ORDER ══ */

function openOrder(id) {

  const art = artworks.find(a => String(a.id) === String(id));

  if (!art) return;

  currentOrderIndex = String(id);

  document.getElementById('orderArtworkName').textContent = `🖼️ ${art.title} — ${art.price}`;

  ['orderName','orderAddress','orderPhone'].forEach(f => document.getElementById(f).value = '');

  selectedChannel = 'wa'; updateOrderChannelUI();

  document.getElementById('orderModal').classList.add('active'); document.body.style.overflow='hidden';

  track('order_clicked', {artwork_id: id, title: art.title});

}

function openOrderForCart() {

  if (!cart.length) { showToast('Your cart is empty'); return; }

  currentOrderIndex = null;

  document.getElementById('orderArtworkName').textContent = `🛒 Cart: ${cart.length} item(s) · ${cart.reduce((s,c)=>s+((c.priceNum||0)*(c.qty||1)),0).toLocaleString()} KES`;

  ['orderName','orderAddress','orderPhone'].forEach(f => document.getElementById(f).value = '');

  selectedChannel = 'wa'; updateOrderChannelUI();

  document.getElementById('orderModal').classList.add('active'); document.body.style.overflow='hidden';

}

function closeOrder() { document.getElementById('orderModal').classList.remove('active'); document.body.style.overflow=''; }

function selectChannel(ch) { selectedChannel = ch; updateOrderChannelUI(); }

function updateOrderChannelUI() {

  ['wa','email','sms'].forEach(c => { const el = document.getElementById('ch-'+c); if(el) el.classList.toggle('sel', c===selectedChannel); });

  const btn = document.getElementById('sendBtn');

  const icons = {

    wa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,

    email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,

    sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`

  };

  const map = {

    wa:    ['Send via WhatsApp', 'btn-send btn-wa', icons.wa],

    email: ['Send via Email',    'btn-send btn-email', icons.email],

    sms:   ['Send via SMS',      'btn-send btn-sms', icons.sms]

  };

  const [txt, cls, ico] = map[selectedChannel] || map.wa;

  btn.innerHTML = `${ico} ${txt}`;

  btn.className = cls;

}

function sendOrder() {

  const name    = document.getElementById('orderName').value.trim();

  const address = document.getElementById('orderAddress').value.trim();

  const phone   = document.getElementById('orderPhone').value.trim();

  if (!name || !address) { showToast('⚠️ Please fill in your name and address'); return; }

  let artworkLine = '';

  let totalPrice = 0;

  if (currentOrderIndex !== null) {

    const art = artworks.find(a => String(a.id) === String(currentOrderIndex));

    artworkLine = `🖼️ ${art.title} — ${art.price}`;

    totalPrice = art.priceNum;

  } else {

    artworkLine = cart.map(c => `🖼️ ${c.title} — ${c.price} × ${c.qty||1}`).join('\n');

    totalPrice = cart.reduce((s,c) => s + ((c.priceNum||0)*(c.qty||1)), 0);

    if (totalPrice > 0) artworkLine += `\n💰 Total: ${totalPrice.toLocaleString()} KES`;

  }

  const msg = `Hello, I'm ${name}\n\nI would like to order:\n${artworkLine}\n\n📍 Address: ${address}${phone?`\n📱 Phone: ${phone}`:''}\n\nKindly confirm availability.`;

  const enc = encodeURIComponent(msg);

  if (selectedChannel === 'wa') window.open(`https://wa.me/${CONTACT.waNum}?text=${enc}`, '_blank');

  else if (selectedChannel === 'email') {

    const art = currentOrderIndex !== null ? artworks.find(a=>String(a.id)===String(currentOrderIndex)) : null;

    const subj = art ? `Art Order — ${art.title}` : `Art Order — ${cart.length} items`;

    window.open(`mailto:${CONTACT.email}?subject=${encodeURIComponent(subj)}&body=${enc}`, '_blank');

  } else {

    window.open(`sms:${CONTACT.phone}?body=${enc}`, '_blank');

  }

  if (window.saveOrderToFirestore) {

    const art = currentOrderIndex !== null ? artworks.find(a=>String(a.id)===String(currentOrderIndex)) : null;

    window.saveOrderToFirestore({

      customerInfo: {name, address, phone},

      items: art ? [art] : [...cart],

      totalPrice,

      channel: selectedChannel

    });

  }

  track('order_sent', {channel: selectedChannel});

  closeOrder();

  showToast('✅ Order sent! Lewis will be in touch soon.');

}

/* ══ CALL ══ */

function callGallery(title) { track('call_clicked', {title}); window.location.href = `tel:${CONTACT.phone}`; }

/* ══ COMMISSION ══ */

function openCommission() {
  // Reset policy section each open
  const policyBox = document.getElementById('commissionPolicyBox');
  const sendSection = document.getElementById('commissionSendSection');
  if (policyBox) policyBox.style.display = 'block';
  if (sendSection) sendSection.style.display = 'none';
  document.getElementById('commissionModal').classList.add('active');
  document.body.style.overflow = 'hidden';
  track('commission_opened');
}

function closeCommission() { document.getElementById('commissionModal').classList.remove('active'); document.body.style.overflow=''; }

function handleCustomSizeSelect(val) {
  const inp = document.getElementById('cSizeCustom');
  if (!inp) return;
  if (val === 'custom') { inp.style.display = 'block'; inp.focus(); }
  else { inp.style.display = 'none'; inp.value = ''; }
}

function selectCommissionChannel(ch) {

  selectedCommissionChannel = ch;

  ['wa','email','sms'].forEach(c => document.getElementById('cc-'+c)?.classList.toggle('sel', c===ch));

  const btn = document.getElementById('commissionSendBtn');

  const icons = {

    wa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,

    email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,

    sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`

  };

  const map = {

    wa:    ['Send Commission Request via WhatsApp', 'btn-send btn-wa', icons.wa],

    email: ['Send Commission Request via Email',    'btn-send btn-email', icons.email],

    sms:   ['Send Commission Request via SMS',      'btn-send btn-sms', icons.sms]

  };

  const [txt, cls, ico] = map[ch] || map.wa;

  btn.innerHTML = `${ico} ${txt}`;

  btn.className = cls;

}

function handleCommissionPolicyYes() {
  sessionStorage.setItem('ail_commission_agreed','1');
  const policyBox = document.getElementById('commissionPolicyBox');
  const sendSection = document.getElementById('commissionSendSection');
  if (policyBox) { policyBox.style.background='#f0fff4'; policyBox.innerHTML='<p style="color:#1aa34a;font-weight:700;font-size:0.88rem;">✅ Agreed! Please choose how to send your commission below.</p>'; }
  if (sendSection) sendSection.style.display = 'block';
}

function handleCommissionPolicyNo() {
  closeCommission();
  sessionStorage.removeItem('ail_commission_agreed');
  setTimeout(() => { showToast("Oops! The commission can't be processed!"); }, 300);
  window.scrollTo({top:0,behavior:'smooth'});
}

function sendCommission() {

  const name=document.getElementById('cName').value.trim(),phone=document.getElementById('cPhone').value.trim(),desc=document.getElementById('cDesc').value.trim(),mood=document.getElementById('cMood').value,sizeRaw=document.getElementById('cSize').value,sizeCustom=document.getElementById('cSizeCustom').value.trim(),size=sizeRaw==='custom'?(sizeCustom||'Custom (not specified)'):sizeRaw,colors=document.getElementById('cColors').value.trim(),address=document.getElementById('cAddress').value.trim();

  if(!name||!desc){showToast('⚠️ Please fill in your name and describe your vision');return;}

  const msg=`🎨 COMMISSION REQUEST — ART IS LIFE FOUNDATION\n\nHello Levis!\n\nI hope this message finds you well. I'm reaching out because I'm very interested in commissioning a beautiful custom artwork from you.\n\n═══════════════════════════════════════\nMY VISION & DETAILS:\n═══════════════════════════════════════\n\nName: ${name}\n${phone?`Contact: ${phone}\n`:''}\n${address?`Address: ${address}\n`:''}\nDescription of Vision:\n${desc}\n\nStyle & Mood: ${mood||'Open to artist suggestions'}\nPreferred Size: ${size||'To be discussed'}\nColor Preferences: ${colors||"I'm open to your artistic direction"}\n\n═══════════════════════════════════════\n\nI'm excited to collaborate with you on this project and would love to discuss timeline, pricing, and any specific details. Please feel free to reach out at your earliest convenience.\n\nThank you for considering my commission request. I look forward to creating something special together!\n\nWarm regards,\n${name}`;


  const enc=encodeURIComponent(msg);

  if(selectedCommissionChannel==='wa') window.open(`https://wa.me/${CONTACT.waNum}?text=${enc}`,'_blank');

  else if(selectedCommissionChannel==='email') window.open(`mailto:${CONTACT.email}?subject=${encodeURIComponent('Commission Request — '+name)}&body=${enc}`,'_blank');

  else window.open(`sms:${CONTACT.phone}?body=${enc}`,'_blank');

  track('commission_sent',{channel:selectedCommissionChannel});

  closeCommission();

  // 🔧 COMMISSION FORM RESET START
  setTimeout(() => {
    // Clear all form fields
    const fields = ['cName', 'cPhone', 'cDesc', 'cMood', 'cSize', 'cSizeCustom', 'cColors', 'cAddress'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    
    // Reset policy box visibility
    const policyBox = document.getElementById('commissionPolicyBox');
    const sendSection = document.getElementById('commissionSendSection');
    if (policyBox) policyBox.style.display = 'block';
    if (sendSection) sendSection.style.display = 'none';
    
    sessionStorage.removeItem('ail_commission_agreed');
    showToast('🎨 Commission sent! Lewis will respond soon.');
  }, 300);
  // 🔧 COMMISSION FORM RESET END

}

/* ══ ACCESS DENIED MODAL ══ */

function showAccessDenied() {

  document.getElementById('accessDeniedOverlay').classList.add('active');

  document.body.style.overflow = 'hidden';

}

function closeAccessDenied() {

  document.getElementById('accessDeniedOverlay').classList.remove('active');

  document.body.style.overflow = '';

}

/* ══ ADMIN LOGIN ══ */

function openAdminLogin() {

  if (window._firebaseAdmin) { openAdminDashboard(); return; }

  const modal = document.getElementById('adminLoginModal');

  modal.classList.add('active'); document.body.style.overflow='hidden';

  document.getElementById('adminEmail').value = '';

  document.getElementById('adminPassword').value = '';

  document.getElementById('adminError').style.display = 'none';

  document.getElementById('adminUidBox').style.display = 'none';

  setTimeout(() => document.getElementById('adminEmail').focus(), 100);

}

function closeAdminLogin() {

  document.getElementById('adminLoginModal').classList.remove('active');

  document.getElementById('adminError').style.display = 'none';

  document.getElementById('adminUidBox').style.display = 'none';

  document.body.style.overflow = '';

}

async function handleAdminLogin() {

  const email    = document.getElementById('adminEmail').value.trim();

  const password = document.getElementById('adminPassword').value;

  const errEl    = document.getElementById('adminError');

  const loginBtn = document.getElementById('adminLoginBtn');

  const uidBox   = document.getElementById('adminUidBox');

  errEl.style.display = 'none';

  uidBox.style.display = 'none';

  if (!email || !password) {

    errEl.textContent = 'Please enter both email and password.';

    errEl.style.display = 'block'; return;

  }

  if (!window.firebaseAdminLogin) {

    errEl.textContent = 'Firebase not loaded yet. Please wait a moment.';

    errEl.style.display = 'block'; return;

  }

  loginBtn.innerHTML = '<span style="display:inline-block;animation:spin 0.8s linear infinite;margin-right:8px;">⏳</span> Verifying…';

  loginBtn.disabled = true;

  const result = await window.firebaseAdminLogin(email, password);

  loginBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Sign In with Firebase`;

  loginBtn.disabled = false;

  if (result.success) {

    closeAdminLogin();

    showToast(`👑 Welcome! Role: ${result.role}`);

    document.getElementById('adminPanelTrigger').classList.add('active');

    document.getElementById('adminPanelTrigger').title = `Admin Dashboard (${result.role})`;

    openAdminDashboard();

  } else {

    // Show large access denied modal for wrong credentials / access issue

    closeAdminLogin();

    showAccessDenied();

    // Also show diagnostic if uid returned (Firestore setup needed)

    if (result.uid) {

      _lastUid = result.uid;

      // Re-open login with uid info

      setTimeout(() => {

        closeAccessDenied();

        openAdminLogin();

        document.getElementById('adminUidDisplay').textContent = result.uid;

        document.getElementById('adminUidBox').style.display = 'block';

        document.getElementById('adminError').textContent = result.error || 'Authentication failed.';

        document.getElementById('adminError').style.display = 'block';

      }, 3000);

    }

  }

}

function copyUid() {

  if (!_lastUid) return;

  navigator.clipboard.writeText(_lastUid).then(() => {

    showToast('📋 UID copied to clipboard!');

    document.querySelector('.admin-uid-copy').textContent = '✅ Copied!';

    setTimeout(() => { document.querySelector('.admin-uid-copy').textContent = '📋 Copy UID'; }, 2000);

  });

}

/* ══ ADMIN DASHBOARD ══ */

function openAdminDashboard() {

  if (!window._firebaseAdmin) { showToast('⛔ Admin access required'); openAdminLogin(); return; }

  document.getElementById('adminDashboard').classList.add('active');

  document.body.style.overflow = 'hidden';

  const role  = window._currentRole || 'admin';

  const email = window._currentUser?.email || 'admin';

  document.getElementById('admEmail').textContent = email;

  const pip = document.getElementById('admRolePip');

  pip.textContent = role; pip.className = 'adm-role-pip ' + (role === 'crown' ? 'crown' : 'admin');

  document.getElementById('admWelcome').textContent = `Welcome back, ${email.split('@')[0]} — ${new Date().toLocaleDateString('en-KE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`;

  if (role === 'crown') document.getElementById('crownSection').style.display = 'block';

  loadDashboardStats();

  renderOverviewArtGrid();

  renderArtworksTable();

  track('admin_dashboard_opened', {role});

}

function closeAdminDashboard() {

  document.getElementById('adminDashboard').classList.remove('active');

  document.body.style.overflow = '';

}

function admTab(name, btn) {

  document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));

  document.querySelectorAll('.adm-nav-item').forEach(n => n.classList.remove('active'));

  const tab = document.getElementById('tab-'+name);

  if (tab) tab.classList.add('active');

  if (btn) btn.classList.add('active');

  if (name === 'orders') loadOrders();

  if (name === 'likes') renderLikesTab();

  if (name === 'users') loadUsers();

  if (name === 'artworks') renderArtworksTable();

  if (name === 'console' && window.renderConsole) window.renderConsole();

  if (name === 'studio' && window.renderStudioManager) window.renderStudioManager();

}

async function loadDashboardStats() {

  if (!window.fetchDashboardStats) return;

  const stats = await window.fetchDashboardStats();

  document.getElementById('stat-orders').textContent    = stats.totalOrders;

  document.getElementById('stat-pending').textContent   = stats.pending;

  document.getElementById('stat-completed').textContent = stats.complete;

  document.getElementById('stat-likes').textContent     = stats.totalLikes || 0;

  document.getElementById('stat-earned').textContent   = stats.earned > 0 ? `${stats.earned.toLocaleString()} KES` : '0 KES';

  document.getElementById('stat-revenue').textContent   = stats.revenue > 0 ? `${stats.revenue.toLocaleString()} KES` : '—';

  if (stats.pending > 0) {

    const b = document.getElementById('pendingBadge');

    b.textContent = stats.pending; b.style.display = 'inline-flex';

  }

}

function renderOverviewArtGrid() {

  const g = document.getElementById('overviewArtGrid');

  g.innerHTML = artworks.slice(0,8).map(a => `

    <div style="text-align:center;">

      <img src="${a.image}" alt="${a.title}" style="width:100%;height:80px;object-fit:cover;border-radius:4px;background:#222;cursor:pointer;" onclick="openZoom('${a.image}','${a.title.replace(/'/g,"\\'")}');document.getElementById('adminDashboard').style.zIndex='2999'" onerror="this.style.background='#2c2510';this.style.height='80px'">

      <div style="font-size:0.7rem;color:var(--adm-text);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.title}</div>

      <div style="font-size:0.66rem;color:var(--adm-gold);">${a.price}</div>

    </div>`).join('');

}

async function renderArtworksTable() {

  const tbody = document.getElementById('artworksTbody');

  const titleEl = document.getElementById('artworkTableTitle');

  // Get likes counts for sorting

  const likeCounts = window._firestoreLikeCounts || {};

  // Sort artworks by likes descending

  const sorted = [...artworks].sort((a, b) => {

    const la = likeCounts[String(a.id)] || 0;

    const lb = likeCounts[String(b.id)] || 0;

    return lb - la;

  });

  if (titleEl) titleEl.textContent = `All Artworks (${sorted.length}) — sorted by likes`;

  tbody.innerHTML = sorted.map((a, i) => {

    const lc = likeCounts[String(a.id)] || 0;

    return `

    <tr>

      <td style="color:var(--adm-muted);font-size:0.72rem;font-weight:700;">#${i+1}</td>

      <td>

        <div style="display:flex;align-items:center;gap:10px;">

          <img src="${a.image}" style="width:36px;height:36px;object-fit:cover;border-radius:3px;background:#222;" onerror="this.src='placeholder.jpg'">

          <div>

            <div style="font-weight:600;">${a.title}</div>

            <div style="font-size:0.7rem;color:var(--adm-muted);margin-top:2px;">${a.desc ? a.desc.slice(0,50)+'…' : ''}</div>

          </div>

        </div>

      </td>

      <td>

        <input class="adm-input" type="text" value="${a.price}" style="width:110px;padding:5px 8px;font-size:0.78rem;" onchange="updateArtworkPrice('${a.id}',this.value)" title="Edit price">

      </td>

      <td>

        <select class="adm-status-select" onchange="updateArtworkStatus('${a.id}',this.value)">

          <option value="available" ${(a.status||'available')==='available'?'selected':''}>Available</option>

          <option value="featured" ${a.status==='featured'?'selected':''}>Featured</option>

          <option value="sold" ${a.status==='sold'?'selected':''}>Sold</option>

        </select>

      </td>

      <td>

        <span class="adm-like-badge">

          <svg viewBox="0 0 24 24" fill="#e05252" stroke="#e05252" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>

          ${lc}

        </span>

      </td>

      <td>

        <div style="display:flex;gap:6px;">

          <button class="adm-btn-sm" onclick="viewArtworkDetails('${a.id}')">View</button>

          <button class="adm-btn-sm danger" onclick="confirmRemoveArtwork('${a.id}','${a.title.replace(/'/g,"\\'")}')">Remove</button>

        </div>

      </td>

    </tr>`;

  }).join('');

}

function updateArtworkPrice(id, val) {

  const art = artworks.find(a => String(a.id) === String(id));

  if (!art) return;

  const trimmed = val.trim();

  art.price = trimmed;

  const num = parseInt(trimmed);

  if (!isNaN(num)) art.priceNum = num;

  if (window.adminUpdateArtwork) window.adminUpdateArtwork(String(id), {price: trimmed, priceNum: isNaN(num)?art.priceNum:num});

  showToast(`✅ Price updated for "${art.title}"`);

  renderGallery(currentSearch);

}

function updateArtworkStatus(id, status) {

  const art = artworks.find(a => String(a.id) === String(id));

  if (!art) return;

  art.status = status;

  if (window.adminUpdateArtwork) window.adminUpdateArtwork(String(id), {status});

  showToast(`✅ Status updated to "${status}"`);

  renderGallery(currentSearch);

}

function confirmRemoveArtwork(id, title) {

  if (!confirm(`Remove "${title}" from the collection?\n\nThis will soft-delete the artwork. You can restore it from the Recovery Panel.`)) return;

  const idx = artworks.findIndex(a => String(a.id) === String(id));

  if (idx > -1) artworks.splice(idx, 1);

  if (window.adminDeleteArtwork) window.adminDeleteArtwork(String(id));

  showToast(`🗑️ "${title}" soft-deleted — recoverable`);

  renderArtworksTable();

  renderGallery(currentSearch);

  renderOverviewArtGrid();

}

async function loadRecoveryPanel() {

  const el = document.getElementById('recoveryPanelContent');

  if (!el) return;

  if (!window.fetchDeletedArtworks) { el.innerHTML = '<div style="color:var(--adm-muted);font-size:0.84rem;">Recovery requires Firebase.</div>'; return; }

  el.innerHTML = '<div class="adm-loader">Loading deleted items…</div>';

  const deleted = await window.fetchDeletedArtworks();

  if (!deleted.length) { el.innerHTML = '<div style="color:var(--adm-muted);font-size:0.84rem;">No deleted artworks found.</div>'; return; }

  el.innerHTML = deleted.map(a => `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--adm-border);">

    <img src="${a.image}" style="width:40px;height:40px;object-fit:cover;border-radius:3px;background:#222;" onerror="this.src='placeholder.jpg'">

    <div style="flex:1;"><div style="font-size:0.82rem;color:var(--adm-text);font-weight:600;">${a.title}</div><div style="font-size:0.7rem;color:var(--adm-muted);">${a.price}</div></div>

    <button class="adm-btn-sm" style="color:var(--adm-green);border-color:var(--adm-green);" onclick="restoreArtwork('${a.id}','${(a.title||'').replace(/'/g,"\\'")}')">↩ Restore</button>

  </div>`).join('');

}

async function restoreArtwork(id, title) {

  if (!window.adminRestoreArtwork) return;

  await window.adminRestoreArtwork(id);

  // Re-add to artworks list

  showToast(`✅ "${title}" restored to collection`);

  loadRecoveryPanel();

}

function handleImageUpload(input) {

  const file = input.files[0]; if (!file) return;

  if (!window.uploadArtworkImage) { showToast('Firebase Storage not ready'); return; }

  const prog = document.getElementById('uploadProgress'), bar = document.getElementById('uploadBar');

  prog.style.display = 'block'; bar.style.width = '0%';

  window.uploadArtworkImage(file,

    pct => { bar.style.width = pct + '%'; },

    url => {

      uploadedImageUrl = url;

      document.getElementById('uploadedUrl').textContent = '✅ Uploaded: ' + url;

      prog.style.display = 'none';

      showToast('📷 Image uploaded! Publishing to gallery…');

      // Auto-publish: immediately create Firestore doc with current form values
      const title  = (document.getElementById('newTitle')?.value || '').trim();
      const price  = (document.getElementById('newPrice')?.value || '').trim();
      const desc   = (document.getElementById('newDesc')?.value  || '').trim();
      const status = document.getElementById('newStatus')?.value || 'available';

      if (title && price && window.adminAddArtwork) {

        const priceNum = parseInt(price) || 0;

        const artData  = {
          title,
          price: price.endsWith('KES') ? price : `${price} KES`,
          priceNum,
          image: url,
          desc: desc || 'A new original piece.',
          status
        };

        window.adminAddArtwork(artData).then(ref => {

          if (ref) {

            showToast(`✅ "${title}" published to gallery!`);

            clearAddForm();

          }

        }).catch(e => showToast('❌ Publish failed: ' + e.message));

      }

    },

    err => { prog.style.display = 'none'; showToast('❌ Upload failed: ' + err.message); }

  );

}

async function submitAddArtwork() {

  const title      = document.getElementById('newTitle').value.trim();

  const price      = document.getElementById('newPrice').value.trim();

  const desc       = document.getElementById('newDesc').value.trim();

  const localImage = document.getElementById('newImage').value.trim();

  const status     = document.getElementById('newStatus').value || 'available';

  if (!title || !price) { showToast('⚠️ Title and price are required'); return; }

  const image    = uploadedImageUrl || (localImage ? localImage : 'images/placeholder.jpg');

  const priceNum = parseInt(price) || 0;

  const newArt   = { id: 'local_' + Date.now(), title, price:`${price} KES`, priceNum, image, desc: desc || 'A new original piece.', status };

  artworks.push(newArt);

  if (window.adminAddArtwork) {

    const ref = await window.adminAddArtwork({ title, price:`${price} KES`, priceNum, image, desc: newArt.desc, status });

    if (ref) newArt.id = ref.id;

  }

  showToast(`✅ "${title}" added to collection`);

  clearAddForm();

  renderGallery(currentSearch);

  renderArtworksTable();

  renderOverviewArtGrid();

}

function clearAddForm() {

  ['newTitle','newPrice','newDesc','newImage'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });

  document.getElementById('uploadedUrl').textContent = '';

  document.getElementById('uploadProgress').style.display = 'none';

  uploadedImageUrl = '';

}

let _ordersUnsubscribe = null;

function loadOrders() {

  const el = document.getElementById('ordersContent');

  el.innerHTML = '<div class="adm-loader">⏳ Connecting real-time orders feed…</div>';

  if (!window._db) { el.innerHTML = '<div class="adm-empty">Connect Firestore to view orders.</div>'; return; }

  if (_ordersUnsubscribe) { _ordersUnsubscribe(); _ordersUnsubscribe = null; }

  const { collection: col, query: q, orderBy: ob, onSnapshot: ons } = window._db._delegate ? { collection: window._collection, query: window._query, orderBy: window._orderBy, onSnapshot: window._onSnapshot } : {};

  // Use Firebase directly via module scope — call through window bridge

  if (!window._ordersSnapFn) {

    el.innerHTML = '<div class="adm-empty">Real-time orders require Firebase SDK. Using manual fetch.</div>';

    loadOrdersFallback();

    return;

  }

  _ordersUnsubscribe = window._ordersSnapFn((orders) => {

    renderOrdersTable(orders);

    const pending = orders.filter(o => o.status === 'pending').length;

    if (pending > 0) { const b = document.getElementById('pendingBadge'); if(b){b.textContent=pending;b.style.display='inline-flex';} }

  });

}

async function loadOrdersFallback() {

  const el = document.getElementById('ordersContent');

  if (!window.fetchOrders) { el.innerHTML = '<div class="adm-empty">Connect Firestore to view orders.</div>'; return; }

  const orders = await window.fetchOrders();

  renderOrdersTable(orders);

}

function renderOrdersTable(orders) {

  const el = document.getElementById('ordersContent');

  if (!orders.length) { el.innerHTML = '<div class="adm-empty">No orders yet. When customers place orders, they will appear here.</div>'; return; }

  el.innerHTML = `<div style="overflow-x:auto;"><table class="adm-table">

    <thead><tr><th>Date/Time</th><th>Buyer Name</th><th>Phone</th><th>Items</th><th>Total</th><th>Purchase Method</th><th>Status</th><th>Actions</th></tr></thead>

    <tbody>${orders.map(o => {

      const ts = o.createdAt?.toDate?.();

      const date = ts ? ts.toLocaleDateString('en-KE',{year:'numeric',month:'short',day:'numeric'}) : '—';

      const time = ts ? ts.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}) : '';

      const name  = o.customerInfo?.name || o.buyer_name || 'Unknown';

      const phone = o.customerInfo?.phone || o.phone || '—';

      const items = (o.items||[]).map(i => i.title||i).join(', ') || '—';

      const total = o.totalPrice ? `${o.totalPrice.toLocaleString()} KES` : '—';

      const method = o.channel || o.purchase_method || '—';

      const st    = o.status || 'pending';

      return `<tr>

        <td style="font-size:0.74rem;color:var(--adm-muted);">${date}<br><span style="font-size:0.66rem;">${time}</span></td>

        <td style="font-weight:600;">${name}</td>

        <td style="font-size:0.78rem;">${phone}</td>

        <td style="font-size:0.78rem;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${items}">${items}</td>

        <td style="color:var(--adm-gold);font-weight:600;">${total}</td>

        <td style="font-size:0.76rem;text-transform:capitalize;">${method}</td>

        <td><span class="adm-status-badge ${st}">${st}</span></td>

        <td>

          <div style="display:flex;gap:5px;">

            ${st==='pending'?`<button class="adm-btn-sm" style="color:var(--adm-green);border-color:var(--adm-green);" onclick="markOrderComplete('${o.id}')">✓ Done</button>`:''}

            <button class="adm-btn-sm danger" onclick="deleteOrder('${o.id}')">✕</button>

          </div>

        </td>

      </tr>`;

    }).join('')}</tbody>

  </table></div>`;

}

function confirmClearOrders() {

  if (!confirm('⚠️ CONFIRM: This will permanently delete ALL orders from Firestore.\n\nAre you absolutely sure?')) return;

  if (!confirm('Second confirmation: Delete all orders? This cannot be undone.')) return;

  clearAllOrders();

}

async function clearAllOrders() {

  if (!window.fetchOrders) { showToast('❌ Firestore not connected'); return; }

  showToast('⏳ Clearing all orders…');

  const orders = await window.fetchOrders();

  let deleted = 0;

  for (const o of orders) {

    if (window.adminDeleteOrder) { await window.adminDeleteOrder(o.id); deleted++; }

  }

  showToast(`✅ ${deleted} orders cleared`);

  loadOrders();

  loadDashboardStats();

}

function exportOrders() {

  if (!window.fetchOrders) { showToast('❌ Firestore not connected'); return; }

  window.fetchOrders().then(orders => {

    if (!orders.length) { showToast('No orders to export'); return; }

    const rows = [['Date','Buyer Name','Phone','Items','Total (KES)','Purchase Method','Status']];

    orders.forEach(o => {

      const ts = o.createdAt?.toDate?.();

      const date = ts ? ts.toLocaleDateString('en-KE') : '';

      const name = o.customerInfo?.name || o.buyer_name || '';

      const phone = o.customerInfo?.phone || o.phone || '';

      const items = (o.items||[]).map(i=>i.title||i).join('; ');

      const total = o.totalPrice || '';

      const method = o.channel || o.purchase_method || '';

      const status = o.status || '';

      rows.push([date,name,phone,items,total,method,status]);

    });

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');

    const blob = new Blob([csv], {type:'text/csv'});

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href = url; a.download = `orders_${new Date().toISOString().slice(0,10)}.csv`;

    a.click(); URL.revokeObjectURL(url);

    showToast('✅ Orders exported as CSV');

  });

}

async function markOrderComplete(id) {

  if (!window.adminUpdateOrder) return;

  await window.adminUpdateOrder(id, {status:'completed'});

  showToast('✅ Order marked complete');

  loadOrders(); loadDashboardStats();

}

async function deleteOrder(id) {

  if (!confirm('Delete this order?')) return;

  if (!window.adminDeleteOrder) return;

  await window.adminDeleteOrder(id);

  showToast('🗑️ Order deleted');

  loadOrders(); loadDashboardStats();

}

async function renderLikesTab() {

  const el = document.getElementById('likesContent');

  const likeCounts = window._firestoreLikeCounts || {};

  // Sort artworks by likes descending

  const sorted = [...artworks]

    .map(a => ({...a, likeCount: likeCounts[String(a.id)] || 0}))

    .filter(a => a.likeCount > 0)

    .sort((a, b) => b.likeCount - a.likeCount);

  if (!sorted.length) {

    el.innerHTML = '<div style="color:var(--adm-muted);font-size:0.84rem;">No likes yet. Likes will appear here in real-time.</div>';

    return;

  }

  el.innerHTML = `<div style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;"><div style="font-size:0.84rem;color:var(--adm-muted);">${sorted.length} artworks with likes</div><button class="adm-btn-sm" onclick="clearFavoritesView()" style="border-color:var(--adm-red);color:var(--adm-red);">🗑️ Clear View</button></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">

    ${sorted.map((a,i) => `<div style="background:var(--adm-surface2);border:1px solid var(--adm-border);border-radius:6px;overflow:hidden;position:relative;">

      <div style="position:absolute;top:6px;left:6px;background:var(--adm-gold);color:var(--adm-bg);font-size:0.62rem;font-weight:800;padding:2px 7px;border-radius:50px;">#${i+1}</div>

      <img src="${a.image}" style="width:100%;height:90px;object-fit:cover;background:#222;" onerror="this.src='placeholder.jpg'">

      <div style="padding:8px;">

        <div style="font-size:0.76rem;color:var(--adm-text);font-weight:600;">${a.title}</div>

        <div style="font-size:0.7rem;color:var(--adm-gold);">${a.price}</div>

        <div style="font-size:0.68rem;color:#e05252;margin-top:4px;">❤️ ${a.likeCount} like${a.likeCount!==1?'s':''}</div>

      </div>

    </div>`).join('')}

  </div>`;

}

function clearFavoritesView() {

  const el = document.getElementById('likesContent');

  el.innerHTML = '<div style="color:var(--adm-muted);font-size:0.84rem;text-align:center;padding:20px;">✓ Favorites view cleared. Reload the page to see all likes again.</div>';

}

function viewArtworkDetails(artworkId) {

  const artwork = artworks.find(a => a.id === artworkId);

  if (!artwork) { showToast('Artwork not found'); return; }

  const likeCount = getLikeCount(artworkId) || 0;

  const detailsHTML = `

    <div style="max-width:600px;margin:0 auto;">

      <div style="background:var(--card-bg);border:1px solid rgba(0,0,0,0.06);border-radius:8px;padding:24px;margin-bottom:20px;">

        <h3 style="color:var(--charcoal);margin-bottom:12px;font-size:1.3rem;">${artwork.title}</h3>

        <img src="${resolveImage(artwork.image)}" alt="${artwork.title}" style="width:100%;height:300px;object-fit:cover;border-radius:6px;margin-bottom:16px;" onerror="this.src='placeholder.jpg'">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

          <div><div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Price</div><div style="font-size:1.2rem;color:#ADD8E6;font-weight:700;">${artwork.price}</div></div>

          <div><div style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Status</div><div style="font-size:1.2rem;color:var(--gold);font-weight:700;text-transform:capitalize;">${artwork.status || 'available'}</div></div>

        </div>

        <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:16px;margin-bottom:16px;">

          <p style="color:var(--muted);line-height:1.6;">${artwork.desc || 'No description available'}</p>

        </div>

        <div style="background:rgba(224,82,82,0.06);border:1px solid rgba(224,82,82,0.2);border-radius:6px;padding:12px;margin-bottom:16px;">

          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">

            <svg viewBox="0 0 24 24" fill="#e05252" stroke="#e05252" stroke-width="1" width="18" height="18"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>

            <span style="font-weight:700;color:#e05252;">${likeCount} like${likeCount!==1?'s':''}</span>

          </div>

          <div style="font-size:0.8rem;color:var(--muted);">Total engagement on this piece</div>

        </div>

        <button onclick="closeArtworkDetails()" style="width:100%;padding:12px;background:var(--charcoal);color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;transition:background 0.3s;">Close Details</button>

      </div>

    </div>

  `;

  const modal = document.createElement('div');

  modal.id = 'artworkDetailsModal';

  modal.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px;';

  modal.innerHTML = detailsHTML;

  modal.onclick = (e) => { if(e.target === modal) closeArtworkDetails(); };

  document.body.appendChild(modal);

}

function closeArtworkDetails() {

  const modal = document.getElementById('artworkDetailsModal');

  if(modal) modal.remove();

}

async function loadUsers() {

  const el = document.getElementById('usersContent');

  if (window._currentRole !== 'crown') { el.innerHTML = '<div class="adm-empty">👑 Crown-level access required to manage users.</div>'; return; }

  el.innerHTML = '<div class="adm-loader">⏳ Loading users…</div>';

  if (!window.fetchUsers) { el.innerHTML = '<div class="adm-empty">Connect Firestore to view users.</div>'; return; }

  const users = await window.fetchUsers();

  if (!users.length) { el.innerHTML = '<div class="adm-empty">No users found in Firestore users collection.</div>'; return; }

  el.innerHTML = `<div style="overflow-x:auto;"><table class="adm-table">

    <thead><tr><th>UID</th><th>Email / ID</th><th>Role</th><th>Actions</th></tr></thead>

    <tbody>${users.map(u => `<tr>

      <td style="font-size:0.7rem;color:var(--adm-muted);font-family:monospace;">${u.id.slice(0,12)}…</td>

      <td>${u.email||u.id}</td>

      <td>

        <select class="adm-role-select" onchange="changeUserRole('${u.id}',this.value)">

          <option ${u.role==='crown'?'selected':''}>crown</option>

          <option ${u.role==='admin'?'selected':''}>admin</option>

          <option ${u.role==='editor'?'selected':''}>editor</option>

          <option ${u.role==='viewer'?'selected':''}>viewer</option>

        </select>

      </td>

      <td><button class="adm-btn-sm" onclick="navigator.clipboard.writeText('${u.id}').then(()=>showToast('UID copied'))">Copy UID</button></td>

    </tr>`).join('')}</tbody>

  </table></div>`;

}

async function changeUserRole(uid, newRole) {

  if (!window.adminUpdateUser) return;

  await window.adminUpdateUser(uid, {role: newRole});

  showToast(`✅ Role updated to "${newRole}"`);

}

async function handleAdminLogout() {

  await window.firebaseAdminLogout?.();

  closeAdminDashboard();

  document.getElementById('adminPanelTrigger').classList.remove('active');

  document.getElementById('adminPanelTrigger').title = 'Admin Login';

  document.getElementById('crownSection').style.display = 'none';

}

/* ══ KEYBOARD ══ */

document.addEventListener('keydown', e => {

  if (e.key === 'Escape') {

    closeZoom();

    closeImageModal && closeImageModal();

    closeStory();

    closeOrder();

    closeCommission();

    closeCart();

    closeAdminLogin();

    closeCommentModal();

    closeAccessDenied();

    closeHamburger();

    if (!document.getElementById('adminDashboard').classList.contains('active'))

      document.body.style.overflow = '';

  }

});

document.addEventListener('click', e => {

  const nav = document.getElementById('headerNav'), tog = document.getElementById('navToggle');

  if (nav.classList.contains('open') && !nav.contains(e.target) && !tog.contains(e.target)) nav.classList.remove('open');

  const ham = document.getElementById('hamburgerMenu'), btn = document.getElementById('hamburgerBtn');

  if (ham.classList.contains('open') && !ham.contains(e.target) && !btn.contains(e.target)) closeHamburger();

  // Reset dashboard z-index after zoom close

  if (e.target.id === 'imgZoomOverlay' || e.target.closest('.img-zoom-close')) {

    setTimeout(() => { document.getElementById('adminDashboard').style.zIndex = ''; }, 100);

  }

});

/* ══ INIT ══ */

function init() {

  renderGallery('');

  updateCartCount();

  updateStoryLikeCount();

  /* Firestore artworks: firebase.js (module) loads after this classic script.
     If artworks haven't arrived within 6s, check for domain auth issues.    */
  setTimeout(function() {
    if (!window._firestoreArtworks || window._firestoreArtworks.length === 0) {
      const domain = location.hostname;
      if (domain !== 'localhost' && domain !== '127.0.0.1') {
        console.warn(
          '⚠️ No Firestore artworks after 6s.\n' +
          'Fix: Firebase Console → Authentication → Settings → Authorized Domains\n' +
          '→ Add "' + domain + '"\n' +
          'Local artworks are showing as fallback.'
        );
      }
    }
  }, 6000);

  if (storyLiked) {

    document.getElementById('storyLikeBtn').classList.add('liked');

    document.getElementById('storyLikeIcon').setAttribute('fill','#e05252');

    document.getElementById('storyLikeIcon').setAttribute('stroke','#e05252');

  }

  track('page_view');

  console.log('✅ Art Is Life Foundation — init complete');

}

init();

window.addEventListener('beforeunload', () => {
  if (window._artworksUnsubscribe) { window._artworksUnsubscribe(); window._artworksUnsubscribe = null; }
  if (window._commentUnsubscribe || typeof _commentUnsubscribe !== 'undefined') {
    try { if (_commentUnsubscribe) { _commentUnsubscribe(); } } catch(e) {}
  }
});

