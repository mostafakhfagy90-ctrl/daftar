let currentBook = "in";
const data = { in: [], out: [] };
let db;
let currentView = "in";
let cashRows = [];
let closing = { key: "closing", treasury: 0, balance: 0 };
let restoring = false;
const DEFAULT_CASH_ROWS = ["اخضر", "لبني", "هواوي", "S", "O", "R", "D", "ابوصغير", "ابوامر", "احمر", "K", "F.V/K.V", "", ""];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("daftar-db", 3);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("people")) {
        database.createObjectStore("people", { keyPath: "id", autoIncrement: true });
      }
      if (!database.objectStoreNames.contains("cash")) {
        const cs = database.createObjectStore("cash", { keyPath: "id", autoIncrement: true });
        DEFAULT_CASH_ROWS.forEach((name, i) => cs.add({ name: name, c1: null, c2: null, order: i }));
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function loadAll() {
  return new Promise((resolve, reject) => {
    const req = db.transaction("people").objectStore("people").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function savePerson(person) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("people", "readwrite");
    const req = tx.objectStore("people").put(person);
    req.onsuccess = () => { person.id = req.result; };
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
  });
}

function deletePerson(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("people", "readwrite");
    tx.objectStore("people").delete(id);
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
  });
}

const thead = document.querySelector("#ledger thead");
const tbody = document.querySelector("#ledger tbody");
const searchBox = document.getElementById("search");
const totalLabel = document.getElementById("total-label");
const totalValue = document.getElementById("total-value");
const tabIn = document.getElementById("tab-in");
const tabOut = document.getElementById("tab-out");

const dialog = document.getElementById("add-dialog");
const form = document.getElementById("add-form");
const dialogTitle = document.getElementById("dialog-title");
const nameInput = document.getElementById("f-name");
const amountInput = document.getElementById("f-amount");
const namesList = document.getElementById("names-list");

const editDialog = document.getElementById("edit-dialog");
const editForm = document.getElementById("edit-form");
const editName = document.getElementById("edit-name");
const editAmount = document.getElementById("edit-amount");
let editing = null;

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sum(list) {
  return list.reduce((a, b) => a + b, 0);
}

function money(n) {
  return n.toLocaleString("en-US");
}

function render() {
  const book = data[currentBook];
  const word = searchBox.value.trim();
  const rows = book.filter(p => p.name.includes(word));
  const maxOps = Math.max(1, ...book.map(p => p.ops.length));

  let head = "<tr><th>الاسم</th>";
  for (let i = 0; i < maxOps; i++) {
    head += "<th>عملية " + (i + 1) + "</th>";
  }
  head += "<th>المجموع</th></tr>";
  thead.innerHTML = head;

  let body = "";
  for (const p of rows) {
    body += '<tr><td class="person" data-id="' + p.id + '">' + esc(p.name) + "</td>";
    for (let i = 0; i < maxOps; i++) {
      body += p.ops[i] !== undefined
        ? '<td class="op" data-id="' + p.id + '" data-i="' + i + '">' + money(p.ops[i]) + "</td>"
        : "<td>—</td>";
    }
    body += "<td><strong>" + money(sum(p.ops)) + "</strong></td></tr>";
  }
  tbody.innerHTML = body;

  const total = book.reduce((t, p) => t + sum(p.ops), 0);
  totalLabel.textContent = currentBook === "in" ? "إجمالي الداخل" : "إجمالي الخارج";
  totalValue.textContent = money(total) + " جنيه";
}

function switchBook(name) {
  showView(name);
}

async function addOperation(name, amount) {
  const book = data[currentBook];
  let person = book.find(p => p.name === name);
  const isNew = !person;
  if (isNew) {
    person = { book: currentBook, name: name, ops: [] };
    book.push(person);
  }
  person.ops.push(amount);
  try {
    await savePerson(person);
  } catch (e) {
    person.ops.pop();
    if (isNew) book.pop();
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  render();
}

const heardText = document.getElementById("heard-text");

function openAddDialog(name, amount, heard) {
  dialogTitle.textContent = currentBook === "in" ? "عملية جديدة في الداخل" : "عملية جديدة في الخارج";
  form.reset();
  namesList.innerHTML = data[currentBook].map(p => '<option value="' + esc(p.name) + '">').join("");
  heardText.textContent = heard ? "سمعتك بتقول: " + heard : "";
  heardText.hidden = !heard;
  nameInput.value = name || "";
  amountInput.value = amount ? amount : "";
  dialog.showModal();
  if (name) amountInput.focus(); else nameInput.focus();
}

document.getElementById("btn-add").addEventListener("click", () => openAddDialog("", "", ""));

document.getElementById("btn-cancel").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim().replace(/\s+/g, " ")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const amount = Number(amountInput.value);
  if (!name || !(amount > 0)) return;
  await addOperation(name, amount);
  dialog.close();
});

tbody.addEventListener("click", (e) => {
  const cell = e.target.closest("td.op");
  if (!cell) return;
  const person = data[currentBook].find(p => p.id === Number(cell.dataset.id));
  if (!person) return;
  const index = Number(cell.dataset.i);
  editing = { person: person, index: index };
  editName.textContent = person.name + " - عملية " + (index + 1);
  editAmount.value = person.ops[index];
  editDialog.showModal();
});

document.getElementById("edit-cancel").addEventListener("click", () => editDialog.close());

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const amount = Number(editAmount.value);
  if (!editing || !(amount > 0)) return;
  const person = editing.person;
  const index = editing.index;
  const old = person.ops[index];
  person.ops[index] = amount;
  try {
    await savePerson(person);
  } catch (err) {
    person.ops[index] = old;
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  editDialog.close();
  render();
});

