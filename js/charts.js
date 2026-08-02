import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

function toDateOnly(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getDefaultDateRange() {
  const today = new Date();
  const start = toDateOnly(today);
  const end = toDateOnly(today);
  return { start, end };
}

function getRangeFromInputs() {
  const startInput = document.getElementById("startDateFilter");
  const endInput = document.getElementById("endDateFilter");

  const fallback = getDefaultDateRange();
  const startDate = startInput && startInput.value ? new Date(startInput.value) : fallback.start;
  const endDate = endInput && endInput.value ? new Date(endInput.value) : fallback.end;

  const start = toDateOnly(startDate);
  let end = toDateOnly(endDate);

  if (end < start) {
    end = new Date(start);
  }

  return { start, end };
}

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

function formatDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateLabels(start, end) {
  const labels = [];
  const map = {};
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const finalDate = new Date(end);
  finalDate.setHours(0, 0, 0, 0);

  while (cursor <= finalDate) {
    const key = formatDayKey(cursor);
    labels.push(`${cursor.getDate()}/${cursor.getMonth() + 1}`);
    map[key] = labels.length - 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return { labels, map };
}

function renderDailyChart(dailyData, start, end) {
  const dailyChartEl = document.getElementById("dailyChart");
  if (!dailyChartEl) return;

  if (window.dailyChartInstance) {
    window.dailyChartInstance.destroy();
  }

  const { labels, map } = getDateLabels(start, end);
  const values = Array(labels.length).fill(0);

  dailyData.forEach(([dateKey, total]) => {
    if (!dateKey || !Number.isFinite(total)) return;
    const idx = map[dateKey];
    if (typeof idx === "number") {
      values[idx] = total;
    }
  });

  window.dailyChartInstance = new Chart(dailyChartEl, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "الإيراد",
          data: values,
          borderColor: "#ff7a59",
          backgroundColor: "rgba(255, 122, 89, 0.18)",
          tension: 0.35,
          fill: true,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => `${value}` },
        },
      },
    },
  });
}

function renderProductChart(productData) {
  const productChartEl = document.getElementById("productChart");
  if (!productChartEl) return;

  if (window.productChartInstance) {
    window.productChartInstance.destroy();
  }

  const labels = productData.map(([name]) => name);
  const values = productData.map(([, total]) => total);

  window.productChartInstance = new Chart(productChartEl, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "المبيعات",
          data: values,
          backgroundColor: [
            "#ff7a59",
            "#ffd166",
            "#06d6a0",
            "#118ab2",
            "#8ecae6",
          ],
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { beginAtZero: true },
      },
    },
  });
}

async function loadCharts() {
  const dailyChartEl = document.getElementById("dailyChart");
  const productChartEl = document.getElementById("productChart");

  if (!dailyChartEl || !productChartEl) {
    return;
  }

  const { start, end } = getRangeFromInputs();
  const { labels, map } = getDateLabels(start, end);
  const dailyMap = {};
  const productMap = {};

  const startInput = document.getElementById("startDateFilter");
  const endInput = document.getElementById("endDateFilter");

  if (startInput && !startInput.value) {
    startInput.value = start.toISOString().split("T")[0];
  }
  if (endInput && !endInput.value) {
    endInput.value = end.toISOString().split("T")[0];
  }

  try {
    const snapshot = await getDocs(collection(db, "sales"));

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const saleDate = getSaleTimestamp(data);
      if (!saleDate) return;

      const saleTime = toDateOnly(saleDate);
      if (saleTime < start || saleTime > end) {
        return;
      }

      const type = String(data.type || "sale").toLowerCase();
      const itemTotal = Number(data.total || 0);
      const key = formatDayKey(saleTime);

      if (type === "sale") {
        dailyMap[key] = (dailyMap[key] || 0) + itemTotal;
      } else if (type === "return" || type === "refund") {
        dailyMap[key] = (dailyMap[key] || 0) - itemTotal;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      items.forEach((item) => {
        const name = item.name || item.productName || item.id || "غير معروف";
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.price || 0);
        const itemRevenue = unitPrice * quantity;

        if (!Number.isFinite(itemRevenue)) return;
        if (type === "sale") {
          productMap[name] = (productMap[name] || 0) + itemRevenue;
        } else if (type === "return" || type === "refund") {
          productMap[name] = (productMap[name] || 0) - itemRevenue;
        }
      });
    });

    const dailySeries = labels.map((_, idx) => {
      const cursor = new Date(start);
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() + idx);
      return [formatDayKey(cursor), dailyMap[formatDayKey(cursor)] || 0];
    });

    const topProducts = Object.entries(productMap)
      .filter(([, total]) => Number.isFinite(total))
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 5);

    renderDailyChart(dailySeries, start, end);
    renderProductChart(topProducts.length ? topProducts : [["لا توجد بيانات", 0]]);
  } catch (error) {
    console.error("Error loading chart data:", error);
    renderDailyChart([], start, end);
    renderProductChart([["لا توجد بيانات", 0]]);
  }
}

function initCharts() {
  const startDateInput = document.getElementById("startDateFilter");
  const endDateInput = document.getElementById("endDateFilter");

  if (!startDateInput || !endDateInput) {
    return;
  }

  const { start, end } = getDefaultDateRange();
  startDateInput.value = start.toISOString().split("T")[0];
  endDateInput.value = end.toISOString().split("T")[0];

  startDateInput.addEventListener("change", loadCharts);
  endDateInput.addEventListener("change", loadCharts);

  loadCharts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCharts);
} else {
  initCharts();
}
