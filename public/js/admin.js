import { auth, db, storage, isFirebaseConfigured } from "./firebase-config.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, addDoc, updateDoc, setDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const ADMIN_EMAIL = "ansomaacharity112@icloud.com";
const PRODUCT_KEY = "sgh-products-v1", ORDER_KEY = "sgh-orders-v1";
const seed = [
  { id: "sunday-girl-top", name: "The Sunday Girl Top", category: "Crop Top", price: 125, description: "A little playful, a little polished. This soft, easy-to-style crop top is your go-to for sunny plans and slow Sundays.", sizes: ["S", "M", "L"], stock: 12, image: "https://images.unsplash.com/photo-1551163943-3f6a855d1153?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "rosy-day-dress", name: "Rosy Day Dress", category: "Dress", price: 220, description: "The throw-it-on-and-feel-amazing dress. Light, lovely, and ready for brunch dates and birthday plans.", sizes: ["S", "M", "L"], stock: 8, image: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "peachy-keen-top", name: "Peachy Keen Top", category: "Short Top", price: 110, description: "A sweet little short top with a comfy fit and all the feel-good energy.", sizes: ["S", "M", "L"], stock: 9, image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85", featured: true },
  { id: "little-love-bag", name: "Little Love Bag", category: "Accessories", price: 145, description: "A lovely finishing touch for all your everyday essentials.", sizes: ["One Size"], stock: 6, image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85", featured: true }
];
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const money = value => `GHS ${Number(value || 0).toFixed(2)}`;
const readLocal = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (error) { console.error(`Could not read ${key}.`, error); return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.error(`Could not save ${key}.`, error); return false; } };
let products = [], orders = [], liveUnsubscribers = [];
const isLogin = location.pathname.endsWith("/login.html");

function loginDestination(user) {
  if (user.email?.toLowerCase() === ADMIN_EMAIL) return "dashboard.html";
  return new URLSearchParams(location.search).get("next") === "checkout.html" ? "../checkout.html" : "../index.html";
}

