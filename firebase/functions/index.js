const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");

admin.initializeApp();
const db = getFirestore();
const REGION = "africa-south1";
const MAIL_COLLECTION = "mail";
const ALLOWED_STATUSES = new Set(["Pending", "Accepted", "Delivered"]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function formatStatus(status) {
  return status === "Accepted" ? "Approved" : status;
}

function buildEmail(orderId, order, status) {
  const displayStatus = formatStatus(status);
  const itemLines = (Array.isArray(order.items) ? order.items : [])
    .map(item => `${Number(item.quantity) || 0} × ${item.name || "Item"} (${item.size || "One Size"})`)
    .join("\n");
  const escapedItems = escapeHtml(itemLines).replace(/\n/g, "<br>");
  const greetingName = escapeHtml(order.customerName || "there");
  const subject = status === "Pending"
    ? `We received your Shugharh's Girly Hub order ${orderId}`
    : `Your order ${orderId} is ${displayStatus.toLowerCase()}`;
  const text = [
    `Hi ${order.customerName || "there"},`,
    "",
    status === "Pending"
      ? `Thank you for your order. It is now ${displayStatus.toLowerCase()}.`
      : `Your order status has been updated to ${displayStatus.toLowerCase()}.`,
    "",
    `Order: ${orderId}`,
    `Items:\n${itemLines}`,
    `Total: GHS ${Number(order.total || 0).toFixed(2)}`,
    "",
    "With love,",
    "Shugharh's Girly Hub"
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#302329;line-height:1.6"><h2 style="color:#a83c65">Hi ${greetingName},</h2><p>${status === "Pending" ? "Thank you for your order. We have received it and it is now pending." : `Your order status has been updated to <strong>${escapeHtml(displayStatus.toLowerCase())}</strong>.`}</p><p><strong>Order:</strong> ${escapeHtml(orderId)}</p><p><strong>Items</strong><br>${escapedItems || "Order items"}</p><p><strong>Total:</strong> GHS ${Number(order.total || 0).toFixed(2)}</p><p>With love,<br>Shugharh's Girly Hub</p></div>`;

  return { to: order.customerEmail, message: { subject, text, html } };
}

async function queueOrderEmail(orderId, order, status) {
  if (!ALLOWED_STATUSES.has(status)) return;
  if (typeof order.customerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerEmail)) {
    logger.warn("Order notification skipped because the order has no valid customer email.", { orderId });
    return;
  }

  const statusKey = status.toLowerCase();
  const marker = db.collection("orders").doc(orderId).collection("emailNotifications").doc(statusKey);
  const mail = db.collection(MAIL_COLLECTION).doc(`${orderId}-${statusKey}`);
  await db.runTransaction(async transaction => {
    const sent = await transaction.get(marker);
    if (sent.exists) return;

    transaction.create(marker, { queuedAt: FieldValue.serverTimestamp() });
    transaction.set(mail, buildEmail(orderId, order, status));
  });
}

exports.emailNewOrder = onDocumentCreated(
  { document: "orders/{orderId}", region: REGION },
  async event => {
    const order = event.data?.data();
    if (!order) return;
    await queueOrderEmail(event.params.orderId, order, "Pending");
  }
);

exports.emailOrderStatus = onDocumentUpdated(
  { document: "orders/{orderId}", region: REGION },
  async event => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === after.status) return;
    await queueOrderEmail(event.params.orderId, after, after.status);
  }
);
