import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import * as XLSX from "https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs";

let allProducts = {};
let filteredProducts = {};
let selectedCategory = "";
let selectedTag = "";

function showLoader() {
  document.getElementById("global-loader").style.display = "flex";
}
function hideLoader() {
  document.getElementById("global-loader").style.display = "none";
}

async function loadProducts() {
  const docRef = doc(db, "products", "inventory");
  const snap = await getDoc(docRef);
  allProducts = snap.exists() ? snap.data().products : {};
  renderCategoryTags();
  renderTagTags();
  renderProductList();
}

function renderCategoryTags() {
  const container = document.getElementById("category-tags");
  container.innerHTML = "";
  const categories = [
    ...new Set(Object.values(allProducts).map((p) => p.category)),
  ];
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
    container.appendChild(btn);
  });
}

function renderTagTags() {
  console.log(allProducts);
  const container = document.getElementById("tag-tags");
  container.innerHTML = "";
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
    container.appendChild(btn);
  });
}

function renderProductList() {
  filteredProducts = {};
  const list = document.getElementById("product-list");
  list.innerHTML = "";
  const search = document.getElementById("search-input").value.toLowerCase();

  Object.entries(allProducts).forEach(([id, p]) => {
    const matchesSearch = p.name.toLowerCase().includes(search);
    const matchesCategory =
      !selectedCategory || p.category === selectedCategory;
    const matchesTag = !selectedTag || (p.tags && p.tags.includes(selectedTag));

    if (matchesSearch && matchesCategory && matchesTag) {
      filteredProducts[id] = p;
      const li = document.createElement("li");
      li.innerHTML = `
        <div style="display: flex; gap: 1rem; align-items: center;">
          <img src="${p.image}" alt="${
        p.name
      }" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
          <div>
            <strong>${p.name}</strong><br>
            <small>المعرف: ${id}</small><br>
            <small>الفئة: ${p.category}</small><br>
            <small>السعر للوحدة: ${p.pricePerUnit} | السعر للعبوة: ${
        p.pricePerPackage
      }      |  السعر للعبوة جملة: ${
        p.priceOfPackageForShops
      }</small><br></small><br>
            <small>التكلفة: ${p.cost}</small><br>
            <small>عدد العبوة: ${p.packageCount} وحدة</small><br>
            <small>الكمية: ${p.stockUnits} وحدة</small><br>
            <small>الوسوم: ${p.tags?.join(", ") || "—"}</small>
          </div>
        </div>
      `;
      list.appendChild(li);
    }
  });
}

function parseCSV(text) {
  const [header, ...lines] = text.trim().split("\n");
  const keys = header.split(",").map((k) => k.trim());
  return lines.map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj = {};
    keys.forEach((k, i) => (obj[k] = values[i]));
    obj.tags = obj.tags?.split(",").map((tag) => tag.trim()) || [];
    obj.pricePerUnit = parseFloat(obj.pricePerUnit);
    obj.pricePerPackage = parseFloat(obj.pricePerPackage);
    obj.cost = parseFloat(obj.cost);
    obj.packageCount = parseInt(obj.packageCount);
    obj.stockUnits = parseInt(obj.stockUnits);
    return [obj.id || obj.name, obj];
  });
}

function exportToCSV(products) {
  const headers = [
    "id",
    "name",
    "pricePerUnit",
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
        p.pricePerUnit,
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
}

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
    pricePerUnit: parseFloat(prod.pricePerUnit) || 0,
    pricePerPackage: parseFloat(prod.pricePerPackage) || 0,
    cost: parseFloat(prod.cost) || 0,
    packageCount: parseInt(prod.packageCount) || 0,
    stockUnits: parseInt(prod.stockUnits) || 0,
    tags,
  };
}

function validateProduct(prod, id) {
  if (!prod.name || !prod.category) {
    throw new Error(`المنتج "${id}" مفقود فيه الاسم أو الفئة`);
  }
}
function exportToExcel(products, filename = "products.xlsx") {
  // Prepare data array with header row
  const headers = [
    "id",
    "name",
    "pricePerUnit",
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
      p.pricePerUnit,
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

  // Create worksheet from data
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Create workbook and append the worksheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

  // Write workbook to binary string
  const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  // Create a Blob and download
  const blob = new Blob([wbout], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("export-excel").addEventListener("click", () => {
  exportToExcel(filteredProducts);
});

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();

  document
    .getElementById("search-input")
    .addEventListener("input", renderProductList);

  document.getElementById("export-json").addEventListener("click", () => {
    downloadJSON(filteredProducts);
  });

  document.getElementById("export-csv").addEventListener("click", () => {
    exportToCSV(filteredProducts);
  });

  document.getElementById("custom-file-btn").addEventListener("click", () => {
    document.getElementById("file-upload").click();
  });

  document
    .getElementById("file-upload")
    .addEventListener("change", async (e) => {
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
            if (id) {
              newProducts[id] = normalizeProduct(prod);
            }
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