function shellMarkup() {
  const page = location.pathname.split("/").pop();
  return `<aside class="admin-sidebar"><a class="brand" href="dashboard.html"><img src="../assets/logo.jpeg" class="brand-logo" alt=""><span>Shugharh's Girly Hub<small>ADMIN STUDIO</small></span></a><nav class="admin-nav"><a class="${page === "dashboard.html" ? "active" : ""}" href="dashboard.html"><span>⌂</span>Overview</a><a class="${page === "upload.html" ? "active" : ""}" href="upload.html"><span>✿</span>Products</a><a class="${page === "orders.html" ? "active" : ""}" href="orders.html"><span>♡</span>Orders</a></nav><div class="admin-side-bottom"><a href="../index.html">↗ View the shop</a><a href="#" data-admin-signout>← Sign out</a></div></aside>`;
}
function message(text, isError = false) { const node = document.querySelector("[data-login-message], [data-admin-message], [data-product-message]"); if (node) { node.textContent = text; node.style.color = isError ? "#a84655" : ""; } }
function renderProducts() {
  document.querySelectorAll("[data-admin-products]").forEach(root => {
    root.innerHTML = products.length ? products.map(product => `<article class="admin-product-row"><img src="${escapeHTML(product.image)}" alt=""><div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.category)} · Stock: ${Number(product.stock) || 0}</small></div><span class="row-price">${money(product.price)}</span><div class="row-actions"><button class="tiny-button" type="button" data-edit-product="${escapeHTML(product.id)}">Edit</button><button class="tiny-button danger" type="button" data-delete-product="${escapeHTML(product.id)}">Delete</button></div></article>`).join("") : '<p class="empty-state">No products yet. Add your first little pretty. ♡</p>';
  });
  const stat = document.querySelector("[data-stat-products]"); if (stat) stat.textContent = String(products.length);
}
function renderOrders() {
  const root = document.querySelector("[data-admin-orders]"); if (!root) return;
  const filter = document.querySelector("[data-order-filter]")?.value || "all";
  const visible = filter === "all" ? orders : orders.filter(order => order.status === filter);
  const count = document.querySelector("[data-order-count]"); if (count) count.textContent = `${visible.length} ${visible.length === 1 ? "order" : "orders"}`;
  root.innerHTML = visible.length ? visible.map(order => {
    const status = order.status || "Pending", phone = String(order.phone || "").replace(/[^\d+]/g, "");
    const items = (order.items || []).map(item => `${escapeHTML(item.name)} · ${escapeHTML(item.size)} × ${Number(item.quantity)}`).join("<br>");
    return `<article class="order-card"><div class="order-card-head"><div><h2>${escapeHTML(order.customerName || "Customer order")}</h2><small>${escapeHTML(order.id || "")} · ${new Date(order.createdAt || Date.now()).toLocaleString()}</small></div><span class="order-status ${status.toLowerCase()}">${escapeHTML(status)}</span></div><div class="order-details"><div><small>Email</small><strong>${escapeHTML(order.customerEmail || "Not available")}</strong></div><div><small>Phone</small><strong>${escapeHTML(order.phone)}</strong></div><div><small>Payment</small><strong>${escapeHTML(order.payment)}</strong></div><div><small>Delivery address</small><strong>${escapeHTML(order.address)}</strong></div><div><small>Items ordered</small><div class="order-items-list">${items || "No item details"}</div></div></div><div class="order-card-foot"><strong class="order-total">${money(order.total)}</strong><div class="order-actions"><a class="tiny-button" href="https://wa.me/${encodeURIComponent(phone.replace(/^\+/, ""))}?text=${encodeURIComponent(`Hi ${order.customerName || "there"}! We're reaching out about your Shugharh's Girly Hub order ${order.id || ""}.`)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>${status === "Pending" ? `<button class="tiny-button" type="button" data-order-status="Accepted" data-order-id="${escapeHTML(order.id)}">Approve order</button>` : ""}${status !== "Delivered" ? `<button class="tiny-button" type="button" data-order-status="Delivered" data-order-id="${escapeHTML(order.id)}">Mark delivered</button>` : ""}</div></div></article>`;
  }).join("") : '<div class="no-orders">No orders to show just yet. Your next happy mail is on its way. ♡</div>';
  const total = document.querySelector("[data-stat-orders]"); if (total) total.textContent = String(orders.length);
  const pending = document.querySelector("[data-stat-pending]"); if (pending) pending.textContent = String(orders.filter(order => (order.status || "Pending") === "Pending").length);
}
function setFormValues(product) {
  const form = document.querySelector("[data-product-form]"); if (!form) return;
  form.elements.id.value = product.id || ""; form.elements.name.value = product.name || ""; form.elements.description.value = product.description || ""; form.elements.price.value = product.price || ""; form.elements.stock.value = product.stock ?? ""; form.elements.category.value = product.category || "";
  form.querySelectorAll('input[name="sizes"]').forEach(input => { input.checked = (product.sizes || []).includes(input.value); });
  const preview = document.querySelector("[data-image-preview]");
  if (preview) preview.innerHTML = product.image ? `<img src="${escapeHTML(product.image)}" alt="Current product image"><strong>Current image</strong><small>Choose another photo to replace it</small>` : '<i>＋</i><strong>Choose a product photo</strong><small>JPG, PNG, or WebP · up to 5 MB</small>';
  document.querySelector("[data-form-title]").textContent = product.id ? "Edit this product" : "Add a product";
  document.querySelector('[data-product-form] button[type="submit"]').innerHTML = product.id ? "Update product <span>♡</span>" : "Save product <span>♡</span>";
  document.querySelector("[data-product-message]").textContent = "";
  document.querySelector("[data-product-form]").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function saveProduct(event) {
  event.preventDefault(); const form = event.currentTarget, data = new FormData(form), id = String(data.get("id") || "");
  const imageFile = data.get("image");
  if (imageFile?.size > 5 * 1024 * 1024) { message("That photo is a little too big. Please choose an image under 5 MB.", true); return; }
  const existing = products.find(product => product.id === id);
  let image = existing?.image || "";
  if (imageFile?.size) {
    if (isFirebaseConfigured) {
      try { const fileRef = ref(storage, `products/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`); await uploadBytes(fileRef, imageFile); image = await getDownloadURL(fileRef); }
      catch (error) { console.error("Product image upload failed.", error); message("Image upload failed. Firebase Storage for this project requires the Blaze billing plan. The product was not saved.", true); return; }
    } else {
      if (imageFile.size > 1.5 * 1024 * 1024) { message("For local-only mode, choose an image under 1.5 MB. Configure Firebase Storage for larger images.", true); return; }
      image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Could not read the selected image.")); reader.readAsDataURL(imageFile); });
    }
  }
  if (!image) { message("Please choose a product image before saving.", true); return; }
  const product = { name: String(data.get("name")).trim(), description: String(data.get("description")).trim(), price: Number(data.get("price")), stock: Number(data.get("stock")), category: String(data.get("category")), sizes: data.getAll("sizes").map(String), image, featured: existing?.featured || false, updatedAt: new Date().toISOString() };
  if (!product.sizes.length) { message("Choose at least one available size.", true); return; }
  if (!Number.isFinite(product.price) || product.price <= 0 || !Number.isInteger(product.stock) || product.stock < 0) { message("Enter a valid price and whole-number stock amount.", true); return; }
  try {
    if (isFirebaseConfigured) {
      const refDoc = id && !id.startsWith("local-") ? doc(db, "products", id) : null;
      if (refDoc) await setDoc(refDoc, product, { merge: true }); else { const created = await addDoc(collection(db, "products"), product); product.id = created.id; }
    } else {
      product.id = id || `local-${Date.now()}`;
      const updatedProducts = [...products], index = updatedProducts.findIndex(entry => entry.id === id);
      if (index >= 0) updatedProducts[index] = product; else updatedProducts.unshift(product);
      if (!writeLocal(PRODUCT_KEY, updatedProducts)) { message("Could not save products in this browser. Check device storage and try again.", true); return; }
      products = updatedProducts;
    }
    message("Product saved — looking lovely! ♡");
    form.reset(); setFormValues({}); renderProducts();
  } catch (error) { console.error("Could not save the product.", error); message("The product could not be saved. Check Firebase permissions or try again.", true); }
}
async function deleteProduct(id) {
  const product = products.find(item => item.id === id); if (!product || !confirm(`Delete "${product.name}" from the shop?`)) return;
  try {
    if (isFirebaseConfigured && !id.startsWith("local-")) { await deleteDoc(doc(db, "products", id)); if (product.image?.includes("firebasestorage")) { try { await deleteObject(ref(storage, product.image)); } catch (error) { console.error("Product removed, but its storage image could not be deleted.", error); } } }
    const remaining = products.filter(item => item.id !== id);
    if (!isFirebaseConfigured && !writeLocal(PRODUCT_KEY, remaining)) { message("The product could not be removed from this browser. Check device storage and try again.", true); return; }
    products = remaining; if (isFirebaseConfigured) writeLocal(PRODUCT_KEY, products); renderProducts();
  } catch (error) { console.error("Could not delete the product.", error); message("This product could not be deleted. Check Firebase permissions and try again.", true); }
}
async function updateOrder(id, status) {
  const order = orders.find(item => item.id === id); if (!order) return;
  try {
    if (isFirebaseConfigured && !id.startsWith("local-")) await updateDoc(doc(db, "orders", id), { status });
    order.status = status; writeLocal(ORDER_KEY, orders); renderOrders();
  } catch (error) { console.error("Could not update order status.", error); message("Order status could not be updated. Check Firebase permissions.", true); }
}
function listenData() {
  products = readLocal(PRODUCT_KEY, null) || seed;
  orders = readLocal(ORDER_KEY, []);
  renderProducts(); renderOrders();
  if (!isFirebaseConfigured) return;
  try {
    liveUnsubscribers.push(onSnapshot(query(collection(db, "products"), orderBy("name")), snapshot => { products = snapshot.empty ? (readLocal(PRODUCT_KEY, seed)) : snapshot.docs.map(item => ({ ...item.data(), id: item.id })); writeLocal(PRODUCT_KEY, products); renderProducts(); }, error => { console.error("Live product data unavailable.", error); message("Could not load live products. Check Firestore rules.", true); }));
    liveUnsubscribers.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), snapshot => { orders = snapshot.docs.map(item => ({ ...item.data(), id: item.id })); writeLocal(ORDER_KEY, orders); renderOrders(); }, error => { console.error("Live order data unavailable.", error); message("Could not load live orders. Check Firestore rules.", true); }));
  } catch (error) { console.error("Could not subscribe to shop data.", error); message("Could not connect to Firebase. Check your project setup.", true); }
}
function setupAdminUI() {
  document.querySelector("[data-admin-shell]")?.insertAdjacentHTML("afterbegin", shellMarkup());
  document.querySelector("[data-admin-signout]")?.addEventListener("click", async event => { event.preventDefault(); if (auth) await signOut(auth); location.href = "login.html"; });
  const form = document.querySelector("[data-product-form]");
  form?.addEventListener("submit", saveProduct);
  form?.addEventListener("reset", () => window.setTimeout(() => setFormValues({}), 0));
  document.querySelector("[data-reset-product]")?.addEventListener("click", () => setFormValues({}));
  document.querySelector("[data-image-input]")?.addEventListener("change", event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { message("Please choose an image file.", true); return; }
    if (file.size > 5 * 1024 * 1024) { message("Please choose an image under 5 MB.", true); return; }
    const preview = document.querySelector("[data-image-preview]"), url = URL.createObjectURL(file); preview.innerHTML = `<img src="${url}" alt="Selected product preview"><strong>Looking lovely</strong><small>${escapeHTML(file.name)}</small>`;
  });
  document.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit-product]"); if (edit) { const product = products.find(item => item.id === edit.dataset.editProduct); if (product) setFormValues(product); }
    const remove = event.target.closest("[data-delete-product]"); if (remove) deleteProduct(remove.dataset.deleteProduct);
    const status = event.target.closest("[data-order-status]"); if (status) updateOrder(status.dataset.orderId, status.dataset.orderStatus);
  });
  document.querySelector("[data-order-filter]")?.addEventListener("change", renderOrders);
}
function initLogin() {
  const form = document.querySelector("[data-account-login]");
  const signupForm = document.querySelector("[data-account-signup]");
  const signupToggle = document.querySelector("[data-toggle-account-setup]");
  const resendButton = document.querySelector("[data-resend-verification]");
  const returnToCheckout = new URLSearchParams(location.search).get("next") === "checkout.html";
  const intro = document.querySelector("[data-account-intro]");
  if (returnToCheckout && intro) intro.textContent = "Sign in or create an account to continue to checkout. Your bag will be waiting.";
  if (!isFirebaseConfigured) { message("Firebase web app settings are missing. Add them in js/firebase-config.js before signing in.", true); }
  if (!auth) {
    const unavailable = event => { event.preventDefault(); message("Firebase is not configured. Add your web app settings to enable secure admin access.", true); };
    form?.addEventListener("submit", unavailable);
    signupForm?.addEventListener("submit", unavailable);
    return;
  }
  signupToggle?.addEventListener("click", () => {
    signupForm.hidden = !signupForm.hidden;
    signupToggle.setAttribute("aria-expanded", String(!signupForm.hidden));
    if (!signupForm.hidden) signupForm.elements.email.focus();
  });
  onAuthStateChanged(auth, user => {
    if (!user) { resendButton.hidden = true; return; }
    if (!user.emailVerified) {
      resendButton.hidden = false;
      message("This account's email isn't verified yet. Check your inbox and spam folder for the Firebase verification email.");
      return;
    }
    resendButton.hidden = true;
    location.href = loginDestination(user);
  });
  resendButton?.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (user?.emailVerified) {
      location.href = loginDestination(user);
      return;
    }
    if (!user) { message("Sign in first to request a verification email.", true); return; }
    resendButton.disabled = true;
    try {
      await sendEmailVerification(user);
      message("Verification email sent. Check your inbox and spam folder.");
    } catch (error) {
      console.error("Could not resend the Firebase verification email.", error);
      message(error.code === "auth/too-many-requests"
        ? "Firebase is temporarily limiting verification emails. Wait a while, then try again. Check for an earlier message in your inbox or spam folder."
        : "Firebase couldn't send the verification email. Check your connection and try again.", true);
    } finally { resendButton.disabled = false; }
  });
  form?.addEventListener("submit", async event => {
    event.preventDefault(); const data = new FormData(form), submit = form.querySelector('button[type="submit"]'); submit.disabled = true;
    message("");
    try {
      const credential = await signInWithEmailAndPassword(auth, String(data.get("email")).trim(), String(data.get("password")));
      if (!credential.user.emailVerified) {
        resendButton.hidden = false;
        message("This account's email isn't verified yet. Check your inbox and spam folder, then use Resend verification email if needed.", true);
        return;
      }
      resendButton.hidden = true;
      location.href = loginDestination(credential.user);
    } catch (error) {
      console.error("Firebase sign-in failed.", error);
      if (auth.currentUser && !auth.currentUser.emailVerified) await signOut(auth);
      message(error.code === "auth/invalid-credential" ? "That email and password combination doesn't look right."
        : error.code === "auth/too-many-requests" ? "Firebase is temporarily limiting sign-in attempts. Wait a while before trying again."
          : "We couldn't sign you in. Check your email and password, then try again.", true);
    }
    finally { submit.disabled = false; }
  });
  signupForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const data = new FormData(signupForm);
    const email = String(data.get("email")).trim().toLowerCase();
    const password = String(data.get("password"));
    const confirmPassword = String(data.get("confirmPassword"));
    const submit = signupForm.querySelector('button[type="submit"]');
    if (password.length < 12) { message("Choose a password with at least 12 characters.", true); return; }
    if (password !== confirmPassword) { message("The passwords don't match. Please check and try again.", true); return; }
    submit.disabled = true; message("");
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await sendEmailVerification(credential.user);
        await signOut(auth);
        signupForm.reset();
        message("Account created. Check your email and verify it before signing in.");
      } catch (error) {
        console.error("Account was created, but its verification email could not be sent.", error);
        await signOut(auth);
        message(error.code === "auth/too-many-requests"
          ? "The account was created, but Firebase is temporarily limiting verification emails. Wait a while, then sign in and request another."
          : "The account was created, but Firebase couldn't send the verification email. Sign in and request another.", true);
      }
    } catch (error) {
      console.error("Could not create the Firebase account.", error);
      message(error.code === "auth/email-already-in-use" ? "That account already exists. Sign in; if it isn't verified, Firebase will send a verification email." : "Could not create the account. Check your email and Firebase Authentication settings.", true);
    } finally { submit.disabled = false; }
  });
}
function initDashboard() {
  if (!isFirebaseConfigured) message("Firebase isn't configured, so admin data is limited to this browser.");
  setupAdminUI(); listenData(); window.addEventListener("beforeunload", () => liveUnsubscribers.forEach(unsubscribe => unsubscribe()));
}
if (isLogin) initLogin();
else if (auth) onAuthStateChanged(auth, user => { if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL || !user.emailVerified) { if (user) signOut(auth); location.href = "login.html"; return; } initDashboard(); });
else { location.href = "login.html"; }