document.getElementById("edit-delete").addEventListener("click", async () => {
  if (!editing) return;
  if (!confirm("تحذف العملية دي؟")) return;
  const person = editing.person;
  const index = editing.index;
  const removed = person.ops.splice(index, 1)[0];
  try {
    if (person.ops.length === 0) {
      await deletePerson(person.id);
      const book = data[currentBook];
      book.splice(book.indexOf(person), 1);
    } else {
      await savePerson(person);
    }
  } catch (err) {
    person.ops.splice(index, 0, removed);
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  editDialog.close();
  render();
});

function getDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ===== التصدير: نسخة من كل تاب لوحدها (إكسيل / PDF) =====
const VIEW_TITLES = { in: "الداخل", out: "الخارج", cash: "الكاش", closing: "التقفيل" };

function closingFigures() {
  const cash = cashTotal();
  const out = ledgerTotal("out");
  const inn = ledgerTotal("in");
  const total4 = round2(closing.treasury + cash + out + closing.balance);
  const diff = round2(total4 - inn);
  return { cash: cash, out: out, inn: inn, total4: total4, diff: diff };
}

function diffLabel(diff) {
  return diff > 0 ? "زيادة" : (diff < 0 ? "عجز" : "متطابق");
}

function viewSheetData(view) {
  const rows = [];
  const title = VIEW_TITLES[view];
  if (view === "in" || view === "out") {
    const book = data[view].filter(p => p.ops.length > 0);
    const maxOps = Math.max(1, ...book.map(p => p.ops.length));
    const head = ["الاسم"];
    for (let i = 0; i < maxOps; i++) head.push("عملية " + (i + 1));
    head.push("المجموع");
    rows.push(head);
    for (const p of book) {
      const r = [p.name];
      for (let i = 0; i < maxOps; i++) r.push(p.ops[i] !== undefined ? p.ops[i] : "");
      r.push(sum(p.ops));
      rows.push(r);
    }
    rows.push([]);
    const t = ["إجمالي " + title];
    for (let i = 0; i < maxOps; i++) t.push("");
    t.push(ledgerTotal(view));
    rows.push(t);
  } else if (view === "cash") {
    rows.push(["الخط 1", "الكاش 1", "الخط 2", "الكاش 2"]);
    for (const r of cashRows) {
      rows.push([r.name, typeof r.c1 === "number" ? r.c1 : "", r.name, typeof r.c2 === "number" ? r.c2 : ""]);
    }
    rows.push([]);
    rows.push(["إجمالي الكاش 1", round2(cashRows.reduce((t, r) => t + cashNum(r.c1), 0))]);
    rows.push(["إجمالي الكاش 2", round2(cashRows.reduce((t, r) => t + cashNum(r.c2), 0))]);
    rows.push(["إجمالي الكاش", cashTotal()]);
  } else {
    const f = closingFigures();
    rows.push(["البند", "القيمة"]);
    rows.push(["الخزنة", closing.treasury]);
    rows.push(["الكاش", f.cash]);
    rows.push(["الخارج", f.out]);
    rows.push(["الرصيد", closing.balance]);
    rows.push(["المجموع", f.total4]);
    rows.push(["إجمالي الداخل", f.inn]);
    rows.push([diffLabel(f.diff), Math.abs(f.diff)]);
  }
  return rows;
}

function reportHtml(view) {
  const title = VIEW_TITLES[view];
  const TH = 'style="border:1px solid #999;padding:8px 10px;background:#eee;text-align:center;font-size:15px;"';
  const TD = 'style="border:1px solid #999;padding:8px 10px;text-align:center;font-size:15px;"';
  const TDB = 'style="border:1px solid #999;padding:8px 10px;text-align:center;font-size:16px;font-weight:bold;background:#f6f6f6;"';
  const cell = (v, st) => "<td " + (st || TD) + ">" + (typeof v === "number" ? money(v) : esc(String(v))) + "</td>";
  let body = "";

  if (view === "in" || view === "out") {
    const book = data[view].filter(p => p.ops.length > 0);
    const maxOps = Math.max(1, ...book.map(p => p.ops.length));
    let head = "<tr><th " + TH + ">الاسم</th>";
    for (let i = 0; i < maxOps; i++) head += "<th " + TH + ">عملية " + (i + 1) + "</th>";
    head += "<th " + TH + ">المجموع</th></tr>";
    let rows = "";
    for (const p of book) {
      rows += "<tr>" + cell(p.name, TDB);
      for (let i = 0; i < maxOps; i++) rows += cell(p.ops[i] !== undefined ? p.ops[i] : "—");
      rows += cell(sum(p.ops), TDB) + "</tr>";
    }
    if (!book.length) rows = '<tr><td ' + TD + ' colspan="' + (maxOps + 2) + '">لا توجد عمليات</td></tr>';
    const foot = '<tr><td ' + TDB + ' colspan="' + (maxOps + 1) + '">إجمالي ' + title + "</td>" + cell(ledgerTotal(view), TDB) + "</tr>";
    body = '<table style="border-collapse:collapse;width:100%;">' + head + rows + foot + "</table>";
  } else if (view === "cash") {
    let rows = "";
    for (const r of cashRows) {
      const nm = r.name ? r.name : "";
      rows += "<tr>" + cell(nm, TDB) + cell(typeof r.c1 === "number" ? r.c1 : "") +
              cell(nm, TDB) + cell(typeof r.c2 === "number" ? r.c2 : "") + "</tr>";
    }
    const foot = '<tr><td ' + TDB + ' colspan="3">إجمالي الكاش</td>' + cell(cashTotal(), TDB) + "</tr>";
    body = '<table style="border-collapse:collapse;width:100%;"><tr><th ' + TH + ">الخط 1</th><th " + TH + ">الكاش 1</th><th " + TH +
           ">الخط 2</th><th " + TH + ">الكاش 2</th></tr>" + rows + foot + "</table>";
  } else {
    const f = closingFigures();
    const line = (label, v, st) => "<tr><td " + TDB + ">" + label + "</td>" + cell(v, st) + "</tr>";
    body = '<table style="border-collapse:collapse;width:60%;margin:0 auto;">' +
      line("الخزنة", closing.treasury) + line("الكاش", f.cash) + line("الخارج", f.out) + line("الرصيد", closing.balance) +
      line("المجموع", f.total4, TDB) + line("إجمالي الداخل", f.inn) +
      line(diffLabel(f.diff), Math.abs(f.diff), TDB) + "</table>";
  }

  return '<h2 style="text-align:center;margin:0 0 4px;">' + title + "</h2>" +
         '<p style="text-align:center;margin:0 0 14px;color:#555;">' + getDateString() + "</p>" + body;
}

document.getElementById("btn-export-excel").addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    alert("مكتبة الإكسيل لسه ما اتحمّلتش. اتأكد من الإنترنت وحدّث الصفحة.");
    return;
  }
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  const ws = XLSX.utils.aoa_to_sheet(viewSheetData(currentView));
  XLSX.utils.book_append_sheet(wb, ws, VIEW_TITLES[currentView]);
  XLSX.writeFile(wb, VIEW_TITLES[currentView] + "_" + getDateString() + ".xlsx");
});

