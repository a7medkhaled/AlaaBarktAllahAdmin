import { db } from "./firebase-config.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const customerSelect = document.getElementById("customerSelect");
const customerTotalSpent = document.getElementById("customerTotalSpent");
const customerOrderCount = document.getElementById("customerOrderCount");
const customerItemsCount = document.getElementById("customerItemsCount");
const customerProductsList = document.getElementById("customerProductsList");

let allSales = [];
let productsMap = {};

function normalizeCustomerName(value) {
  if (!value) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "object") {
    if (value.name) return value.name;
    if (value.fullName) return value.fullName;
    if (value.displayName) return value.displayName;
    if (value.email) return value.email;
    if (value.uid) return value.uid;
  }
  return String(value);
}

function getCustomerName(data) {
  return normalizeCustomerName(
    data.customerName ||
      data.customer?.name ||
      data.customer?.fullName ||
      data.customer?.displayName ||
      data.client?.name ||
      data.clientName ||
      data.customerEmail ||
      data.customer?.email ||
      "—"
  );
}

function normalizeDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value && typeof value === "object" && typeof value.seconds === "number") {
    return new Date((value.seconds || 0) * 1000 + ((value.nanoseconds || 0) / 1000000));
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") return new Date(value);
  return null;
}

async function loadProducts() {
  try {
    const snap = await getDoc(doc(db, "products", "inventory"));
    productsMap = snap.exists() ? (snap.data().products || {}) : {};
  } catch (err) {
    console.error("Error loading products:", err);
    productsMap = {};
  }
}

function renderProductsForCustomer(customerName) {
  const selectedSales = allSales.filter((sale) => getCustomerName(sale) === customerName);

  const productSummary = {};
  let totalSpent = 0;
  let itemCount = 0;

  selectedSales.forEach((sale) => {
    const items = Array.isArray(sale.items) ? sale.items : [];
    const total = Number(sale.total || 0);
    totalSpent += total;

    items.forEach((item) => {
      const quantity = Number(item.quantity || 0);
      const name = item.name || item.productName || item.id || "منتج غير معروف";
      const price = Number(item.price || 0);
      const key = name;

      if (!productSummary[key]) {
        productSummary[key] = {
          name,
          quantity: 0,
          total: 0,
          lastDate: null,
        };
      }

      productSummary[key].quantity += quantity;
      productSummary[key].total += price * quantity;
      itemCount += quantity;

      const saleDate = normalizeDateValue(sale.timestamp || sale.createdAt || sale.date);
      if (saleDate && (!productSummary[key].lastDate || saleDate > productSummary[key].lastDate)) {
        productSummary[key].lastDate = saleDate;
      }
    });
  });

  customerTotalSpent.textContent = totalSpent.toFixed(2);
  customerOrderCount.textContent = String(selectedSales.length);
  customerItemsCount.textContent = String(itemCount);

  if (!selectedSales.length) {
    customerProductsList.innerHTML = '<li class="empty-state">لا توجد مشتريات لهذا العميل.</li>';
    return;
  }

  const sorted = Object.values(productSummary).sort((a, b) => b.total - a.total);

  customerProductsList.innerHTML = sorted
    .map((product) => {
      const dateText = product.lastDate
        ? product.lastDate.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })
        : "—";

      return `
        <li class="customer-product-item">
          <div>
            <strong>${product.name}</strong>
            <small>الكمية: ${product.quantity}</small>
            <small>الإجمالي: ${product.total.toFixed(2)}</small>
            <small>آخر شراء: ${dateText}</small>
          </div>
        </li>
      `;
    })
    .join("");
}

async function initCustomersPage() {
  if (!customerSelect || !customerTotalSpent || !customerOrderCount || !customerItemsCount || !customerProductsList) return;

  await loadProducts();

  const salesSnapshot = await getDocs(collection(db, "sales"));
  allSales = salesSnapshot.docs.map((docSnap) => docSnap.data());

  const customers = [...new Set(allSales.map((sale) => getCustomerName(sale)).filter((name) => name !== "—"))];

  customerSelect.innerHTML = '<option value="">اختر عميلًا</option>' +
    customers.map((name) => `<option value="${name}">${name}</option>`).join("");

  customerSelect.addEventListener("change", (event) => {
    const selectedCustomer = event.target.value;
    if (!selectedCustomer) {
      customerProductsList.innerHTML = '<li class="empty-state">اختر عميلًا لمشاهدة مشترياته.</li>';
      customerTotalSpent.textContent = "0";
      customerOrderCount.textContent = "0";
      customerItemsCount.textContent = "0";
      return;
    }

    renderProductsForCustomer(selectedCustomer);
  });
}

initCustomersPage();
