// admin.js

import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

let allProducts = {};
let selectedCategory = "";
let selectedTag = "";

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
      selectedTag = ""; // reset tag
      renderCategoryTags();
      renderTagTags();
      renderProductList();
    };
    container.appendChild(btn);
  });
}
function renderTagTags() {
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
  const list = document.getElementById("product-list");
  list.innerHTML = "";

  const search = document.getElementById("search-input").value.toLowerCase();

  Object.entries(allProducts).forEach(([id, p]) => {
    const matchesSearch = p.name.toLowerCase().includes(search);
    const matchesCategory =
      !selectedCategory || p.category === selectedCategory;
    const matchesTag = !selectedTag || (p.tags && p.tags.includes(selectedTag));

    if (matchesSearch && matchesCategory && matchesTag) {
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
      }|  السعر للعبوة جملة: ${p.priceOfPackageForShops}</small><br>
              <small>التكلفة: ${p.cost}</small><br>
                <small> عدد العبوة: ${p.packageCount} وحدة</small><br>
              <small>الكمية: ${p.stockUnits} وحدة</small><br>
              <small>الوسوم: ${p.tags?.join(", ") || "—"}</small>
            </div>
          </div>
        `;
      list.appendChild(li);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("product-form");
  const productList = document.getElementById("product-list");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const id = document.getElementById("product-id").value;
    const product = {
      name: document.getElementById("name").value,
      pricePerUnit: parseFloat(document.getElementById("pricePerUnit").value),
      pricePerPackage: parseFloat(
        document.getElementById("pricePerPackage").value
      ),
      cost: parseFloat(document.getElementById("cost").value),
      stockUnits: parseInt(document.getElementById("stockUnits").value),
      packageCount: parseInt(document.getElementById("packageCount").value),
      category: document.getElementById("category").value,
      tags: document
        .getElementById("tags")
        .value.split(",")
        .map((tag) => tag.trim()),
      image: document.getElementById("image").value,
    };

    const inventoryRef = doc(db, "products", "inventory");
    const snapshot = await getDoc(inventoryRef);
    const existingData = snapshot.exists()
      ? snapshot.data().products || {}
      : {};

    existingData[id] = product;
    await setDoc(inventoryRef, { products: existingData });

    alert("✅ تم حفظ المنتج بنجاح");
    form.reset();
    loadProducts();
  });

  loadProducts();
  document
    .getElementById("load-from-file-btn")
    .addEventListener("click", async () => {
      try {
        showLoader();
        const response = await fetch("data/products.json");
        if (!response.ok) throw new Error("تعذر تحميل الملف");

        const productsData = await response.json();
        if (typeof productsData !== "object")
          throw new Error("تنسيق الملف غير صالح");

        const inventoryRef = doc(db, "products", "inventory");
        await setDoc(inventoryRef, { products: productsData });

        alert("✅ تم تحميل المنتجات من الملف ورفعها إلى فايربيس");
        loadProducts();
      } catch (error) {
        console.error(error);
        alert("❌ فشل في تحميل أو رفع المنتجات");
      } finally {
        hideLoader();
      }
    });
});
document
  .getElementById("search-input")
  .addEventListener("input", renderProductList);

document
  .getElementById("update-from-file-btn")
  .addEventListener("click", async () => {
    try {
      showLoader();

      const response = await fetch("data/updateProducts.json");
      const newProducts = await response.json();

      const docRef = doc(db, "products", "inventory");
      const snap = await getDoc(docRef);
      let existingData = snap.exists() ? snap.data().products : {};

      // دمج المنتجات
      Object.entries(newProducts).forEach(([id, newProd]) => {
        if (existingData[id]) {
          // موجود مسبقاً: زد الكمية فقط
          existingData[id].stockUnits =
            (existingData[id].stockUnits || 0) + (newProd.stockUnits || 0);
          existingData[id].name = newProd.name;
          existingData[id].pricePerUnit = newProd.pricePerUnit;
          existingData[id].pricePerPackage = newProd.pricePerPackage;
          existingData[id].cost = newProd.cost;
          existingData[id].packageCount = newProd.packageCount;
          existingData[id].category = newProd.category;
          existingData[id].tags = newProd.tags;
          existingData[id].image = newProd.image;
        } else {
          // منتج جديد: أضفه بالكامل
          existingData[id] = newProd;
        }
      });

      await setDoc(docRef, { products: existingData });

      alert("تم تحديث المنتجات بنجاح ✅");
      loadProducts();
    } catch (e) {
      console.log(e);
      alert("Upload failed.");
    } finally {
      hideLoader();
    }
  });

function showLoader() {
  document.getElementById("global-loader").style.display = "flex";
}

function hideLoader() {
  document.getElementById("global-loader").style.display = "none";
}