document.getElementById("btn-export-pdf").addEventListener("click", () => {
  if (typeof html2pdf === "undefined") {
    alert("مكتبة الـ PDF لسه ما اتحمّلتش. اتأكد من الإنترنت وحدّث الصفحة.");
    return;
  }
  const wrap = document.createElement("div");
  wrap.setAttribute("dir", "rtl");
  wrap.style.cssText = "position:fixed;left:-10000px;top:0;width:1000px;background:#fff;color:#000;padding:20px;font-family:Tahoma,Arial,sans-serif;";
  wrap.innerHTML = reportHtml(currentView);
  document.body.appendChild(wrap);
  const opt = {
    margin: 10,
    filename: VIEW_TITLES[currentView] + "_" + getDateString() + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
    pagebreak: { mode: ["css", "legacy"] }
  };
  html2pdf().from(wrap).set(opt).save()
    .then(() => wrap.remove())
    .catch(() => {
      wrap.remove();
      alert("تعذر إنشاء ملف الـ PDF.");
    });
});
// ===== نهاية التصدير =====

const fileImport = document.getElementById("file-import");
document.getElementById("btn-import").addEventListener("click", () => fileImport.click());

fileImport.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      if (!importedData.in || !importedData.out) throw new Error();
      restoring = true;
      
      const tx = db.transaction("people", "readwrite");
      tx.objectStore("people").clear();
      await new Promise(res => tx.oncomplete = res);
      
      data.in = [];
      data.out = [];
      
      for (const b of ["in", "out"]) {
        for (const p of importedData[b]) {
          delete p.id;
          p.book = b;
          await savePerson(p);
          data[b].push(p);
        }
      }
      if (Array.isArray(importedData.cash)) {
        const txc = db.transaction("cash", "readwrite");
        txc.objectStore("cash").clear();
        await new Promise(res => txc.oncomplete = res);
        cashRows = [];
        let order = 0;
        for (const r of importedData.cash) {
          const row = {
            name: String(r.name || ""),
            c1: typeof r.c1 === "number" ? r.c1 : null,
            c2: typeof r.c2 === "number" ? r.c2 : null,
            order: order++
          };
          await putStore("cash", row);
          cashRows.push(row);
        }
      }
      if (importedData.closing) {
        closing = {
          key: "closing",
          treasury: Number(importedData.closing.treasury) || 0,
          balance: Number(importedData.closing.balance) || 0
        };
        await putStore("settings", closing);
      }
      showView(currentView);
      alert("تمت استعادة البيانات بنجاح!");
    } catch (err) {
      alert("الملف غير صالح أو حدث خطأ أثناء الاستعادة.");
    } finally {
      restoring = false;
    }
  };
  reader.readAsText(file);
});

