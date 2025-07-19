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

function initSales() {
  const startDateInput = document.getElementById("startDateFilter");
  const endDateInput = document.getElementById("endDateFilter");
  const exportBtn = document.getElementById("exportBtn");
  const langToggleBtn = document.getElementById("langToggle");

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
      productsMap = snap.data();
      productsMap = productsMap.products;
    } else {
      console.error("No product data found.");
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

  // Parse and set date range with times
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const startTimestamp = Timestamp.fromDate(start);
  const endTimestamp = Timestamp.fromDate(end);

  const salesQuery = query(
    collection(db, "sales"),
    where("timestamp", ">=", startTimestamp),
    where("timestamp", "<=", endTimestamp)
  );

  try {
    const snapshot = await getDocs(salesQuery);

    let salesTotal = 0;
    let returnsTotal = 0;
    let costTotal = 0;
    let productSummary = {};

    tbody.innerHTML = "";
    breakdownBody.innerHTML = "";

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Format timestamp correctly (Firestore Timestamp object)
      const timestampDate = data.timestamp.seconds
        ? new Date(data.timestamp.seconds * 1000)
        : new Date(data.timestamp);

      const formattedDate = timestampDate.toLocaleDateString(
        currentLang === "ar" ? "ar-EG" : "en-GB",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }
      );

      const row = document.createElement("tr");
      const itemNames = data.items
        .map((item) => item.id + " - " + item.name)
        .join("<br/>");

      row.innerHTML = `
        <td>${
          data.type === "sale"
            ? currentLang === "ar"
              ? "بيع"
              : "Sale"
            : currentLang === "ar"
            ? "مرتجع"
            : "Return"
        }</td>
        <td>${formattedDate}</td>
        <td>${itemNames}</td>
        <td>${data.total.toFixed(2)}</td>
      `;

      tbody.appendChild(row);

      if (data.type === "sale") {
        salesTotal += data.total;
      } else {
        returnsTotal += data.total;
      }

      data.items.forEach((item) => {
        console.log(item);
        const product = productsMap[item.id];

        console.log(product);
        if (!product) return;

        const quantity = item.quantity;
        const isPackage = item.isPackage || false;

        // Calculate cost and revenue based on isPackage
        let costPerUnit = product.cost || 0;
        let revenuePerUnit = item.price; // price from sale item
        let cost = 0;
        let revenue = 0;

        if (isPackage) {
          // If selling package, multiply by packageCount
          const packageCount = product.packageCount || 1;
          cost = costPerUnit * packageCount * quantity;
          revenue = product.pricePerPackage * quantity; // revenue is pricePerPackage * quantity of packages sold
        } else {
          // Selling individual units
          cost = costPerUnit * quantity;
          revenue = revenuePerUnit * quantity;
        }
        console.log(cost);

        if (!productSummary[item.name]) {
          productSummary[item.name] = {
            sold: 0,
            returned: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          };
        }

        const p = productSummary[item.name];

        if (data.type === "sale") {
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

    salesSpan.textContent = salesTotal.toFixed(2);
    returnsSpan.textContent = returnsTotal.toFixed(2);
    revenueSpan.textContent = revenue.toFixed(2);
    costSpan.textContent = costTotal.toFixed(2);
    profitSpan.textContent = profit.toFixed(2);

    for (const [name, p] of Object.entries(productSummary)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${name}</td>
        <td>${p.sold}</td>
        <td>${p.returned}</td>
        <td>${p.revenue.toFixed(2)}</td>
        <td>${p.cost.toFixed(2)}</td>
        <td>${p.profit.toFixed(2)}</td>
      `;
      breakdownBody.appendChild(tr);
    }
  } catch (err) {
    alert("Error loading report: " + err.message);
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

  // Reload report to update language on visible texts
  const startDateInput = document.getElementById("startDateFilter");
  const endDateInput = document.getElementById("endDateFilter");
  loadReport(startDateInput.value, endDateInput.value);
}
