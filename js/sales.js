import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

let productsMap = {};
let currentLang = "ar";

function normalizeDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value && typeof value === "object" && typeof value.seconds === "number") {
    return new Date((value.seconds || 0) * 1000 + ((value.nanoseconds || 0) / 1000000));
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "number") return new Date(value);
  return null;
}

function getSaleTimestamp(data) {
  return normalizeDateValue(data?.timestamp || data?.createdAt || data?.date);
}

function formatSaleType(type) {
  if (type === "sale") {
    return currentLang === "ar" ? "بيع" : "Sale";
  }
  if (type === "return" || type === "refund") {
    return currentLang === "ar" ? "مرتجع" : "Return";
  }
  return currentLang === "ar" ? "معاملة" : "Transaction";
}

function initSales() {
  const startDateInput = document.getElementById("startDateFilter");
  const endDateInput = document.getElementById("endDateFilter");
  const exportBtn = document.getElementById("exportBtn");
  const langToggleBtn = document.getElementById("langToggle");

  if (!startDateInput || !endDateInput || !exportBtn || !langToggleBtn) {
    return;
  }

  // Set default date range to today
  const today = new Date().toISOString().split("T")[0];
  startDateInput.value = today;
  endDateInput.value = today;

  loadProducts().then(() => {
    loadReport(startDateInput.value, endDateInput.value);
  });

  // Reload report on date change
  startDateInput.addEventListener("change", () => {
    loadReport(startDateInput.value, endDateInput.value);
  });
  endDateInput.addEventListener("change", () => {
    loadReport(startDateInput.value, endDateInput.value);
  });

  exportBtn.addEventListener("click", () => {
    alert("Export functionality coming soon!");
  });

  langToggleBtn.addEventListener("click", toggleLanguage);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSales);
} else {
  initSales();
}

async function loadProducts() {
  try {
    const docRef = doc(db, "products", "inventory");
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      productsMap = data.products || {};
    } else {
      productsMap = {};
      console.warn("No product data found.");
    }
  } catch (err) {
    console.error("Error loading products:", err);
  }
}