// ===== فهم الكلام من الصوت =====
function normAr(t) {
  return t
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

const NUM_WORDS = {
  "واحد": 1, "اتنين": 2, "اثنين": 2, "اثنان": 2,
  "تلاته": 3, "ثلاثه": 3, "تلات": 3, "ثلاث": 3,
  "اربعه": 4, "اربع": 4, "خمسه": 5, "خمس": 5, "سته": 6, "ست": 6,
  "سبعه": 7, "سبع": 7, "تمانيه": 8, "ثمانيه": 8, "تمن": 8, "ثمان": 8,
  "تسعه": 9, "تسع": 9, "عشره": 10, "عشر": 10,
  "حداشر": 11, "احداشر": 11, "اتناشر": 12, "اثناشر": 12, "تلتاشر": 13,
  "اربعتاشر": 14, "خمستاشر": 15, "ستاشر": 16, "سبعتاشر": 17,
  "تمنتاشر": 18, "تسعتاشر": 19,
  "عشرين": 20, "عشرون": 20, "تلاتين": 30, "ثلاثين": 30, "اربعين": 40,
  "خمسين": 50, "ستين": 60, "سبعين": 70, "تمانين": 80, "ثمانين": 80, "تسعين": 90,
  "ميه": 100, "مايه": 100, "مئه": 100, "مائه": 100,
  "ميتين": 200, "مئتين": 200, "مائتين": 200,
  "تلتميه": 300, "تلاتميه": 300, "ثلثميه": 300, "ثلاثمائه": 300, "ثلاثمئه": 300,
  "ربعميه": 400, "اربعميه": 400, "اربعمائه": 400, "اربعمئه": 400,
  "خمسميه": 500, "خمسمائه": 500, "خمسمئه": 500,
  "ستميه": 600, "ستمائه": 600, "ستمئه": 600,
  "سبعميه": 700, "سبعمائه": 700, "سبعمئه": 700,
  "تمنميه": 800, "تمانميه": 800, "ثمانميه": 800, "ثمانمائه": 800, "ثمانمئه": 800,
  "تسعميه": 900, "تسعمائه": 900, "تسعمئه": 900
};

const MULT_WORDS = {
  "الف": { m: 1000, k: 1 }, "الاف": { m: 1000, k: 1 }, "تلاف": { m: 1000, k: 1 },
  "الفين": { m: 1000, k: 2 },
  "مليون": { m: 1000000, k: 1 }, "ملايين": { m: 1000000, k: 1 },
  "مليونين": { m: 1000000, k: 2 }
};

const FRACTION_WORDS = { "نص": 0.5, "نصف": 0.5, "ربع": 0.25 };

const BOOK_WORDS = ["الداخل", "داخل", "الخارج", "خارج"];
const CURRENCY_WORDS = ["جنيه", "جنيها", "جنيهات", "ج"];

const FILLER_WORDS = new Set([
  "سجل", "سجلي", "سجلو", "ضيف", "ضيفي", "زود", "زودي", "اكتب", "اضف", "حط", "حطلي",
  "في", "ف", "جنيه", "جنيها", "جنيهات", "ج", "مبلغ", "فلوس",
  "دفع", "دفعت", "اخد", "اخذ", "استلمت", "استلم", "قبض"
]);

function isDigits(t) {
  return /^\d+(\.\d+)?$/.test(t);
}

function isNumberToken(n) {
  return isDigits(n) || n in NUM_WORDS || n in MULT_WORDS;
}

function isFractionToken(n) {
  return n in FRACTION_WORDS;
}

function numberValue(tokens) {
  let total = 0, cur = 0, lastMult = 0;
  for (const n of tokens) {
    if (n === "و") continue;
    if (isDigits(n)) {
      cur += Number(n);
    } else if (n in NUM_WORDS) {
      cur += NUM_WORDS[n];
    } else if (n in MULT_WORDS) {
      const { m, k } = MULT_WORDS[n];
      if (k === 1) {
        total += (cur || 1) * m;
        cur = 0;
      } else {
        total += cur + k * m;
        cur = 0;
      }
      lastMult = m;
    } else if (n in FRACTION_WORDS) {
      if (lastMult) total += lastMult * FRACTION_WORDS[n];
      else cur += FRACTION_WORDS[n];
    }
  }
  return total + cur;
}

function parseVoice(text) {
  let clean = text
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/(\d)[,،٬](?=\d{3}\b)/g, "$1")
    .replace(/٫/g, ".")
    .replace(/(\d)([^\d\s.])/g, "$1 $2")
    .replace(/([^\d\s.])(\d)/g, "$1 $2");

  const raw = clean.split(/\s+/).filter(Boolean);

  const items = [];
  for (const orig of raw) {
    const n = normAr(orig);
    if (n.length > 1 && n[0] === "و" && !isDigits(n)) {
      const rest = n.slice(1);
      if (isNumberToken(rest) || isFractionToken(rest)) {
        items.push({ orig: "و", n: "و" });
        items.push({ orig: orig.slice(1), n: rest });
        continue;
      }
    }
    items.push({ orig: orig, n: n });
  }

  function findRun(from) {
    const st = items.findIndex((it, idx) => idx >= from && isNumberToken(it.n));
    let en = st;
    if (st !== -1) {
      let i = st;
      while (i < items.length) {
        const n = items[i].n;
        if (isNumberToken(n) || isFractionToken(n)) { en = i; i++; }
        else if (n === "و" && i + 1 < items.length &&
                 (isNumberToken(items[i + 1].n) || isFractionToken(items[i + 1].n))) { i++; }
        else break;
      }
    }
    return [st, en];
  }

  let [start, end] = findRun(0);

  // رقم الفرع: "السلام ١ ٤٠٠٠" الاسم "السلام 1" والمبلغ 4000
  if (start !== -1) {
    const first = items[start].n;
    const second = start + 1 < items.length ? items[start + 1].n : "";
    const plainNext = isDigits(second) || second in NUM_WORDS ||
      (second in MULT_WORDS && MULT_WORDS[second].k === 2);
    const hasName = items.slice(0, start).some(it =>
      !FILLER_WORDS.has(it.n) && !BOOK_WORDS.includes(it.n));
    const hasCurrency = items.some(it => CURRENCY_WORDS.includes(it.n));

    let branch = null;
    if (hasName && end > start && plainNext) {
      if (/^\d+$/.test(first) && Number(first) >= 1 && Number(first) <= 30) {
        branch = Number(first);
      } else if (first in NUM_WORDS && NUM_WORDS[first] <= 10) {
        branch = NUM_WORDS[first];
      }
    } else if (hasName && end === start && !hasCurrency) {
      if (/^\d+$/.test(first) && Number(first) >= 1 && Number(first) <= 10) {
        branch = Number(first);
      } else if (first in NUM_WORDS && NUM_WORDS[first] <= 10) {
        branch = NUM_WORDS[first];
      }
    }

    if (branch !== null) {
      items[start] = { orig: String(branch), n: "#" + branch };
      [start, end] = findRun(start + 1);
    }
  }

  let amount = 0;
  let rest = items;
  if (start !== -1) {
    amount = numberValue(items.slice(start, end + 1).map(it => it.n));
    rest = items.slice(0, start).concat(items.slice(end + 1));
  }

  let book = null;
  const kept = [];
  for (const it of rest) {
    if (it.n === "الخارج" || it.n === "خارج") { book = "out"; continue; }
    if (it.n === "الداخل" || it.n === "داخل") { book = "in"; continue; }
    kept.push(it);
  }

  const isFiller = (it) => FILLER_WORDS.has(it.n);
  while (kept.length && isFiller(kept[0])) kept.shift();
  while (kept.length && isFiller(kept[kept.length - 1])) kept.pop();
  if (kept.length > 1 && kept[0].orig === "على") kept.shift();
  const name = kept.filter(it => !isFiller(it)).map(it => it.orig).join(" ").trim();

  return { book: book, name: name, amount: amount };
}
// ===== نهاية فهم الكلام =====

// ===== أوامر الصوت: الحذف =====
const DELETE_VERBS = ["احذف", "احذفي", "امسح", "امسحي", "شيل", "شيلي", "الغي", "الغ", "حذف", "مسح"];
const ORDINAL_WORDS = {
  "الاول": 0, "الاولي": 0, "اول": 0,
  "التاني": 1, "التانيه": 1, "الثاني": 1, "الثانيه": 1,
  "التالت": 2, "التالته": 2, "الثالث": 2, "الثالثه": 2,
  "الرابع": 3, "الرابعه": 3, "الخامس": 4, "الخامسه": 4,
  "الاخير": -1, "الاخيره": -1, "اخر": -1, "الاخر": -1, "اخيره": -1
};
const CMD_NOISE = ["خانه", "الخانه", "خانات", "الخانات", "صف", "الصف", "اسم", "الاسم",
  "بتاع", "بتاعه", "بتاعت", "دي", "ده", "دا", "اللي", "الي", "من", "ال"];

