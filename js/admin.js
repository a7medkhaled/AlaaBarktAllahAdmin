import { auth, db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";
import { isDev } from "../settings.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { protectRoute } from "./auth-guard.js";
import { logout } from "./auth.js";

// UI Elements cache
const elements = {
  page: document.getElementById("homePage"),
  userName: document.getElementById("userName"),
  loader: document.getElementById("global-loader"),
  categoryTags: document.getElementById("category-tags"),
  tagTags: document.getElementById("tag-tags"),
  productList: document.getElementById("product-list"),
  searchInput: document.getElementById("search-input"),
  fileUpload: document.getElementById("file-upload"),
};

let allProducts = {};
let filteredProducts = {};
let selectedCategory = "";
let selectedTag = "";

protectRoute(); // Protect the route

// Auth state observer
onAuthStateChanged(auth, (user) => {
  if (user) {
    elements.userName.textContent = user.email;
    elements.loader.style.display = "none";
    elements.page.style.display = "block";
  } else {
    window.location.href = "login.html";
  }
});

// Loader control
function showLoader() {
  elements.loader.style.display = "flex";
}
function hideLoader() {
  elements.loader.style.display = "none";
}

// Load products from Firestore
async function loadProducts() {
  const docRef = doc(db, "products", "inventory");
  const snap = await getDoc(docRef);
  allProducts = snap.exists() ? snap.data().products : {};
  console.log(JSON.stringify(allProducts));
  renderCategoryTags();
  renderTagTags();
  renderProductList();
}

// Render category filter buttons
function renderCategoryTags() {
  const categories = [
    ...new Set(Object.values(allProducts).map((p) => p.category)),
  ];
  elements.categoryTags.innerHTML = "";

  categories.forEach((category) => {
    const btn = document.createElement("button");
    btn.textContent = category;
    btn.className = selectedCategory === category ? "active" : "";
    btn.onclick = () => {
      selectedCategory = selectedCategory === category ? "" : category;
      selectedTag = "";
      renderCategoryTags();
      renderTagTags();
      renderProductList();
    };
    elements.categoryTags.appendChild(btn);
  });
}

// Render tag filter buttons based on selected category
function renderTagTags() {
  elements.tagTags.innerHTML = "";
  if (!selectedCategory) return;

  const tags = new Set();
  Object.values(allProducts).forEach((p) => {
    if (p.category === selectedCategory && Array.isArray(p.tags)) {
      p.tags.forEach((tag) => tags.add(tag));
    }
  });

  tags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.textContent = tag;
    btn.className = selectedTag === tag ? "active" : "";
    btn.onclick = () => {
      selectedTag = selectedTag === tag ? "" : tag;
      renderTagTags();
      renderProductList();
    };
    elements.tagTags.appendChild(btn);
  });
}

