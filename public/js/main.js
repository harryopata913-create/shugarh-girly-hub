import { auth, db, isFirebaseConfigured } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, addDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const PRODUCT_KEY = "sgh-products-v1";
const CART_KEY = "sgh-cart-v1";
const ORDER_KEY = "sgh-orders-v1";
const ORDER_LAST_KEY = "sgh-last-order-v1";
const ADMIN_EMAIL = "ansomaacharity112@icloud.com";
const defaults = [
  { id: "sunday-girl-top", name: "The Sunday Girl Top", category: "Crop Top", price: 125, description: "A little playful, a little polished. This soft, easy-to-style crop top is your go-to for sunny plans and slow Sundays.", sizes: ["S", "M", "L"], stock: 12, image: "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "rosy-day-dress", name: "Rosy Day Dress", category: "Dress", price: 220, description: "The throw-it-on-and-feel-amazing dress. Light, lovely, and ready for brunch dates, birthday plans, or a little treat-yourself moment.", sizes: ["S", "M", "L"], stock: 8, image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "peachy-keen-top", name: "Peachy Keen Top", category: "Short Top", price: 110, description: "A sweet little short top with a comfy fit and all the feel-good energy. Pair it with your favorite denim and you're out the door.", sizes: ["S", "M", "L"], stock: 9, image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "little-love-bag", name: "Little Love Bag", category: "Accessories", price: 145, description: "A lovely finishing touch for all your everyday essentials. Small enough to keep it sweet, roomy enough for the important things.", sizes: ["One Size"], stock: 6, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "pink-sky-top", name: "Pink Sky Crop", category: "Crop Top", price: 98, description: "Your new favorite pop of pink. Easy to layer, easy to love, and made for whatever your day has planned.", sizes: ["S", "M", "L"], stock: 15, image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=85", featured: false },
  { id: "date-night-dress", name: "Date Night Dress", category: "Dress", price: 260, description: "A little extra in the best way. Save this pretty piece for dinner dates, celebrations, and nights that deserve a little sparkle.", sizes: ["S", "M", "L"], stock: 5, image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=900&q=85", featured: false },
  { id: "golden-hour-earrings", name: "Golden Hour Earrings", category: "Accessories", price: 75, description: "The tiny finishing touch that makes the whole look. A sweet pair for everyday wear or your next dressed-up moment.", sizes: ["One Size"], stock: 20, image: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=900&q=85", featured: false },
  { id: "soft-life-top", name: "Soft Life Top", category: "Short Top", price: 115, description: "A soft, comfy staple to reach for on repeat. Style it your way and let the good mood do the rest.", sizes: ["S", "M", "L"], stock: 11, image: "https://images.unsplash.com/photo-1566206091558-7f218b696731?auto=format&fit=crop&w=900&q=85", featured: false }
];
let products = [];
let productUnsubscribe = null;
const money = value => `GHS ${Number(value || 0).toFixed(2)}`;
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const localRead = (key, fallback) => { try { const parsed = JSON.parse(localStorage.getItem(key)); return parsed ?? fallback; } catch (error) { console.error(`Could not read ${key} from local storage.`, error); return fallback; } };
const localWrite = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.error(`Could not save ${key} to local storage.`, error); return false; } };
const getCart = () => localRead(CART_KEY, []);
const findProduct = id => products.find(product => product.id === id);

function headerMarkup() {
  const active = location.pathname.split("/").pop() || "index.html";
  return `<header class="site-header"><div class="header-inner"><a class="brand" href="${basePath()}index.html"><img src="${basePath()}assets/logo.jpeg" class="brand-logo" alt=""><span>Shugharh's Girly Hub<small>GIRLY, PRETTY, YOU.</small></span></a><nav class="main-nav" data-main-nav><a href="${basePath()}index.html" class="${active === "index.html" ? "active" : ""}">Home</a><a href="${basePath()}shop.html" class="${active === "shop.html" ? "active" : ""}">Shop all</a><a href="${basePath()}about.html" class="${active === "about.html" ? "active" : ""}">Our story</a><a data-account-link href="${basePath()}admin/login.html">Sign in / Sign up</a></nav><div class="header-tools"><button class="icon-button" type="button" aria-label="Open shopping bag" data-open-cart>♡<span class="cart-count" data-cart-count>0</span></button><button class="icon-button menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false" data-menu-toggle>☰</button></div></div></header>`;
}
function basePath() { return location.pathname.includes("/admin/") ? "../" : ""; }
function accountLoginURL(next = "") {
  const url = new URL(`${basePath()}admin/login.html`, location.href);
  if (next === "checkout.html") url.searchParams.set("next", next);
  return url.href;
}
function footerMarkup() { return `<footer class="site-footer"><div class="footer-inner"><div><a class="brand footer-brand" href="${basePath()}index.html"><img src="${basePath()}assets/logo.jpeg" alt=""><span>Shugharh's Girly Hub<small>GIRLY, PRETTY, YOU.</small></span></a><p class="footer-blurb">Pretty pieces for everyday main-character moments. Picked with love in Ghana, just for you.</p></div><div class="footer-column"><strong>Find your pretty</strong><a href="${basePath()}shop.html">Shop everything</a><a href="${basePath()}shop.html?category=Crop%20Top">Crop tops</a><a href="${basePath()}shop.html?category=Dress">Dresses</a></div><div class="footer-column"><strong>Get to know us</strong><a href="${basePath()}about.html">Our story</a><a href="https://wa.me/" target="_blank" rel="noopener noreferrer">Say hello on WhatsApp</a><a data-account-link href="${basePath()}admin/login.html">Sign in / Sign up</a></div><div class="footer-column"><strong>Made for your kind of magic</strong><p>Based in Ghana · Delivery across Ghana</p><p>Cash on delivery & Mobile Money</p></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} Shugharh's Girly Hub</span><span>Girly, pretty, you. ♡</span></div></footer>`; }
function productCard(product, index = 0) {
  return `<article class="product-card" style="animation-delay:${Math.min(index * 70, 350)}ms"><div class="product-image-wrap"><a href="product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${escapeHTML(product.name)}"><img class="product-image" src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy"></a>${product.featured ? '<span class="product-badge">A LITTLE FAVE</span>' : ""}<button class="product-heart" type="button" aria-label="Add to bag" data-quick-add="${escapeHTML(product.id)}">♡</button></div><div class="product-info"><span class="product-category">${escapeHTML(product.category)}</span><h3 class="product-name"><a href="product.html?id=${encodeURIComponent(product.id)}">${escapeHTML(product.name)}</a></h3><span class="product-price">${money(product.price)}</span></div></article>`;
}
function renderCards(list, target) { if (!target) return; target.innerHTML = list.length ? list.map(productCard).join("") : '<p class="product-empty-note">Nothing here just yet — try another search or category. ♡</p>'; }
function updateCartBadge() { const count = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0); document.querySelectorAll("[data-cart-count]").forEach(node => node.textContent = String(count)); }
function cartItems() { return getCart().map(item => ({ ...item, product: findProduct(item.productId) })).filter(item => item.product); }
function cartRow(item, drawer = false) { const imageSize = drawer ? "64px" : "85px"; return `<div class="cart-row"><img src="${escapeHTML(item.product.image)}" alt=""><div><h3>${escapeHTML(item.product.name)}</h3><small>Size: ${escapeHTML(item.size)}</small><div class="quantity-control"><button type="button" aria-label="Decrease quantity" data-quantity="-1" data-key="${escapeHTML(item.productId)}|${escapeHTML(item.size)}">−</button><span>${item.quantity}</span><button type="button" aria-label="Increase quantity" data-quantity="1" data-key="${escapeHTML(item.productId)}|${escapeHTML(item.size)}">＋</button>${drawer ? "" : `<button class="remove-item" type="button" data-remove="${escapeHTML(item.productId)}|${escapeHTML(item.size)}">Remove</button>`}</div></div><strong class="cart-row-price">${money(item.product.price * item.quantity)}</strong></div>`.replace('class="cart-row"', `class="cart-row" style="--image-size:${imageSize}"`); }
function summaryHTML(items) { return `<div class="summary-line"><span>Subtotal (${items.reduce((sum, item) => sum + item.quantity, 0)} items)</span><strong>${money(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0))}</strong></div><div class="summary-line"><span>Delivery</span><span>Confirmed with you</span></div><div class="summary-total"><span>Total</span><strong>${money(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0))}</strong></div>`; }
function updateCartViews() {
  updateCartBadge();
  const items = cartItems();
  const cartPage = document.querySelector("[data-cart-page]");
  if (cartPage) cartPage.innerHTML = items.length ? `<div class="cart-layout"><div class="cart-items">${items.map(item => cartRow(item)).join("")}</div><aside class="cart-summary panel"><h2>Your order so far</h2>${summaryHTML(items)}<a class="button button-dark" href="checkout.html">Head to checkout <span>→</span></a><p class="delivery-note">♡ Delivery details are confirmed after you order.</p></aside></div>` : `<div class="empty-state"><p>Your bag is taking a little breather.</p><a class="button button-dark" href="shop.html">Find something pretty <span>↗</span></a></div>`;
  const drawer = document.querySelector(".drawer-items");
  if (drawer) drawer.innerHTML = items.length ? items.map(item => cartRow(item, true)).join("") : '<p class="drawer-empty">Your bag is looking for a little love. ♡</p>';
  const drawerTotal = document.querySelector("[data-drawer-total]");
  if (drawerTotal) drawerTotal.textContent = money(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0));
  const summary = document.querySelector("[data-checkout-summary]");
  if (summary) {
    summary.innerHTML = items.length ? items.map(item => `<div class="checkout-summary-item"><span>${escapeHTML(item.product.name)} × ${item.quantity}<small>Size: ${escapeHTML(item.size)}</small></span><strong>${money(item.product.price * item.quantity)}</strong></div>`).join("") : '<p class="form-message">Your bag is empty. Add something lovely before checkout.</p>';
    const total = document.querySelector("[data-checkout-total]");
    if (total) total.textContent = money(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0));
    const submit = document.querySelector('[data-checkout-form] button[type="submit"]');
    if (submit) submit.disabled = !items.length;
  }
}
function ensureDrawer() {
  if (document.querySelector(".cart-drawer")) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="cart-drawer-backdrop" data-drawer-backdrop></div><aside class="cart-drawer" aria-label="Shopping bag" aria-hidden="true"><div class="drawer-head"><h2>Your little bag</h2><button class="drawer-close" type="button" aria-label="Close shopping bag" data-close-cart>×</button></div><div class="drawer-items"></div><div class="drawer-footer"><div class="summary-line"><span>Subtotal</span><strong data-drawer-total>GHS 0.00</strong></div><a class="button button-dark" href="cart.html">View my bag <span>→</span></a></div></aside>`);
  updateCartViews();
}
function openDrawer() { ensureDrawer(); document.querySelector(".cart-drawer").classList.add("is-open"); document.querySelector(".cart-drawer-backdrop").classList.add("is-open"); document.querySelector(".cart-drawer").setAttribute("aria-hidden", "false"); document.body.classList.add("drawer-open"); }
function closeDrawer() { const drawer = document.querySelector(".cart-drawer"); if (!drawer) return; drawer.classList.remove("is-open"); document.querySelector(".cart-drawer-backdrop").classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); document.body.classList.remove("drawer-open"); }
function toast(message) { const node = document.createElement("div"); node.className = "toast"; node.setAttribute("role", "status"); node.textContent = message; document.body.append(node); window.setTimeout(() => { node.classList.add("is-leaving"); window.setTimeout(() => node.remove(), 260); }, 2300); }
function addToCart(productId, size = null, origin = null) {
  const product = findProduct(productId);
  if (!product) { toast("Sorry, we couldn't find that product."); return; }
  if (Number(product.stock) < 1) { toast("This one is sold out for now."); return; }
  const chosenSize = size || product.sizes?.[0] || "One Size";
  const cart = getCart();
  const item = cart.find(entry => entry.productId === product.id && entry.size === chosenSize);
  if (item) item.quantity = Math.min(item.quantity + 1, Number(product.stock) || 99);
  else cart.push({ productId: product.id, size: chosenSize, quantity: 1 });
  if (!localWrite(CART_KEY, cart)) { toast("Your browser couldn't save the bag. Check available storage and try again."); return; }
  if (origin?.classList.contains("product-heart")) {
    origin.classList.add("is-active");
    origin.setAttribute("aria-label", "Added to bag");
    window.setTimeout(() => { origin.classList.remove("is-active"); origin.setAttribute("aria-label", "Add to bag"); }, 700);
  }
  updateCartViews();
  if (origin) flyToCart(origin, product.image);
  toast(`${product.name} is in your bag ♡`);
}
function flyToCart(origin, image) {
  const target = document.querySelector("[data-open-cart]");
  if (!origin || !target || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const from = origin.getBoundingClientRect(), to = target.getBoundingClientRect(), flyer = document.createElement("img");
  flyer.src = image; flyer.alt = ""; flyer.className = "fly-to-cart"; flyer.style.left = `${from.left + from.width / 2 - 18}px`; flyer.style.top = `${from.top + from.height / 2 - 18}px`; flyer.style.width = "36px"; flyer.style.height = "36px"; flyer.style.setProperty("--fly-x", `${to.left - from.left}px`); flyer.style.setProperty("--fly-y", `${to.top - from.top}px`); document.body.append(flyer); window.setTimeout(() => flyer.remove(), 750);
}
function setQuantity(key, delta) {
  const [productId, size] = key.split("|"); const cart = getCart(); const item = cart.find(entry => entry.productId === productId && entry.size === size);
  if (!item) return;
  const stock = Number(findProduct(productId)?.stock || 99);
  item.quantity += delta;
  if (item.quantity <= 0) { const index = cart.indexOf(item); cart.splice(index, 1); }
  else item.quantity = Math.min(item.quantity, stock);
  localWrite(CART_KEY, cart); updateCartViews();
}
function removeFromCart(key) { const [productId, size] = key.split("|"); localWrite(CART_KEY, getCart().filter(item => !(item.productId === productId && item.size === size))); updateCartViews(); }

function renderShop() {
  const grid = document.querySelector("[data-shop-products]"); if (!grid) return;
  const search = document.querySelector("[data-search]"), category = document.querySelector("[data-category-filter]"), sort = document.querySelector("[data-sort-filter]");
  const params = new URLSearchParams(location.search);
  if (params.get("category") && category) category.value = params.get("category");
  const paint = () => {
    let result = [...products], phrase = (search?.value || "").trim().toLowerCase();
    if (phrase) result = result.filter(p => `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(phrase));
    if (category?.value) result = result.filter(p => p.category === category.value);
    if (sort?.value === "price-low") result.sort((a, b) => a.price - b.price);
    if (sort?.value === "price-high") result.sort((a, b) => b.price - a.price);
    if (sort?.value === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    renderCards(result, grid);
    const count = document.querySelector("[data-product-count]"); if (count) count.textContent = `${result.length} ${result.length === 1 ? "lovely find" : "lovely finds"}`;
  };
  search?.addEventListener("input", paint); category?.addEventListener("change", paint); sort?.addEventListener("change", paint); paint();
}
function renderProductDetail() {
  const root = document.querySelector("[data-product-detail]"); if (!root) return;
  const product = findProduct(new URLSearchParams(location.search).get("id"));
  if (!product) { root.innerHTML = '<div class="empty-state">We couldn’t find that piece. <a class="text-link" href="shop.html">Browse the shop →</a></div>'; return; }
  document.title = `${product.name} — Shugharh's Girly Hub`;
  root.innerHTML = `<div class="product-detail-image" data-rotatable><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}"></div><div class="product-detail-copy"><p class="eyebrow">${escapeHTML(product.category)} · PICKED WITH LOVE</p><h1>${escapeHTML(product.name)}</h1><p class="detail-price">${money(product.price)}</p><p class="detail-description">${escapeHTML(product.description)}</p><span class="detail-select-label">Pick your size</span><div class="size-options">${(product.sizes?.length ? product.sizes : ["One Size"]).map((size, index) => `<label class="size-option"><input type="radio" name="size" value="${escapeHTML(size)}" ${index === 0 ? "checked" : ""}><span>${escapeHTML(size)}</span></label>`).join("")}</div><div class="detail-cart-row"><button class="button button-dark" type="button" data-add-detail="${escapeHTML(product.id)}">Add to my bag <span>♡</span></button><button class="icon-button" type="button" aria-label="Open bag" data-open-cart>♡</button></div><p class="detail-meta">${Number(product.stock) > 0 ? "In stock and ready for a new home" : "Currently sold out"} · Delivery across Ghana</p></div>`;
  const image = root.querySelector("[data-rotatable]"), img = image.querySelector("img"); let down = false, startX = 0, rotation = 0;
  image.addEventListener("pointerdown", event => { down = true; startX = event.clientX; image.setPointerCapture(event.pointerId); });
  image.addEventListener("pointermove", event => { if (!down) return; rotation = Math.max(-18, Math.min(18, (event.clientX - startX) * .14)); img.style.transform = `perspective(700px) rotateY(${rotation}deg) scale(1.025)`; });
  const finish = () => { down = false; img.style.transform = "perspective(700px) rotateY(0)"; }; image.addEventListener("pointerup", finish); image.addEventListener("pointercancel", finish);
}
function renderCheckout() {
  const form = document.querySelector("[data-checkout-form]"); if (!form) return;
  updateCartViews();
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const message = document.querySelector("[data-checkout-message]");
    if (!auth?.currentUser?.emailVerified) {
      message.textContent = "Please sign in with a verified account before placing your order.";
      location.href = accountLoginURL("checkout.html");
      return;
    }
    const items = cartItems();
    if (!items.length) { message.textContent = "Your bag is empty. Find something lovely before checking out."; return; }
    if (items.some(item => Number(item.product.stock) < item.quantity)) { message.textContent = "One of your items no longer has enough stock. Please update your bag."; return; }
    const data = new FormData(form);
    const order = { customerName: String(data.get("name")).trim(), customerEmail: auth.currentUser.email, phone: String(data.get("phone")).trim(), address: String(data.get("address")).trim(), payment: String(data.get("payment")), items: items.map(item => ({ productId: item.product.id, name: item.product.name, size: item.size, quantity: item.quantity, price: item.product.price })), total: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0), status: "Pending", createdAt: new Date().toISOString() };
    const submit = form.querySelector('button[type="submit"]'); submit.disabled = true; submit.textContent = "Placing your order…"; message.textContent = "";
    let orderId = `local-${Date.now()}`;
    let cloudSaved = false;
    if (isFirebaseConfigured) {
      try { const created = await addDoc(collection(db, "orders"), order); orderId = created.id; cloudSaved = true; }
      catch (error) { console.error("Could not save the order to Firestore; keeping it on this device.", error); }
    }
    const localOrders = localRead(ORDER_KEY, []); localOrders.unshift({ ...order, id: orderId });
    const localSaved = localWrite(ORDER_KEY, localOrders);
    if (!cloudSaved && !localSaved) {
      message.textContent = "We couldn't save your order. Please check your connection or browser storage and try again.";
      submit.disabled = false; submit.innerHTML = 'Place my order <span>♡</span>';
      return;
    }
    localWrite(ORDER_LAST_KEY, { id: orderId, total: order.total });
    localWrite(CART_KEY, []);
    location.href = cloudSaved ? "success.html" : "success.html?saved=local";
  });
}
function guardCheckout() {
  const layout = document.querySelector(".checkout-layout");
  if (!layout) return;
  layout.hidden = true;
  if (!auth) {
    location.replace(accountLoginURL("checkout.html"));
    return;
  }
  onAuthStateChanged(auth, user => {
    if (user?.emailVerified) {
      layout.hidden = false;
      return;
    }
    location.replace(accountLoginURL("checkout.html"));
  }, error => {
    console.error("Could not verify the customer account before checkout.", error);
    location.replace(accountLoginURL("checkout.html"));
  });
}
function runConfetti() {
  const canvas = document.querySelector("[data-confetti]"); if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#e9789e", "#f0bb83", "#b799c4", "#f5d477", "#d88b9f"];
  for (let i = 0; i < 75; i++) {
    const piece = document.createElement("i"); piece.className = "confetti-piece"; piece.style.left = `${Math.random() * 100}%`; piece.style.top = `${-Math.random() * 35}px`; piece.style.background = colors[i % colors.length]; piece.style.width = `${5 + Math.random() * 7}px`; piece.style.height = `${7 + Math.random() * 10}px`; piece.style.setProperty("--drift", `${(Math.random() - .5) * 200}px`); piece.style.setProperty("--fall-time", `${2.5 + Math.random() * 2.5}s`); canvas.append(piece); window.setTimeout(() => piece.remove(), 5200);
  }
  const last = localRead(ORDER_LAST_KEY, null); const id = document.querySelector("[data-order-number]"); if (id && last) id.textContent = `Order ${last.id} · ${money(last.total)}`;
  if (new URLSearchParams(location.search).get("saved") === "local") {
    const note = document.querySelector("[data-success-note]");
    if (note) note.textContent = "This order is saved only in this browser; the shop has not received it. Configure Firebase to send and manage real orders.";
  }
}
function setupInteractions() {
  document.querySelectorAll("[data-open-cart]").forEach(button => button.addEventListener("click", openDrawer));
  document.addEventListener("click", event => {
    const close = event.target.closest("[data-close-cart]"); if (close || event.target.matches("[data-drawer-backdrop]")) closeDrawer();
    const quick = event.target.closest("[data-quick-add]"); if (quick) addToCart(quick.dataset.quickAdd, null, quick);
    const detail = event.target.closest("[data-add-detail]"); if (detail) { const size = document.querySelector('input[name="size"]:checked')?.value; addToCart(detail.dataset.addDetail, size, detail); }
    const quantity = event.target.closest("[data-quantity]"); if (quantity) setQuantity(quantity.dataset.key, Number(quantity.dataset.quantity));
    const remove = event.target.closest("[data-remove]"); if (remove) removeFromCart(remove.dataset.remove);
  });
  const menuToggle = document.querySelector("[data-menu-toggle]");
  menuToggle?.addEventListener("click", () => { const nav = document.querySelector("[data-main-nav]"), open = nav.classList.toggle("is-open"); menuToggle.setAttribute("aria-expanded", String(open)); });
  document.querySelector("[data-newsletter-form]")?.addEventListener("submit", event => { event.preventDefault(); toast("You're on the list — thanks for the love! ♡"); event.currentTarget.reset(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDrawer(); });
  document.addEventListener("pointermove", event => { const art = document.querySelector(".hero-art"); if (!art || matchMedia("(prefers-reduced-motion: reduce)").matches) return; const rect = art.getBoundingClientRect(); art.style.setProperty("--mouse-x", `${(event.clientX - rect.left - rect.width / 2) / 40}px`); art.style.setProperty("--mouse-y", `${(event.clientY - rect.top - rect.height / 2) / 40}px`); art.querySelector(".hero-photo").style.transform = `translate(${(event.clientX - rect.left - rect.width / 2) / 32}px,${(event.clientY - rect.top - rect.height / 2) / 32}px)`; });
}
function setupAccountLinks() {
  if (!auth) return;
  onAuthStateChanged(auth, user => {
    document.querySelectorAll("[data-account-link]").forEach(link => {
      if (user?.emailVerified) {
        if (user.email?.toLowerCase() === ADMIN_EMAIL) {
          link.href = `${basePath()}admin/dashboard.html`;
          link.textContent = "Admin dashboard";
        } else {
          link.href = "#";
          link.dataset.accountSignout = "true";
          link.textContent = "Sign out";
        }
      } else {
        link.href = `${basePath()}admin/login.html`;
        link.removeAttribute("data-account-signout");
        link.textContent = "Sign in / Sign up";
      }
    });
  });
  document.addEventListener("click", async event => {
    const link = event.target.closest("[data-account-signout]");
    if (!link) return;
    event.preventDefault();
    try {
      await signOut(auth);
      toast("You are signed out.");
    } catch (error) {
      console.error("Could not sign out of the customer account.", error);
      toast("We couldn't sign you out. Please try again.");
    }
  });
}
function setupReveal() {
  const reveal = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { reveal.forEach(node => node.classList.add("is-visible")); return; }
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: .12 });
  reveal.forEach(node => observer.observe(node));
}
function loadProducts() {
  const cached = localRead(PRODUCT_KEY, null); products = Array.isArray(cached) && cached.length ? cached : defaults;
  localWrite(PRODUCT_KEY, products); renderAllProducts();
  if (isFirebaseConfigured) {
    productUnsubscribe = onSnapshot(query(collection(db, "products"), orderBy("name")), snapshot => {
      if (!snapshot.empty) products = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      else products = localRead(PRODUCT_KEY, defaults);
      localWrite(PRODUCT_KEY, products); renderAllProducts();
    }, error => console.error("Live product updates are unavailable; using saved products.", error));
  }
}
function renderAllProducts() {
  renderCards(products.filter(product => product.featured).slice(0, 4), document.querySelector("[data-featured-products]"));
  renderShop(); renderProductDetail(); updateCartViews();
}
async function init() {
  document.querySelectorAll("[data-site-header]").forEach(node => node.innerHTML = headerMarkup());
  document.querySelectorAll("[data-site-footer]").forEach(node => node.innerHTML = footerMarkup());
  guardCheckout();
  setupAccountLinks();
  setupInteractions(); setupReveal(); loadProducts(); renderCheckout(); runConfetti();
  window.addEventListener("beforeunload", () => productUnsubscribe?.());
}
init();