function parseCommand(text) {
  const clean = text
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => ({ orig: t, n: normAr(t) }));
  const vIdx = tokens.findIndex((t, i) => i < 2 && DELETE_VERBS.includes(t.n));
  if (vIdx === -1) return null;
  tokens.splice(vIdx, 1);

  let hasOp = false, all = false, idx = null;
  const rest = [];
  for (let i = 0; i < tokens.length; i++) {
    const n = tokens[i].n;
    if (n === "عمليه" || n === "العمليه") { hasOp = true; continue; }
    if (n === "عمليات" || n === "العمليات" || n === "كل" || n === "كله") { all = true; continue; }
    if (n in ORDINAL_WORDS) { idx = ORDINAL_WORDS[n]; continue; }
    if (n === "رقم" && i + 1 < tokens.length) {
      const nx = tokens[i + 1].n;
      const v = isDigits(nx) ? Number(nx) : (nx in NUM_WORDS ? NUM_WORDS[nx] : null);
      if (v !== null && v >= 1) { idx = v - 1; i++; continue; }
    }
    if (CMD_NOISE.includes(n)) continue;
    rest.push(tokens[i].orig);
  }

  const p = parseVoice(rest.join(" "));
  let scope;
  if (idx !== null) scope = "index";
  else if (p.amount > 0) scope = "amount";
  else if (hasOp && !all) scope = "last";
  else scope = "person";

  return { type: "delete", scope: scope, idx: idx, name: p.name, amount: p.amount, book: p.book };
}

function nameKey(s) {
  return normAr(s).replace(/\s+/g, " ").trim();
}

function findPeople(spoken, bookOrder, allData) {
  const parts = spoken.split(/\s+/);
  const variants = [nameKey(spoken)];
  if (parts[0].length > 3 && parts[0][0] === "ل") {
    variants.push(nameKey([parts[0].slice(1)].concat(parts.slice(1)).join(" ")));
  }
  for (const b of bookOrder) {
    const exact = allData[b].filter(p => variants.includes(nameKey(p.name)));
    if (exact.length) return exact;
  }
  const partial = [];
  for (const b of bookOrder) {
    for (const p of allData[b]) {
      const k = nameKey(p.name);
      if (variants.some(v => v && k.includes(v))) partial.push(p);
    }
  }
  return partial;
}
// ===== نهاية أوامر الحذف =====

// ===== تنفيذ الحذف وتعديل الاسم =====
async function removePerson(person) {
  const book = data[person.book];
  const pos = book.indexOf(person);
  if (pos >= 0) book.splice(pos, 1);
  try {
    await deletePerson(person.id);
  } catch (e) {
    if (pos >= 0) book.splice(pos, 0, person);
    alert("لم يتم الحذف! حاول مرة أخرى.");
  }
}

async function removeOperation(person, index) {
  if (person.ops.length === 1) {
    await removePerson(person);
    return;
  }
  const removed = person.ops.splice(index, 1)[0];
  try {
    await savePerson(person);
  } catch (e) {
    person.ops.splice(index, 0, removed);
    alert("لم يتم الحذف! حاول مرة أخرى.");
  }
}

async function runDeleteCommand(cmd, heard) {
  const head = "سمعتك بتقول: " + heard + "\n\n";
  if (!cmd.name) {
    alert(head + "ما فهمتش الاسم اللي عايز تحذفه.");
    return;
  }
  const other = currentBook === "in" ? "out" : "in";
  const order = cmd.book ? [cmd.book] : [currentBook, other];
  const found = findPeople(cmd.name, order, data);
  if (found.length === 0) {
    alert(head + "مش لاقي اسم «" + cmd.name + "».");
    return;
  }
  if (found.length > 1) {
    alert(head + "فيه أكتر من اسم قريب: " + found.map(p => p.name).join(" ، ") + "\nقول الاسم كامل.");
    return;
  }

  const person = found[0];
  if (person.book !== currentBook) switchBook(person.book);
  const bookWord = person.book === "in" ? "الداخل" : "الخارج";

  let index = -1;
  if (cmd.scope === "index") index = cmd.idx === -1 ? person.ops.length - 1 : cmd.idx;
  else if (cmd.scope === "amount") index = person.ops.lastIndexOf(cmd.amount);
  else if (cmd.scope === "last") index = person.ops.length - 1;

  if (cmd.scope !== "person" && (index < 0 || index >= person.ops.length)) {
    alert(head + "مش لاقي العملية دي عند «" + person.name + "».");
    return;
  }

  if (cmd.scope === "person") {
    const msg = head + "تحذف اسم «" + person.name + "» بكل عملياته (" + person.ops.length +
      " عملية، المجموع " + money(sum(person.ops)) + ") من " + bookWord + "؟";
    if (!confirm(msg)) return;
    await removePerson(person);
  } else {
    const msg = head + "تحذف عملية " + money(person.ops[index]) + " (رقم " + (index + 1) +
      ") من «" + person.name + "» في " + bookWord + "؟";
    if (!confirm(msg)) return;
    await removeOperation(person, index);
  }
  render();
}

function mergePeople(target, person) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("people", "readwrite");
    const store = tx.objectStore("people");
    store.put(target);
    store.delete(person.id);
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const nameDialog = document.getElementById("name-dialog");
const nameForm = document.getElementById("name-form");
const nameEditInput = document.getElementById("name-edit-input");
let renaming = null;

tbody.addEventListener("click", (e) => {
  const cell = e.target.closest("td.person");
  if (!cell) return;
  const person = data[currentBook].find(p => p.id === Number(cell.dataset.id));
  if (!person) return;
  renaming = person;
  nameEditInput.value = person.name;
  nameDialog.showModal();
  nameEditInput.focus();
});

document.getElementById("name-cancel").addEventListener("click", () => nameDialog.close());

document.getElementById("name-delete").addEventListener("click", async () => {
  if (!renaming) return;
  const person = renaming;
  if (!confirm("تحذف اسم «" + person.name + "» بكل عملياته (" + person.ops.length + " عملية)؟")) return;
  await removePerson(person);
  nameDialog.close();
  render();
});

nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!renaming) return;
  const person = renaming;
  const newName = nameEditInput.value.trim().replace(/\s+/g, " ")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  if (!newName || newName === person.name) {
    nameDialog.close();
    return;
  }
  const book = data[person.book];
  const target = book.find(p => p !== person && p.name === newName);

  if (target) {
    const ok = confirm("«" + newName + "» موجود بالفعل.\nتدمج عمليات «" + person.name + "» معاه؟");
    if (!ok) return;
    const added = person.ops.length;
    const pos = book.indexOf(person);
    target.ops.push(...person.ops);
    book.splice(pos, 1);
    try {
      await mergePeople(target, person);
    } catch (err) {
      target.ops.splice(target.ops.length - added, added);
      book.splice(pos, 0, person);
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  } else {
    const old = person.name;
    person.name = newName;
    try {
      await savePerson(person);
    } catch (err) {
      person.name = old;
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  }
  nameDialog.close();
  render();
});
// ===== نهاية التنفيذ =====

// ===== قسم الكاش وقسم التقفيل =====
const tabCash = document.getElementById("tab-cash");
const tabClosing = document.getElementById("tab-closing");
const cashView = document.getElementById("cash-view");
const closingView = document.getElementById("closing-view");
const cashBody = document.querySelector("#cash-table tbody");
const btnAdd = document.getElementById("btn-add");

function isLedgerView() {
  return currentView === "in" || currentView === "out";
}

function showView(view) {
  currentView = view;
  if (view === "in" || view === "out") currentBook = view;
  document.body.classList.toggle("out", view === "out");
  tabIn.classList.toggle("active", view === "in");
  tabOut.classList.toggle("active", view === "out");
  tabCash.classList.toggle("active", view === "cash");
  tabClosing.classList.toggle("active", view === "closing");

  const ledger = isLedgerView();
  document.querySelector(".search-box").hidden = !ledger;
  document.getElementById("pdf-area").hidden = !ledger;
  document.getElementById("ledger-total").hidden = !ledger;
  cashView.hidden = view !== "cash";
  closingView.hidden = view !== "closing";
  btnAdd.hidden = view === "closing";
  btnAdd.textContent = view === "cash" ? "إضافة خط" : "عملية جديدة";

  if (ledger) render();
  if (view === "cash") renderCash();
  if (view === "closing") renderClosing();
}

function putStore(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => { if (storeName === "cash") value.id = req.result; };
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function deleteFromStore(storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function loadCash() {
  return new Promise((resolve, reject) => {
    const req = db.transaction("cash").objectStore("cash").getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (a.order - b.order) || (a.id - b.id)));
    req.onerror = () => reject(req.error);
  });
}

function loadClosing() {
  return new Promise((resolve, reject) => {
    const req = db.transaction("settings").objectStore("settings").get("closing");
    req.onsuccess = () => resolve(req.result || { key: "closing", treasury: 0, balance: 0 });
    req.onerror = () => reject(req.error);
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function cashNum(v) {
  return typeof v === "number" ? v : 0;
}

function cashTotal() {
  return round2(cashRows.reduce((t, r) => t + cashNum(r.c1) + cashNum(r.c2), 0));
}

function ledgerTotal(book) {
  return round2(data[book].reduce((t, p) => t + sum(p.ops), 0));
}

function renderCash() {
  let html = "";
  for (const r of cashRows) {
    const nm = r.name ? esc(r.name) : "&nbsp;";
    html += "<tr>" +
      '<td class="cname" data-id="' + r.id + '">' + nm + "</td>" +
      '<td class="ccash" data-id="' + r.id + '" data-col="1">' + (typeof r.c1 === "number" ? money(r.c1) : "") + "</td>" +
      '<td class="cname" data-id="' + r.id + '">' + nm + "</td>" +
      '<td class="ccash" data-id="' + r.id + '" data-col="2">' + (typeof r.c2 === "number" ? money(r.c2) : "") + "</td>" +
      "</tr>";
  }
  cashBody.innerHTML = html;
  document.getElementById("cash-total").textContent = money(cashTotal()) + " جنيه";
}

// ----- نافذة قيمة الكاش -----
const cashDialog = document.getElementById("cash-dialog");
const cashForm = document.getElementById("cash-form");
const cashDlgTitle = document.getElementById("cash-dlg-title");
const cashInput = document.getElementById("cash-input");
let cashEditing = null;

// ----- نافذة اسم الخط -----
const cashNameDialog = document.getElementById("cash-name-dialog");
const cashNameForm = document.getElementById("cash-name-form");
const cashNameTitle = document.getElementById("cash-name-title");
const cashNameInput = document.getElementById("cash-name-input");
const cashNameDelete = document.getElementById("cash-name-delete");
let cashNameEditing = null;

function openCashNameDialog(row) {
  cashNameEditing = row;
  cashNameTitle.textContent = row ? "تعديل اسم الخط" : "خط جديد";
  cashNameInput.value = row ? row.name : "";
  cashNameDelete.hidden = !row;
  cashNameDialog.showModal();
  cashNameInput.focus();
}

cashBody.addEventListener("click", (e) => {
  const c = e.target.closest("td.ccash");
  if (c) {
    const row = cashRows.find(r => r.id === Number(c.dataset.id));
    if (!row) return;
    const col = Number(c.dataset.col);
    cashEditing = { row: row, col: col };
    cashDlgTitle.textContent = "كاش " + col + " - " + (row.name || "بدون اسم");
    const cur = row["c" + col];
    cashInput.value = typeof cur === "number" ? cur : "";
    cashDialog.showModal();
    cashInput.focus();
    return;
  }
  const n = e.target.closest("td.cname");
  if (n) {
    const row = cashRows.find(r => r.id === Number(n.dataset.id));
    if (row) openCashNameDialog(row);
  }
});

document.getElementById("cash-cancel").addEventListener("click", () => cashDialog.close());
document.getElementById("cash-clear").addEventListener("click", () => {
  cashInput.value = "";
  cashForm.requestSubmit();
});

cashForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!cashEditing) return;
  const row = cashEditing.row;
  const key = "c" + cashEditing.col;
  const raw = cashInput.value.trim();
  const val = raw === "" ? null : Number(raw);
  if (val !== null && !Number.isFinite(val)) return;
  const old = row[key];
  row[key] = val;
  try {
    await putStore("cash", row);
  } catch (err) {
    row[key] = old;
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  cashDialog.close();
  renderCash();
});

document.getElementById("cash-name-cancel").addEventListener("click", () => cashNameDialog.close());

cashNameDelete.addEventListener("click", async () => {
  const row = cashNameEditing;
  if (!row) return;
  if (!confirm("تحذف الخط «" + (row.name || "بدون اسم") + "» بقيمه (كاش 1 وكاش 2)؟")) return;
  const pos = cashRows.indexOf(row);
  if (pos >= 0) cashRows.splice(pos, 1);
  try {
    await deleteFromStore("cash", row.id);
  } catch (err) {
    if (pos >= 0) cashRows.splice(pos, 0, row);
    alert("لم يتم الحذف! حاول مرة أخرى.");
  }
  cashNameDialog.close();
  renderCash();
});

cashNameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = cashNameInput.value.trim().replace(/\s+/g, " ")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const row = cashNameEditing;
  if (row) {
    const old = row.name;
    row.name = name;
    try {
      await putStore("cash", row);
    } catch (err) {
      row.name = old;
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  } else {
    if (!name) return;
    const order = cashRows.reduce((m, r) => Math.max(m, r.order || 0), 0) + 1;
    const fresh = { name: name, c1: null, c2: null, order: order };
    cashRows.push(fresh);
    try {
      await putStore("cash", fresh);
    } catch (err) {
      cashRows.pop();
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  }
  cashNameDialog.close();
  renderCash();
});

// زر "إضافة خط" في تاب الكاش (يعمل بدل "عملية جديدة")
btnAdd.addEventListener("click", (e) => {
  if (currentView !== "cash") return;
  e.stopImmediatePropagation();
  openCashNameDialog(null);
}, true);

// ----- التقفيل -----
const cTreasury = document.getElementById("c-treasury");
const cBalance = document.getElementById("c-balance");
let closingTimer = null;

function renderClosing(keepInputs) {
  const cash = cashTotal();
  const out = ledgerTotal("out");
  const inn = ledgerTotal("in");
  if (!keepInputs) {
    cTreasury.value = closing.treasury ? closing.treasury : "";
    cBalance.value = closing.balance ? closing.balance : "";
  }
  const total4 = round2(closing.treasury + cash + out + closing.balance);
  const diff = round2(total4 - inn);

  document.getElementById("c-cash").textContent = money(cash);
  document.getElementById("c-out").textContent = money(out);
  document.getElementById("c-sum").textContent = money(total4);
  document.getElementById("c-in").textContent = money(inn);
  document.getElementById("c-diff-label").textContent = diff > 0 ? "زيادة" : (diff < 0 ? "عجز" : "متطابق");
  document.getElementById("c-diff").textContent = money(Math.abs(diff)) + " جنيه";
  document.getElementById("c-diff-box").className = "closing-diff " + (diff > 0 ? "up" : (diff < 0 ? "down" : "even"));
}

async function saveClosingNow() {
  clearTimeout(closingTimer);
  closingTimer = null;
  try {
    await putStore("settings", closing);
  } catch (err) {
    alert("لم يتم حفظ التقفيل! حاول مرة أخرى.");
  }
}

function onClosingInput() {
  closing.treasury = Number(cTreasury.value) || 0;
  closing.balance = Number(cBalance.value) || 0;
  renderClosing(true);
  clearTimeout(closingTimer);
  closingTimer = setTimeout(saveClosingNow, 400);
}

cTreasury.addEventListener("input", onClosingInput);
cBalance.addEventListener("input", onClosingInput);
cTreasury.addEventListener("change", saveClosingNow);
cBalance.addEventListener("change", saveClosingNow);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && closingTimer) saveClosingNow();
});