async function loadReport(startDate, endDate) {
  const tbody = document.getElementById("reportTableBody");
  const breakdownBody = document.getElementById("productBreakdownBody");
  const salesSpan = document.getElementById("totalSales");
  const returnsSpan = document.getElementById("totalReturns");
  const revenueSpan = document.getElementById("totalRevenue");
  const costSpan = document.getElementById("totalCost");
  const profitSpan = document.getElementById("totalProfit");
  const transactionsCountSpan = document.getElementById("transactionsCount");
  const itemsSoldCountSpan = document.getElementById("itemsSoldCount");
  const avgOrderValueSpan = document.getElementById("avgOrderValue");

  if (
    !tbody ||
    !breakdownBody ||
    !salesSpan ||
    !returnsSpan ||
    !revenueSpan ||
    !costSpan ||
    !profitSpan ||
    !transactionsCountSpan ||
    !itemsSoldCountSpan ||
    !avgOrderValueSpan
  ) {
    return;
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  tbody.innerHTML = "";
  breakdownBody.innerHTML = "";

  let salesTotal = 0;
  let returnsTotal = 0;
  let costTotal = 0;
  let transactionCount = 0;
  let itemCountTotal = 0;
  let productSummary = {};

  try {
    const allSales = await getDocs(collection(db, "sales"));
    const snapshot = allSales.docs
      .filter((docSnap) => {
        const saleDate = getSaleTimestamp(docSnap.data());
        return saleDate && saleDate >= start && saleDate <= end;
      })
      .sort((a, b) => {
        const dateA = getSaleTimestamp(a.data());
        const dateB = getSaleTimestamp(b.data());
        return (dateB?.getTime?.() || 0) - (dateA?.getTime?.() || 0);
      });

    if (!snapshot.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">${currentLang === "ar" ? "لا توجد مبيعات في هذا التاريخ" : "No sales found for this date range"}</td>
        </tr>
      `;
      salesSpan.textContent = "0";
      returnsSpan.textContent = "0";
      revenueSpan.textContent = "0";
      costSpan.textContent = "0";
      profitSpan.textContent = "0";
      transactionsCountSpan.textContent = "0";
      itemsSoldCountSpan.textContent = "0";
      avgOrderValueSpan.textContent = "0";
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const saleDate = getSaleTimestamp(data);
      const type = (data.type || "sale").toLowerCase();
      const items = Array.isArray(data.items) ? data.items : [];
      const total = Number(data.total || 0);
      const transactionItemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const { customer, user } = getSalePeople(data);

      transactionCount += 1;
      itemCountTotal += transactionItemCount;

      const formattedDate = saleDate
        ? saleDate.toLocaleDateString(currentLang === "ar" ? "ar-EG" : "en-GB", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "—";

      const itemNames = items
        .map((item) => {
          const productName = item.name || item.productName || "منتج";
          const qty = Number(item.quantity || 0);
          const unitLabel = item.isPackage ? "عبوة" : "وحدة";
          return `${productName} × ${qty} ${unitLabel}`;
        })
        .join("<br/>");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${formatSaleType(type)}</td>
        <td>${formattedDate}</td>
        <td>${customer}</td>
        <td>${user}</td>
        <td>${itemNames || "—"}</td>
        <td>${transactionItemCount}</td>
        <td>${Number(total).toFixed(2)}</td>
      `;
      tbody.appendChild(row);

      if (type === "sale") {
        salesTotal += total;
      } else {
        returnsTotal += total;
      }

      items.forEach((item) => {
        const itemId = item.id || item.productId || item.name || "unknown";
        const product = productsMap[itemId] || productsMap[item.id];
        const quantity = Number(item.quantity || 0);
        const isPackage = Boolean(item.isPackage);
        const name = item.name || product?.name || itemId;

        if (!product && !name) return;

        const unitCost = Number(product?.cost || 0);
        const packageCost = Number(product?.pricePerPackage || 0);
        const packageCount = Number(product?.packageCount || 1);
        const itemPrice = Number(item.price || 0);

        let cost = 0;
        let revenue = 0;

        if (isPackage) {
          cost = unitCost * packageCount * quantity;
          revenue = packageCost * quantity;
        } else {
          cost = unitCost * quantity;
          revenue = itemPrice * quantity;
        }

        if (!productSummary[name]) {
          productSummary[name] = {
            sold: 0,
            returned: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }

        const p = productSummary[name];

        if (type === "sale") {
          p.sold += quantity;
          p.revenue += revenue;
          p.cost += cost;
          p.profit += revenue - cost;
          costTotal += cost;
        } else {
          p.returned += quantity;
          p.revenue -= revenue;
          p.cost -= cost;
          p.profit -= revenue - cost;
          costTotal -= cost;
        }
      });
    });

    const revenue = salesTotal - returnsTotal;
    const profit = revenue - costTotal;
    const avgOrder = transactionCount ? revenue / transactionCount : 0;

    salesSpan.textContent = salesTotal.toFixed(2);
    returnsSpan.textContent = returnsTotal.toFixed(2);
    revenueSpan.textContent = revenue.toFixed(2);
    costSpan.textContent = costTotal.toFixed(2);
    profitSpan.textContent = profit.toFixed(2);
    transactionsCountSpan.textContent = transactionCount.toString();
    itemsSoldCountSpan.textContent = itemCountTotal.toString();
    avgOrderValueSpan.textContent = avgOrder.toFixed(2);

    for (const [name, p] of Object.entries(productSummary)) {
      const tr = document.createElement("tr");
      const totalUnits = p.sold - p.returned;
      tr.innerHTML = `
        <td>${name}</td>
        <td>${p.sold}</td>
        <td>${p.returned}</td>
        <td>${totalUnits}</td>
        <td>${p.revenue.toFixed(2)}</td>
        <td>${p.cost.toFixed(2)}</td>
        <td>${p.profit.toFixed(2)}</td>
      `;
      breakdownBody.appendChild(tr);
    }
  } catch (err) {
    console.error("Error loading report:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5">${currentLang === "ar" ? "حدث خطأ في تحميل التقرير" : "Error loading sales report"}</td>
      </tr>
    `;
    salesSpan.textContent = "0";
    returnsSpan.textContent = "0";
    revenueSpan.textContent = "0";
    costSpan.textContent = "0";
    profitSpan.textContent = "0";
    transactionsCountSpan.textContent = "0";
    itemsSoldCountSpan.textContent = "0";
    avgOrderValueSpan.textContent = "0";
  }
}

function toggleLanguage() {
  const html = document.documentElement;
  const btn = document.getElementById("langToggle");

  if (currentLang === "ar") {
    html.setAttribute("lang", "en");
    html.setAttribute("dir", "ltr");
    btn.textContent = "🇸🇦 العربية";
    currentLang = "en";
  } else {
    html.setAttribute("lang", "ar");
    html.setAttribute("dir", "rtl");
    btn.textContent = "🇺🇸 English";
    currentLang = "ar";
  }

  const startDateInput = document.getElementById("startDateFilter");
  const endDateInput = document.getElementById("endDateFilter");
  if (startDateInput && endDateInput) {
    loadReport(startDateInput.value, endDateInput.value);
  }
}

function getDisplayName(value, fallback = "—") {
  if (!value) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "object") {
    if (value.name) return value.name;
    if (value.fullName) return value.fullName;
    if (value.displayName) return value.displayName;
    if (value.email) return value.email;
    if (value.uid) return value.uid;
  }
  return String(value) || fallback;
}

function getSalePeople(data) {
  const customer =
    data.customerName ||
    data.customer?.name ||
    data.customer?.fullName ||
    data.customer?.displayName ||
    data.client?.name ||
    data.clientName ||
    data.customerEmail ||
    data.customer?.email ||
    "—";

  const user =
    data.userName ||
    data.user?.name ||
    data.user?.fullName ||
    data.user?.displayName ||
    data.user?.email ||
    data.createdBy ||
    data.cashier ||
    data.salesman ||
    data.userEmail ||
    data.employee?.name ||
    "—";

  return {
    customer: getDisplayName(customer),
    user: getDisplayName(user),
  };
}