// Render filtered product list
function renderProductList() {
  filteredProducts = {};
  const search = elements.searchInput.value.toLowerCase();
  elements.productList.innerHTML = "";

  Object.entries(allProducts).forEach(([id, p]) => {
    const name = String(p.name || "").toLowerCase();
    const matchesSearch = name.includes(search);
    const matchesCategory =
      !selectedCategory || p.category === selectedCategory;
    const matchesTag = !selectedTag || (p.tags && p.tags.includes(selectedTag));

    if (matchesSearch && matchesCategory && matchesTag) {
      filteredProducts[id] = p;
      const showPackagePrice = p.packageCount !== 1;

      const li = document.createElement("li");
      li.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center;">
          <img src="${p.image}" alt="${
        p.name
      }" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
          <div>
            <strong>${p.name}</strong><br>
            <small>المعرف: ${id}</small><br>
            <small>اسم الشركة: ${p.companyName || "—"}</small><br>
            <small>الفئة: ${p.category}</small><br>
            <small>السعر للوحدة: ${p.pricePerUnit} | السعر للوحدة جملة: ${p.pricePerUnitForShops}</small><br>
            ${showPackagePrice ? `<small>السعر للعبوة: ${p.pricePerPackage} | السعر للعبوة جملة: ${p.priceOfPackageForShops}</small><br>` : ""}
            <small>التكلفة: ${p.cost}</small><br>
            ${showPackagePrice ? `<small>عدد العبوة: ${p.packageCount} وحدة</small><br>` : ""}
            <small>الكمية: ${p.stockUnits} وحدة</small><br>
            <small>الوسوم: ${p.tags?.join(", ") || "—"}</small>
          </div>
        </div>`;
      elements.productList.appendChild(li);
    }
  });
}

// CSV parsing utility
function parseCSV(text) {
  const [header, ...lines] = text.trim().split("\n");
  const keys = header.split(",").map((k) => k.trim());

  return lines.map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj = {};
    keys.forEach((k, i) => (obj[k] = values[i]));
    obj.tags = obj.tags?.split(",").map((t) => t.trim()) || [];
    obj.pricePerUnit = parseFloat(obj.pricePerUnit);
    obj.pricePerUnitForShops = parseFloat(obj.pricePerUnitForShops);
    obj.pricePerPackage = parseFloat(obj.pricePerPackage);
    obj.cost = parseFloat(obj.cost);
    obj.packageCount = parseInt(obj.packageCount);
    obj.stockUnits = parseInt(obj.stockUnits);
    obj.companyName = obj.companyName?.trim();
    return [obj.id || obj.name, obj];
  });
}

// Export helpers
function exportToCSV(products) {
  const headers = [
    "id",
    "name",
    "companyName",
    "pricePerUnit",
    "pricePerUnitForShops",
    "pricePerPackage",
    "priceOfPackageForShops",
    "cost",
    "stockUnits",
    "packageCount",
    "category",
    "tags",
    "image",
  ];
  const csv = [
    headers.join(","),
    ...Object.entries(products).map(([id, p]) =>
      [
        id,
        p.name,
        p.companyName || "",
        p.pricePerUnit,
        p.pricePerUnitForShops,
        p.pricePerPackage,
        p.priceOfPackageForShops,
        p.cost,
        p.stockUnits,
        p.packageCount,
        p.category,
        (p.tags || []).join(";"),
        p.image,
      ].join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "products.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(data, filename = "products.json") {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Normalize product data (tags & numbers)
function normalizeProduct(prod) {
  let tags = [];
  if (Array.isArray(prod.tags)) {
    tags = prod.tags;
  } else if (typeof prod.tags === "string") {
    tags = prod.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return {
    ...prod,
    companyName: prod.companyName?.trim() || "",
    pricePerUnit: parseFloat(prod.pricePerUnit) || 0,
    pricePerUnitForShops: parseFloat(prod.pricePerUnitForShops) || 0,
    pricePerPackage: parseFloat(prod.pricePerPackage) || 0,
    cost: parseFloat(prod.cost) || 0,
    packageCount: parseInt(prod.packageCount) || 0,
    stockUnits: parseInt(prod.stockUnits) || 0,
    tags,
  };
}

// Validate mandatory fields
function validateProduct(prod, id) {
  if (!prod.name || !prod.category) {
    throw new Error(`المنتج "${id}" مفقود فيه الاسم أو الفئة`);
  }
}

// Export products to Excel using XLSX
function exportToExcel(products, filename = "products.xlsx") {
  const headers = [
    "id",
    "name",
    "companyName",
    "pricePerUnit",
    "pricePerUnitForShops",
    "pricePerPackage",
    "priceOfPackageForShops",
    "cost",
    "stockUnits",
    "packageCount",
    "category",
    "tags",
    "image",
  ];

  const data = [
    headers,
    ...Object.entries(products).map(([id, p]) => [
      id,
      p.name,
      p.companyName || "",
      p.pricePerUnit,
      p.pricePerUnitForShops,
      p.pricePerPackage,
      p.priceOfPackageForShops,
      p.cost,
      p.stockUnits,
      p.packageCount,
      p.category,
      (p.tags || []).join(", "),
      p.image,
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

// Event bindings
document.getElementById("export-excel").addEventListener("click", () => {
  exportToExcel(filteredProducts);
});

document.addEventListener("DOMContentLoaded", () => {
  if (isDev) {
    const titleEl = document.getElementById("title");
    titleEl.textContent = `${titleEl.textContent} DEV`;
  }

  loadProducts();

  document.getElementById("logout").addEventListener("click", async () => {
    await logout();
    window.location.href = "/login.html";
  });

  elements.searchInput.addEventListener("input", renderProductList);

  document.getElementById("export-json").addEventListener("click", () => {
    downloadJSON(filteredProducts);
  });

  document.getElementById("export-csv").addEventListener("click", () => {
    exportToCSV(filteredProducts);
  });

  document.getElementById("custom-file-btn").addEventListener("click", () => {
    elements.fileUpload.click();
  });

  elements.fileUpload.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoader();

    try {
      const newProducts = {};

      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        const parsed = parseCSV(text);
        parsed.forEach(([id, prod]) => {
          newProducts[id] = normalizeProduct(prod);
        });
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        rows.forEach((row) => {
          const { id, ...prod } = row;
          if (id) newProducts[id] = normalizeProduct(prod);
        });
      } else {
        const text = await file.text();
        const parsed = JSON.parse(text);
        Object.entries(parsed).forEach(([id, prod]) => {
          newProducts[id] = normalizeProduct(prod);
        });
      }

      const docRef = doc(db, "products", "inventory");
      const snap = await getDoc(docRef);
      const existingProducts = snap.exists() ? snap.data().products : {};

      Object.entries(newProducts).forEach(([id, prod]) => {
        validateProduct(prod, id);
        console.log(JSON.stringify(prod));

        if (existingProducts[id]) {
          existingProducts[id].stockUnits =
            (existingProducts[id].stockUnits || 0) + (prod.stockUnits || 0);
          existingProducts[id] = {
            ...existingProducts[id],
            ...prod,
            stockUnits: existingProducts[id].stockUnits,
          };
        } else {
          existingProducts[id] = prod;
         
        }
      });

      await setDoc(docRef, { products: existingProducts });

      alert("✅ تم رفع وتحديث المنتجات بنجاح");
      await loadProducts();
    } catch (err) {
      console.error(err);
      alert("❌ حدث خطأ في قراءة الملف: " + err.message);
    } finally {
      hideLoader();
    }
  });
});