tabCash.addEventListener("click", () => showView("cash"));
tabClosing.addEventListener("click", () => showView("closing"));


// ----- أوامر الصوت للكاش والتقفيل -----
const CASH_ALIASES = {
  "اس": "s", "او": "o", "اوه": "o", "ار": "r", "دي": "d", "كي": "k", "اف": "f"
};

function cashKey(s) {
  return nameKey(s).replace(/^ال/, "").replace(/\s+/g, "");
}

function findCashRows(spoken, rows) {
  let k = cashKey(spoken);
  if (!k) return [];
  if (CASH_ALIASES[k]) k = CASH_ALIASES[k];
  const exact = rows.filter(r => r.name && cashKey(r.name) === k);
  if (exact.length) return exact;
  return rows.filter(r => {
    if (!r.name) return false;
    const rk = cashKey(r.name);
    return rk.includes(k) || (rk.length >= 3 && k.includes(rk));
  });
}

function parseSectionCommand(text) {
  const clean = text
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => ({ orig: t, n: normAr(t) }));

  const iT = tokens.findIndex(t => t.n === "الخزنه" || t.n === "خزنه");
  const iB = tokens.findIndex(t => t.n === "الرصيد" || t.n === "رصيد");
  if (iT !== -1 || iB !== -1) {
    const useT = iT !== -1;
    const skip = useT ? iT : iB;
    const rest = tokens.filter((t, i) => i !== skip).map(t => t.orig).join(" ");
    return { type: "closing", field: useT ? "treasury" : "balance", amount: parseVoice(rest).amount };
  }

  const iC = tokens.findIndex(t => t.n === "كاش" || t.n === "الكاش");
  if (iC === -1) return null;

  let col = null;
  const drop = new Set([iC]);
  const nx = tokens[iC + 1];
  if (nx) {
    if (["1", "واحد", "الاول", "الاولي", "اول"].includes(nx.n)) { col = 1; drop.add(iC + 1); }
    else if (["2", "اتنين", "اثنين", "التاني", "تاني", "الثاني"].includes(nx.n)) { col = 2; drop.add(iC + 1); }
  }
  const rest = tokens.filter((t, i) => !drop.has(i)).map(t => t.orig).join(" ");
  const p = parseVoice(rest);
  return { type: "cash", name: p.name, amount: p.amount, col: col };
}

async function runSectionCommand(cmd, heard) {
  const head = "سمعتك بتقول: " + heard + "\n\n";

  if (cmd.type === "closing") {
    const label = cmd.field === "treasury" ? "الخزنة" : "الرصيد";
    if (!(cmd.amount > 0)) {
      alert(head + "ما فهمتش المبلغ.");
      return;
    }
    if (!confirm(head + "تسجّل " + label + " = " + money(cmd.amount) + "؟")) return;
    closing[cmd.field] = cmd.amount;
    showView("closing");
    await saveClosingNow();
    return;
  }

  if (!cmd.name) {
    alert(head + "ما فهمتش اسم الخط.");
    return;
  }
  if (!(cmd.amount > 0)) {
    alert(head + "ما فهمتش المبلغ.");
    return;
  }
  let col = cmd.col;
  let found = findCashRows(cmd.name, cashRows);
  if (found.length === 0) {
    const m = cmd.name.match(/^(.*\S)\s+([12])$/);
    if (m) {
      found = findCashRows(m[1], cashRows);
      if (found.length && col === null) col = Number(m[2]);
    }
  }
  if (found.length === 0) {
    alert(head + "مش لاقي خط اسمه «" + cmd.name + "».");
    return;
  }
  if (found.length > 1) {
    alert(head + "فيه أكتر من خط قريب: " + found.map(r => r.name).join(" ، ") + "\nقول الاسم كامل.");
    return;
  }
  const row = found[0];
  const usedCol = col || 1;
  const hint = col ? "" : "\n(لو قصدك كاش 2 اضغط إلغاء وقول: «كاش 2 " + row.name + " " + cmd.amount + "»)";
  if (!confirm(head + "تسجّل كاش " + usedCol + " لـ«" + row.name + "» = " + money(cmd.amount) + "؟" + hint)) return;
  const key = "c" + usedCol;
  const old = row[key];
  row[key] = cmd.amount;
  showView("cash");
  try {
    await putStore("cash", row);
  } catch (err) {
    row[key] = old;
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  renderCash();
}
// ===== نهاية الكاش والتقفيل =====

const btnMic = document.getElementById("btn-mic");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'ar-EG';
  recognition.interimResults = false;

  btnMic.addEventListener("click", () => {
    try {
      recognition.start();
      btnMic.style.backgroundColor = "#e74c3c";
      btnMic.textContent = "بيسمعك...";
    } catch (e) {
      recognition.stop();
    }
  });

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.trim();
    btnMic.style.backgroundColor = "";
    btnMic.textContent = "🎙️";

    const cmd = parseCommand(text);
    if (cmd) {
      runDeleteCommand(cmd, text);
      return;
    }

    const section = parseSectionCommand(text);
    if (section) {
      runSectionCommand(section, text);
      return;
    }

    const res = parseVoice(text);
    if (res.book && res.book !== currentBook) switchBook(res.book);
    openAddDialog(res.name, res.amount, text);
  };

  recognition.onerror = () => {
    btnMic.style.backgroundColor = "";
    btnMic.textContent = "🎙️";
    alert("لم يتم التعرف على الصوت، حاوِل مرة أخرى.");
  };

  recognition.onend = () => {
    btnMic.style.backgroundColor = "";
    btnMic.textContent = "🎙️";
  };
} else {
  btnMic.addEventListener("click", () => {
    alert("المتصفح ده لا يدعم التسجيل الصوتي.");
  });
}

tabIn.addEventListener("click", () => switchBook("in"));
tabOut.addEventListener("click", () => switchBook("out"));
searchBox.addEventListener("input", render);

async function start() {
  try {
    db = await openDB();
    const all = await loadAll();
    for (const p of all) data[p.book].push(p);
    cashRows = await loadCash();
    closing = await loadClosing();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist();
    }
  } catch (e) {
    alert("المتصفح ده مش قادر يشغّل الحفظ المحلي.");
  }
  render();
}

start();

// ===== النسخ الاحتياطي التلقائي =====
const BACKUP_TIME_KEY = "daftar-last-backup";
const BACKUP_DIRTY_KEY = "daftar-dirty";
const BACKUP_EVERY_MIN = 60;

function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
         "_" + p(d.getHours()) + "-" + p(d.getMinutes());
}

function updateBackupStatus() {
  const el = document.getElementById("backup-status");
  if (!el) return;
  let last = 0, dirty = false;
  try {
    last = Number(localStorage.getItem(BACKUP_TIME_KEY) || 0);
    dirty = localStorage.getItem(BACKUP_DIRTY_KEY) === "1";
  } catch (e) {}
  let msg;
  if (!last) {
    msg = "لسه مفيش نسخة احتياطية";
  } else {
    msg = "آخر نسخة احتياطية: " + new Date(last).toLocaleString("ar-EG", {
      day: "numeric", month: "short", hour: "numeric", minute: "2-digit"
    });
  }
  if (dirty) msg += " (فيه تعديلات بعدها)";
  el.textContent = msg;
}

function downloadBackup() {
  const backup = {
    app: "daftar",
    date: getDateString(),
    in: data.in.filter(p => p.ops.length > 0),
    out: data.out.filter(p => p.ops.length > 0),
    cash: cashRows.map(r => ({ name: r.name, c1: r.c1, c2: r.c2, order: r.order })),
    closing: { treasury: closing.treasury, balance: closing.balance }
  };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "daftar-backup-" + backupStamp() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try {
    localStorage.setItem(BACKUP_TIME_KEY, String(Date.now()));
    localStorage.removeItem(BACKUP_DIRTY_KEY);
  } catch (e) {}
  updateBackupStatus();
}

function autoBackupIfNeeded() {
  if (restoring) return;
  try {
    if (localStorage.getItem(BACKUP_DIRTY_KEY) !== "1") return;
    const last = Number(localStorage.getItem(BACKUP_TIME_KEY) || 0);
    if (Date.now() - last < BACKUP_EVERY_MIN * 60 * 1000) return;
    downloadBackup();
  } catch (e) {}
}

function markChanged() {
  try { localStorage.setItem(BACKUP_DIRTY_KEY, "1"); } catch (e) {}
  updateBackupStatus();
  autoBackupIfNeeded();
}

document.getElementById("btn-backup").addEventListener("click", downloadBackup);
updateBackupStatus();
// ===== نهاية النسخ الاحتياطي التلقائي =====

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
