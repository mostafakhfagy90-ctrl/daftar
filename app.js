let currentBook = "in";
const data = { in: [], out: [] };
let db;
let currentView = "in";
let cashRows = [];
let closing = { key: "closing", treasury: 0, balance: 0 };
let restoring = false;
let dailyDays = [];
let dailyViewId = null;
let lines = [];
let assigns = [];
let dailyRule = { key: "dailyRule", min: 5, unit: 5, first: 650, step: 500 };
let lineDefaults = { key: "lineDefaults", target: 180000, days: 3 };
const DEFAULT_CASH_ROWS = ["اخضر", "لبني", "هواوي", "S", "O", "R", "D", "ابوصغير", "ابوامر", "احمر", "K", "F.V/K.V", "", ""];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("daftar-db", 4);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      const tx = e.target.transaction;
      if (!database.objectStoreNames.contains("people")) {
        database.createObjectStore("people", { keyPath: "id", autoIncrement: true });
      }
      let cashIsNew = false;
      if (!database.objectStoreNames.contains("cash")) {
        cashIsNew = true;
        const cs = database.createObjectStore("cash", { keyPath: "id", autoIncrement: true });
        DEFAULT_CASH_ROWS.forEach((name, i) => cs.add({ n1: name, n2: name, c1: null, c2: null, order: i }));
      }
      if (!database.objectStoreNames.contains("settings")) {
        database.createObjectStore("settings", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("daily")) {
        database.createObjectStore("daily", { keyPath: "id", autoIncrement: true });
      }
      if (!database.objectStoreNames.contains("lines")) {
        database.createObjectStore("lines", { keyPath: "n" });
      }
      if (!database.objectStoreNames.contains("assigns")) {
        database.createObjectStore("assigns", { keyPath: "id", autoIncrement: true });
      }
      if (!cashIsNew) {
        tx.objectStore("cash").openCursor().onsuccess = (ev) => {
          const cur = ev.target.result;
          if (cur) {
            const v = cur.value;
            if (v.n1 === undefined) {
              v.n1 = v.name || "";
              v.n2 = v.name || "";
              cur.update(v);
            }
            cur.continue();
          }
        };
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

// ===== التصدير: نسخة من كل تاب لوحدها أو الكل (إكسيل / PDF) =====
const VIEW_TITLES = { in: "الداخل", out: "الخارج", cash: "الكاش", daily: "اليومية", lines: "الخطوط", closing: "التقفيل" };
const ALL_VIEWS = ["in", "out", "cash", "daily", "lines", "closing"];

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

function lineStatusText(a) {
  if (a.status === "closed") return "مقفولة";
  const p = planInfo(a, currentDay().id);
  if (p.status === "done") return "مكتمل";
  if (p.status === "overdue") return "انتهت المدة";
  if (p.status === "late") return "متأخر " + p.deficitBefore;
  return "في الميعاد";
}

function linesSheetRows() {
  const rows = [["رقم الخط", "الاسم", "التليفون", "الحامل", "المستهدف", "المحصّل", "المتبقي", "اليوم", "الحالة"]];
  const dayId = currentDay().id;
  for (const a of assigns.slice().sort((x, y) => x.lineN - y.lineN)) {
    const l = lineByN(a.lineN) || { name: "", phone: "" };
    const total = sumAmounts(a.entries || []);
    rows.push([a.lineN, l.name, l.phone, holderLabel(a), a.target, total, Math.max(0, round2(a.target - total)),
               Math.max(1, dayId - a.startDay + 1), lineStatusText(a)]);
  }
  return rows;
}

function dailySheetRows(day) {
  const rows = [["اليومية - " + dateLabel(day.date)]];
  const head = [];
  for (let p = 0; p < DAILY_PAIRS; p++) head.push("سحب و إيداع", "عمولة");
  rows.push(head);
  const count = Math.max(1, lastUsedRow(day) + 1);
  for (let r = 0; r < count; r++) {
    const row = [];
    for (let p = 0; p < DAILY_PAIRS; p++) {
      const c = day.cells[cellKey(p, r)];
      row.push(c ? c.w : "", c ? c.c : "");
    }
    rows.push(row);
  }
  rows.push([]);
  const t = dailyTotals(day);
  const tot = [];
  for (let p = 0; p < DAILY_PAIRS; p++) tot.push("", t.used[p] ? t.perPair[p] : "");
  rows.push(tot);
  const grand = new Array(DAILY_PAIRS * 2).fill("");
  grand[0] = "إجمالي كل العمولات";
  grand[DAILY_PAIRS * 2 - 1] = t.grand;
  rows.push(grand);
  return rows;
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
      rows.push([r.n1, typeof r.c1 === "number" ? r.c1 : "", r.n2, typeof r.c2 === "number" ? r.c2 : ""]);
    }
    rows.push([]);
    rows.push(["إجمالي الكاش 1", round2(cashRows.reduce((t, r) => t + cashNum(r.c1), 0))]);
    rows.push(["إجمالي الكاش 2", round2(cashRows.reduce((t, r) => t + cashNum(r.c2), 0))]);
    rows.push(["إجمالي الكاش", cashTotal()]);
  } else if (view === "daily") {
    return dailySheetRows(viewedDay());
  } else if (view === "lines") {
    return linesSheetRows();
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
  let subtitle = getDateString();

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
      rows += "<tr>" + cell(r.n1 || "", TDB) + cell(typeof r.c1 === "number" ? r.c1 : "") +
              cell(r.n2 || "", TDB) + cell(typeof r.c2 === "number" ? r.c2 : "") + "</tr>";
    }
    const foot = '<tr><td ' + TDB + ' colspan="3">إجمالي الكاش</td>' + cell(cashTotal(), TDB) + "</tr>";
    body = '<table style="border-collapse:collapse;width:100%;"><tr><th ' + TH + ">الخط 1</th><th " + TH + ">الكاش 1</th><th " + TH +
           ">الخط 2</th><th " + TH + ">الكاش 2</th></tr>" + rows + foot + "</table>";
  } else if (view === "daily") {
    const day = viewedDay();
    subtitle = dateLabel(day.date);
    const T1 = 'style="border:1px solid #999;padding:4px 3px;background:#eee;text-align:center;font-size:11px;"';
    const T2 = 'style="border:1px solid #999;padding:4px 3px;text-align:center;font-size:12px;height:20px;"';
    const T3 = 'style="border:1px solid #999;padding:5px 3px;text-align:center;font-size:12px;font-weight:bold;background:#f6f6f6;"';
    let head = "<tr>";
    for (let p = 0; p < DAILY_PAIRS; p++) head += "<th " + T1 + ">سحب و إيداع</th><th " + T1 + ">عمولة</th>";
    head += "</tr>";
    const count = Math.max(20, lastUsedRow(day) + 1);
    let rows = "";
    for (let r = 0; r < count; r++) {
      rows += "<tr>";
      for (let p = 0; p < DAILY_PAIRS; p++) {
        const c = day.cells[cellKey(p, r)];
        rows += "<td " + T2 + ">" + (c ? money(c.w) : "") + "</td><td " + T2 + ">" + (c ? money(c.c) : "") + "</td>";
      }
      rows += "</tr>";
    }
    const t = dailyTotals(day);
    let f1 = "<tr>";
    for (let p = 0; p < DAILY_PAIRS; p++) f1 += "<td " + T2 + "></td><td " + T3 + ">" + (t.used[p] ? money(t.perPair[p]) : "") + "</td>";
    f1 += "</tr>";
    const f2 = '<tr><td ' + T3 + ' colspan="' + (DAILY_PAIRS * 2 - 1) + '">إجمالي كل العمولات</td><td ' + T3 + ">" + money(t.grand) + "</td></tr>";
    body = '<table style="border-collapse:collapse;width:100%;">' + head + rows + f1 + f2 + "</table>";
  } else if (view === "lines") {
    const data2 = linesSheetRows();
    let head = "<tr>";
    for (const h of data2[0]) head += "<th " + TH + ">" + esc(h) + "</th>";
    head += "</tr>";
    let rows = "";
    for (const r of data2.slice(1)) {
      rows += "<tr>";
      r.forEach((v, i) => { rows += cell(v === "" ? "—" : v, i === 0 ? TDB : TD); });
      rows += "</tr>";
    }
    if (data2.length === 1) rows = '<tr><td ' + TD + ' colspan="9">لا توجد خطوط مخصصة</td></tr>';
    body = '<table style="border-collapse:collapse;width:100%;">' + head + rows + "</table>";
  } else {
    const f = closingFigures();
    const line = (label, v, st) => "<tr><td " + TDB + ">" + label + "</td>" + cell(v, st) + "</tr>";
    body = '<table style="border-collapse:collapse;width:60%;margin:0 auto;">' +
      line("الخزنة", closing.treasury) + line("الكاش", f.cash) + line("الخارج", f.out) + line("الرصيد", closing.balance) +
      line("المجموع", f.total4, TDB) + line("إجمالي الداخل", f.inn) +
      line(diffLabel(f.diff), Math.abs(f.diff), TDB) + "</table>";
  }

  return '<h2 style="text-align:center;margin:0 0 4px;">' + title + "</h2>" +
         '<p style="text-align:center;margin:0 0 14px;color:#555;">' + esc(subtitle) + "</p>" + body;
}

function exportExcel(views, label) {
  if (typeof XLSX === "undefined") {
    alert("مكتبة الإكسيل لسه ما اتحمّلتش. اتأكد من الإنترنت وحدّث الصفحة.");
    return;
  }
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const v of views) {
    const ws = XLSX.utils.aoa_to_sheet(viewSheetData(v));
    XLSX.utils.book_append_sheet(wb, ws, VIEW_TITLES[v]);
  }
  XLSX.writeFile(wb, label + "_" + getDateString() + ".xlsx");
}

function exportPdf(views, label) {
  if (typeof html2pdf === "undefined") {
    alert("مكتبة الـ PDF لسه ما اتحمّلتش. اتأكد من الإنترنت وحدّث الصفحة.");
    return;
  }
  const wrap = document.createElement("div");
  wrap.setAttribute("dir", "rtl");
  wrap.style.cssText = "position:fixed;left:-10000px;top:0;width:1000px;background:#fff;color:#000;padding:20px;font-family:Tahoma,Arial,sans-serif;";
  wrap.innerHTML = views.map(reportHtml).join('<div class="html2pdf__page-break"></div>');
  document.body.appendChild(wrap);
  const opt = {
    margin: 10,
    filename: label + "_" + getDateString() + ".pdf",
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
}

document.getElementById("btn-export-excel").addEventListener("click", () => exportExcel([currentView], VIEW_TITLES[currentView]));
document.getElementById("btn-export-pdf").addEventListener("click", () => exportPdf([currentView], VIEW_TITLES[currentView]));

const exportAllDialog = document.getElementById("export-all-dialog");
document.getElementById("btn-export-all").addEventListener("click", () => exportAllDialog.showModal());
document.getElementById("ex-close").addEventListener("click", () => exportAllDialog.close());
document.getElementById("ex-excel-all").addEventListener("click", () => { exportAllDialog.close(); exportExcel(ALL_VIEWS, "دفتر_الكل"); });
document.getElementById("ex-pdf-all").addEventListener("click", () => { exportAllDialog.close(); exportPdf(ALL_VIEWS, "دفتر_الكل"); });
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
          const n1 = String(r.n1 !== undefined ? r.n1 : (r.name || ""));
          const row = {
            n1: n1,
            n2: String(r.n2 !== undefined ? r.n2 : n1),
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
      if (importedData.dailyRule) {
        Object.assign(dailyRule, importedData.dailyRule, { key: "dailyRule" });
        await putStore("settings", dailyRule);
      }
      if (importedData.lineDefaults) {
        Object.assign(lineDefaults, importedData.lineDefaults, { key: "lineDefaults" });
        await putStore("settings", lineDefaults);
      }
      if (Array.isArray(importedData.lines) && importedData.lines.length) {
        await replaceStore("lines", importedData.lines);
        lines = importedData.lines.slice().sort((a, b) => a.n - b.n);
      }
      if (Array.isArray(importedData.daily) && importedData.daily.length) {
        await replaceStore("daily", importedData.daily);
        dailyDays = importedData.daily.slice().sort((a, b) => a.id - b.id);
        dailyViewId = currentDay().id;
      }
      if (Array.isArray(importedData.assigns)) {
        await replaceStore("assigns", importedData.assigns);
        assigns = importedData.assigns.slice();
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
const tabDaily = document.getElementById("tab-daily");
const tabLines = document.getElementById("tab-lines");
const tabClosing = document.getElementById("tab-closing");
const cashView = document.getElementById("cash-view");
const dailyView = document.getElementById("daily-view");
const linesView = document.getElementById("lines-view");
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
  const tabs = [["in", tabIn], ["out", tabOut], ["cash", tabCash], ["daily", tabDaily], ["lines", tabLines], ["closing", tabClosing]];
  for (const [v, t] of tabs) {
    t.classList.toggle("active", view === v);
    if (view === v && t.scrollIntoView) t.scrollIntoView({ inline: "center", block: "nearest" });
  }

  const ledger = isLedgerView();
  document.querySelector(".search-box").hidden = !ledger;
  document.getElementById("pdf-area").hidden = !ledger;
  document.getElementById("ledger-total").hidden = !ledger;
  cashView.hidden = view !== "cash";
  dailyView.hidden = view !== "daily";
  linesView.hidden = view !== "lines";
  closingView.hidden = view !== "closing";
  btnAdd.hidden = !(ledger || view === "cash" || view === "daily");
  btnAdd.textContent = view === "cash" ? "إضافة خط" : (view === "daily" ? "إضافة مبلغ" : "عملية جديدة");

  if (ledger) render();
  if (view === "cash") renderCash();
  if (view === "daily") renderDaily();
  if (view === "lines") renderLines();
  if (view === "closing") renderClosing();
}

function putStore(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => { if (["cash", "daily", "assigns"].includes(storeName)) value.id = req.result; };
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

function normCashRow(r) {
  if (r.n1 === undefined) r.n1 = r.name || "";
  if (r.n2 === undefined) r.n2 = r.name || "";
  return r;
}

function loadCash() {
  return new Promise((resolve, reject) => {
    const req = db.transaction("cash").objectStore("cash").getAll();
    req.onsuccess = () => resolve(req.result.map(normCashRow).sort((a, b) => (a.order - b.order) || (a.id - b.id)));
    req.onerror = () => reject(req.error);
  });
}

function loadAllFrom(storeName) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName).objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function loadSetting(key, fallback) {
  return new Promise((resolve, reject) => {
    const req = db.transaction("settings").objectStore("settings").get(key);
    req.onsuccess = () => resolve(req.result ? Object.assign({}, fallback, req.result) : fallback);
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
    const nm1 = r.n1 ? esc(r.n1) : "&nbsp;";
    const nm2 = r.n2 ? esc(r.n2) : "&nbsp;";
    html += "<tr>" +
      '<td class="cname" data-id="' + r.id + '" data-col="1">' + nm1 + "</td>" +
      '<td class="ccash" data-id="' + r.id + '" data-col="1">' + (typeof r.c1 === "number" ? money(r.c1) : "") + "</td>" +
      '<td class="cname" data-id="' + r.id + '" data-col="2">' + nm2 + "</td>" +
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

function openCashNameDialog(row, col) {
  cashNameEditing = row ? { row: row, col: col } : null;
  cashNameTitle.textContent = row ? "تعديل اسم الخط " + col : "خط جديد";
  cashNameInput.value = row ? (col === 1 ? row.n1 : row.n2) : "";
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
    cashDlgTitle.textContent = "كاش " + col + " - " + ((col === 1 ? row.n1 : row.n2) || "بدون اسم");
    const cur = row["c" + col];
    cashInput.value = typeof cur === "number" ? cur : "";
    cashDialog.showModal();
    cashInput.focus();
    return;
  }
  const n = e.target.closest("td.cname");
  if (n) {
    const row = cashRows.find(r => r.id === Number(n.dataset.id));
    if (row) openCashNameDialog(row, Number(n.dataset.col));
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
  const row = cashNameEditing ? cashNameEditing.row : null;
  if (!row) return;
  if (!confirm("تحذف الصف كله «" + (row.n1 || "بدون اسم") + " / " + (row.n2 || "بدون اسم") + "» بقيمه (كاش 1 وكاش 2)؟")) return;
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
  const editing = cashNameEditing;
  if (editing) {
    const row = editing.row;
    const key = "n" + editing.col;
    const old = row[key];
    row[key] = name;
    try {
      await putStore("cash", row);
    } catch (err) {
      row[key] = old;
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  } else {
    if (!name) return;
    const order = cashRows.reduce((m, r) => Math.max(m, r.order || 0), 0) + 1;
    const fresh = { n1: name, n2: name, c1: null, c2: null, order: order };
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
  if (currentView === "cash") {
    e.stopImmediatePropagation();
    openCashNameDialog(null);
  } else if (currentView === "daily") {
    e.stopImmediatePropagation();
    openNextDailySlot();
  }
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
tabDaily.addEventListener("click", () => showView("daily"));
tabLines.addEventListener("click", () => showView("lines"));
tabClosing.addEventListener("click", () => showView("closing"));

// التصدير (إكسيل / PDF) متاح في الداخل والخارج فقط
for (const id of ["btn-export-excel", "btn-export-pdf"]) {
  document.getElementById(id).addEventListener("click", (e) => {
    if (isLedgerView()) return;
    e.stopImmediatePropagation();
    alert("التصدير متاح في تاب الداخل والخارج فقط.");
  }, true);
}

// ----- أوامر الصوت للكاش والتقفيل -----
const CASH_ALIASES = {
  "اس": "s", "او": "o", "اوه": "o", "ار": "r", "دي": "d", "كي": "k", "اف": "f"
};

function cashKey(s) {
  return nameKey(s).replace(/^ال/, "").replace(/\s+/g, "");
}

function findCashMatches(spoken, rows, col) {
  let k = cashKey(spoken);
  if (!k) return [];
  if (CASH_ALIASES[k]) k = CASH_ALIASES[k];
  const cols = col ? [col] : [1, 2];
  const exact = [];
  const partial = [];
  for (const r of rows) {
    for (const c of cols) {
      const nm = c === 1 ? r.n1 : r.n2;
      if (!nm) continue;
      const rk = cashKey(nm);
      if (rk === k) exact.push({ row: r, col: c });
      else if (rk.includes(k) || (rk.length >= 3 && k.includes(rk))) partial.push({ row: r, col: c });
    }
  }
  const list = exact.length ? exact : partial;
  const byRow = new Map();
  for (const m of list) {
    if (!byRow.has(m.row)) byRow.set(m.row, []);
    byRow.get(m.row).push(m.col);
  }
  const out = [];
  for (const [row, cs] of byRow) {
    out.push({ row: row, col: cs.length === 1 ? cs[0] : null });
  }
  return out;
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
  let found = findCashMatches(cmd.name, cashRows, col);
  if (found.length === 0) {
    const m = cmd.name.match(/^(.*\S)\s+([12])$/);
    if (m) {
      const col2 = col === null ? Number(m[2]) : col;
      found = findCashMatches(m[1], cashRows, col2);
      if (found.length) col = col2;
    }
  }
  if (found.length === 0) {
    alert(head + "مش لاقي خط اسمه «" + cmd.name + "».");
    return;
  }
  if (found.length > 1) {
    alert(head + "فيه أكتر من خط قريب: " + found.map(f => (f.col === 2 ? f.row.n2 : f.row.n1)).join(" ، ") + "\nقول الاسم كامل.");
    return;
  }
  const row = found[0].row;
  if (col === null) col = found[0].col;
  const usedCol = col || 1;
  const shownName = (usedCol === 2 ? row.n2 : row.n1) || row.n1 || row.n2;
  const hint = col ? "" : "\n(لو قصدك كاش 2 اضغط إلغاء وقول: «كاش 2 " + shownName + " " + cmd.amount + "»)";
  if (!confirm(head + "تسجّل كاش " + usedCol + " لـ«" + shownName + "» = " + money(cmd.amount) + "؟" + hint)) return;
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

function replaceStore(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.clear();
    for (const it of items) store.put(it);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ===== قسم اليومية =====
const DAILY_PAIRS = 7;
const dailyTable = document.getElementById("daily-table");
const dailyDateEl = document.getElementById("daily-date");
const dailyTagEl = document.getElementById("daily-tag");
const dailyGrandEl = document.getElementById("daily-grand");
const dailyDialog = document.getElementById("daily-dialog");
const dailyForm = document.getElementById("daily-form");
const dailyDlgTitle = document.getElementById("daily-dlg-title");
const dAmount = document.getElementById("d-amount");
const dComm = document.getElementById("d-comm");
const dCommHint = document.getElementById("d-comm-hint");
let dailyEditing = null;
let dailyCommManual = false;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function dateLabel(str) {
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function commissionFor(amount, rule) {
  if (!(amount > 0)) return null;
  if (amount < rule.first) return rule.min;
  return rule.min + rule.unit * (Math.floor((amount - rule.first) / rule.step) + 1);
}

function currentDay() {
  return dailyDays[dailyDays.length - 1];
}

function viewedDay() {
  return dailyDays.find(d => d.id === dailyViewId) || currentDay();
}

function cellKey(p, r) {
  return p + "-" + r;
}

function nextSlot(day) {
  for (let p = 0; p < DAILY_PAIRS; p++) {
    for (let r = 0; r < day.rows; r++) {
      if (!day.cells[cellKey(p, r)]) return { p: p, r: r };
    }
  }
  return null;
}

function lastUsedRow(day) {
  let last = -1;
  for (const k of Object.keys(day.cells)) {
    const r = Number(k.split("-")[1]);
    if (r > last) last = r;
  }
  return last;
}

function dailyTotals(day) {
  const perPair = new Array(DAILY_PAIRS).fill(0);
  const used = new Array(DAILY_PAIRS).fill(false);
  for (const k of Object.keys(day.cells)) {
    const p = Number(k.split("-")[0]);
    const cell = day.cells[k];
    if (cell && typeof cell.c === "number") {
      perPair[p] += cell.c;
      used[p] = true;
    }
  }
  const rounded = perPair.map(round2);
  return { perPair: rounded, used: used, grand: round2(rounded.reduce((a, b) => a + b, 0)) };
}

async function ensureDay() {
  if (dailyDays.length) return;
  const first = { date: todayStr(), rows: 40, cells: {} };
  dailyDays.push(first);
  try {
    await putStore("daily", first);
  } catch (e) {
    dailyDays.pop();
  }
}

function renderDaily() {
  const day = viewedDay();
  if (!day) return;
  dailyViewId = day.id;
  const isCurrent = day === currentDay();
  dailyDateEl.textContent = dateLabel(day.date);
  dailyTagEl.textContent = isCurrent ? "اليوم الحالي" : "يوم سابق";

  const nxt = nextSlot(day);
  let head = "<tr>";
  for (let p = 0; p < DAILY_PAIRS; p++) {
    head += '<th class="dh">سحب و إيداع</th><th class="dh dhc">عمولة</th>';
  }
  head += "</tr>";

  let body = "";
  for (let r = 0; r < day.rows; r++) {
    body += "<tr>";
    for (let p = 0; p < DAILY_PAIRS; p++) {
      const cell = day.cells[cellKey(p, r)];
      const isNext = nxt && nxt.p === p && nxt.r === r;
      body += '<td class="dw' + (isNext ? " dnext" : "") + '" data-p="' + p + '" data-r="' + r + '">' +
              (cell ? money(cell.w) : "") + "</td>";
      body += '<td class="dc" data-p="' + p + '" data-r="' + r + '">' +
              (cell ? money(cell.c) + (cell.manual ? '<span class="dot"></span>' : "") : "") + "</td>";
    }
    body += "</tr>";
  }

  const t = dailyTotals(day);
  let foot = '<tr class="dfoot1">';
  for (let p = 0; p < DAILY_PAIRS; p++) {
    foot += '<td class="dsumblank"></td><td class="dsum">' + (t.used[p] ? money(t.perPair[p]) : "") + "</td>";
  }
  foot += '</tr><tr class="dfoot2"><td colspan="' + (DAILY_PAIRS * 2 - 1) + '" class="dgrandlabel">إجمالي كل العمولات</td>' +
          '<td class="dgrand">' + money(t.grand) + "</td></tr>";

  dailyTable.innerHTML = "<thead>" + head + "</thead><tbody>" + body + "</tbody><tfoot>" + foot + "</tfoot>";
  dailyGrandEl.textContent = money(t.grand) + " جنيه";
}

function autoCommissionText(amountText) {
  const w = Number(amountText);
  const c = commissionFor(w, dailyRule);
  return c === null ? "" : String(c);
}

function openDailyDialog(p, r) {
  const day = viewedDay();
  const cell = day.cells[cellKey(p, r)];
  dailyEditing = { day: day, p: p, r: r };
  dailyDlgTitle.textContent = "زوج " + (p + 1) + " · صف " + (r + 1);
  dAmount.value = cell ? cell.w : "";
  dailyCommManual = cell ? !!cell.manual : false;
  dComm.value = cell ? cell.c : "";
  dCommHint.textContent = dailyCommManual ? "يدوي" : "تلقائي";
  dailyDialog.showModal();
  dAmount.focus();
}

function openNextDailySlot() {
  const day = viewedDay();
  const nxt = nextSlot(day);
  if (!nxt) {
    alert("الورقة امتلت. اضغط «+10 صفوف» عشان تكمل.");
    return;
  }
  openDailyDialog(nxt.p, nxt.r);
}

dAmount.addEventListener("input", () => {
  if (!dailyCommManual) dComm.value = autoCommissionText(dAmount.value);
});

dComm.addEventListener("input", () => {
  if (dComm.value.trim() === "") {
    dailyCommManual = false;
    dComm.value = autoCommissionText(dAmount.value);
    dCommHint.textContent = "تلقائي";
  } else {
    dailyCommManual = true;
    dCommHint.textContent = "يدوي";
  }
});

dailyTable.addEventListener("click", (e) => {
  const cell = e.target.closest("td.dw, td.dc");
  if (!cell) return;
  openDailyDialog(Number(cell.dataset.p), Number(cell.dataset.r));
});

document.getElementById("d-cancel").addEventListener("click", () => dailyDialog.close());

async function saveDay(day, undo) {
  try {
    await putStore("daily", day);
  } catch (e) {
    undo();
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
}

document.getElementById("d-clear").addEventListener("click", async () => {
  if (!dailyEditing) return;
  const { day, p, r } = dailyEditing;
  const key = cellKey(p, r);
  const old = day.cells[key];
  delete day.cells[key];
  await saveDay(day, () => { if (old) day.cells[key] = old; });
  dailyDialog.close();
  renderDaily();
});

dailyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!dailyEditing) return;
  const { day, p, r } = dailyEditing;
  const key = cellKey(p, r);
  const w = Number(dAmount.value);
  if (dAmount.value.trim() === "" || !(w > 0)) {
    alert("اكتب مبلغ صحيح.");
    return;
  }
  let c, manual;
  const typed = dComm.value.trim();
  if (dailyCommManual && typed !== "" && Number.isFinite(Number(typed))) {
    c = Number(typed);
    manual = true;
  } else {
    c = commissionFor(w, dailyRule);
    manual = false;
  }
  const old = day.cells[key];
  day.cells[key] = { w: w, c: c, manual: manual };
  await saveDay(day, () => { if (old) day.cells[key] = old; else delete day.cells[key]; });
  dailyDialog.close();
  renderDaily();
});

// ----- التنقل بين الأيام -----
function stepDay(dir) {
  const i = dailyDays.findIndex(d => d.id === dailyViewId);
  const j = i + dir;
  if (j < 0 || j >= dailyDays.length) return;
  dailyViewId = dailyDays[j].id;
  renderDaily();
}

document.getElementById("daily-prev").addEventListener("click", () => stepDay(-1));
document.getElementById("daily-next").addEventListener("click", () => stepDay(1));

document.getElementById("daily-more-rows").addEventListener("click", async () => {
  const day = viewedDay();
  day.rows += 10;
  await saveDay(day, () => { day.rows -= 10; });
  renderDaily();
});

document.getElementById("daily-new-day").addEventListener("click", async () => {
  const cur = currentDay();
  const used = Object.keys(cur.cells).length;
  const msg = used
    ? "تبدأ يوم جديد؟ اليوم الحالي هيتحفظ في الأيام السابقة، والخطوط هتنتقل لليوم الجديد."
    : "اليوم الحالي لسه فاضي. تبدأ يوم جديد برضه؟";
  if (!confirm(msg)) return;
  const fresh = { date: todayStr(), rows: cur.rows, cells: {} };
  dailyDays.push(fresh);
  try {
    await putStore("daily", fresh);
  } catch (err) {
    dailyDays.pop();
    alert("لم يتم الحفظ! حاول مرة أخرى.");
    return;
  }
  dailyViewId = fresh.id;
  renderDaily();
});

// ----- الأيام السابقة -----
const dailyHistoryDialog = document.getElementById("daily-history-dialog");
const dailyHistoryList = document.getElementById("daily-history-list");

document.getElementById("daily-history").addEventListener("click", () => {
  let html = "";
  for (const d of dailyDays.slice().reverse()) {
    const t = dailyTotals(d);
    html += '<button type="button" class="hist-item" data-id="' + d.id + '"><span>' + esc(dateLabel(d.date)) +
            '</span><strong>' + money(t.grand) + "</strong></button>";
  }
  dailyHistoryList.innerHTML = html;
  dailyHistoryDialog.showModal();
});

dailyHistoryList.addEventListener("click", (e) => {
  const b = e.target.closest("button.hist-item");
  if (!b) return;
  dailyViewId = Number(b.dataset.id);
  dailyHistoryDialog.close();
  renderDaily();
});

document.getElementById("daily-history-close").addEventListener("click", () => dailyHistoryDialog.close());

// ----- قاعدة العمولة -----
const ruleDialog = document.getElementById("rule-dialog");
const ruleForm = document.getElementById("rule-form");

document.getElementById("daily-rule-btn").addEventListener("click", () => {
  document.getElementById("r-min").value = dailyRule.min;
  document.getElementById("r-unit").value = dailyRule.unit;
  document.getElementById("r-first").value = dailyRule.first;
  document.getElementById("r-step").value = dailyRule.step;
  ruleDialog.showModal();
});

document.getElementById("rule-cancel").addEventListener("click", () => ruleDialog.close());

ruleForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const vals = {
    min: Number(document.getElementById("r-min").value),
    unit: Number(document.getElementById("r-unit").value),
    first: Number(document.getElementById("r-first").value),
    step: Number(document.getElementById("r-step").value)
  };
  if (!(vals.min > 0) || !(vals.unit > 0) || !(vals.first > 0) || !(vals.step > 0)) {
    alert("كل الأرقام لازم تكون أكبر من صفر.");
    return;
  }
  const old = Object.assign({}, dailyRule);
  Object.assign(dailyRule, vals);
  try {
    await putStore("settings", dailyRule);
  } catch (err) {
    Object.assign(dailyRule, old);
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  ruleDialog.close();
});

// ----- الصوت في اليومية -----
function parseDailyVoice(text) {
  const clean = text
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => ({ orig: t, n: normAr(t) }));
  const iC = tokens.findIndex(t => t.n === "عموله" || t.n === "العموله");
  const left = (iC === -1 ? tokens : tokens.slice(0, iC)).map(t => t.orig).join(" ");
  const right = iC === -1 ? "" : tokens.slice(iC + 1).map(t => t.orig).join(" ");
  const w = parseVoice(left).amount;
  const c = right ? parseVoice(right).amount : 0;
  return { amount: w, commission: c > 0 ? c : null };
}

async function runDailyVoice(dv, heard) {
  const head = "سمعتك بتقول: " + heard + "\n\n";
  const day = viewedDay();
  const slot = nextSlot(day);
  if (!slot) {
    alert(head + "الورقة امتلت. اضغط «+10 صفوف» الأول.");
    return;
  }
  const manual = dv.commission !== null;
  const c = manual ? dv.commission : commissionFor(dv.amount, dailyRule);
  const msg = head + "تسجّل " + money(dv.amount) + " ← عمولة " + money(c) + (manual ? " (يدوي)" : "") +
              " في زوج " + (slot.p + 1) + " · صف " + (slot.r + 1) + "؟";
  if (!confirm(msg)) return;
  const key = cellKey(slot.p, slot.r);
  day.cells[key] = { w: dv.amount, c: c, manual: manual };
  await saveDay(day, () => { delete day.cells[key]; });
  renderDaily();
}
// ===== نهاية اليومية =====

// ===== قسم الخطوط =====
const linesBody = document.getElementById("lines-body");
const lineSearch = document.getElementById("line-search");
let selectedLine = null;

const STATUS_ORDER = { overdue: 0, late: 1, ok: 2, done: 3 };

function toLatinDigits(s) {
  return s
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
}

function lineByN(n) {
  return lines.find(l => l.n === n);
}

function activeAssign(n) {
  return assigns.find(a => a.lineN === n && a.status === "active");
}

function holderLabel(a) {
  const row = cashRows.find(r => r.id === a.holderId);
  if (row) {
    const nm = a.holderCol === 2 ? row.n2 : row.n1;
    if (nm) return nm + " · كاش " + a.holderCol;
  }
  return a.holderLabel || "—";
}

function sumAmounts(list) {
  return round2(list.reduce((t, e) => t + e.amount, 0));
}

function planInfo(a, dayId) {
  const entries = a.entries || [];
  const total = sumAmounts(entries);
  const dayIndex = Math.max(1, dayId - a.startDay + 1);
  const Q = a.target / a.days;
  const before = sumAmounts(entries.filter(e => e.day < dayId));
  const today = sumAmounts(entries.filter(e => e.day === dayId));
  const remaining = Math.max(0, round2(a.target - total));
  let requiredToday;
  if (a.mode === "fixed") requiredToday = Math.min(Q, Math.max(0, a.target - before));
  else if (dayIndex >= a.days) requiredToday = Math.max(0, a.target - before);
  else requiredToday = Math.max(0, Math.min(a.target, Q * dayIndex) - before);
  requiredToday = round2(requiredToday);
  const passed = Math.min(dayIndex - 1, a.days);
  const deficitBefore = Math.max(0, round2(Q * passed - before));
  const perDay = [];
  for (let i = 0; i < a.days; i++) {
    const id = a.startDay + i;
    perDay.push(sumAmounts(entries.filter(e => e.day === id)));
  }
  let status = "ok";
  if (total >= a.target) status = "done";
  else if (dayIndex > a.days) status = "overdue";
  else if (deficitBefore > 0) status = "late";
  return {
    total: total, remaining: remaining, dayIndex: dayIndex, Q: Q, before: before, today: today,
    requiredToday: requiredToday, todayLeft: Math.max(0, round2(requiredToday - today)),
    deficitBefore: deficitBefore, perDay: perDay, status: status
  };
}

function statusChip(p) {
  if (p.status === "done") return '<span class="lchip done">مكتمل</span>';
  if (p.status === "overdue") return '<span class="lchip overdue">انتهت المدة · ناقص ' + money(p.remaining) + "</span>";
  if (p.status === "late") return '<span class="lchip late">متأخر ' + money(p.deficitBefore) + "</span>";
  return '<span class="lchip ok">في الميعاد</span>';
}

function searchLines(q) {
  const t = toLatinDigits(q.trim());
  if (!t) return [];
  if (/^\d+$/.test(t)) {
    if (t.length <= 3) {
      const hit = lines.filter(l => String(l.n) === t);
      if (hit.length) return hit;
    }
    return lines.filter(l => (l.phone || "").includes(t)).slice(0, 8);
  }
  const k = normAr(t).replace(/\*/g, "");
  return lines.filter(l => normAr(l.name || "").replace(/\*/g, "").includes(k)).slice(0, 8);
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function lineCardHtml(l) {
  const a = activeAssign(l.n);
  let h = '<div class="lcard"><div class="lhead"><div><div class="lsmall">خط رقم</div>' +
    '<div class="lnum">' + l.n + ' <span class="lname">· ' + esc(l.name || "") + "</span></div>" +
    '<div class="lphone">' + esc(l.phone || "") + "</div></div>" +
    '<div class="lbtns"><button type="button" class="icon-btn" data-act="line-edit" data-n="' + l.n + '">تعديل</button>' +
    '<button type="button" class="icon-btn" data-act="line-close">×</button></div></div>';

  if (a) {
    const p = planInfo(a, currentDay().id);
    h += '<div class="lholder"><span>مسجّل على: <b>' + esc(holderLabel(a)) + "</b></span>" +
         '<button type="button" class="icon-btn" data-act="plan-edit" data-aid="' + a.id + '">تعديل الخطة</button></div>';
    h += '<div class="lstatus">' + statusChip(p) + "</div>";
    h += '<div class="lprog"><strong>' + money(p.total) + "</strong><span>من " + money(a.target) + "</span></div>";
    h += '<div class="lbars">';
    for (let i = 0; i < a.days; i++) {
      let cls = "future";
      if (i < p.dayIndex - 1) cls = p.perDay[i] >= p.Q ? "ok" : "short";
      else if (i === p.dayIndex - 1) cls = "now";
      const pct = Math.max(0, Math.min(100, (p.perDay[i] / p.Q) * 100));
      h += '<div class="seg ' + cls + '"><div style="width:' + pct + '%"></div></div>';
    }
    h += '</div><div class="lbarlabels">';
    for (let i = 0; i < a.days; i++) {
      const isFuture = i > p.dayIndex - 1;
      h += "<div>يوم " + (i + 1) + (i === p.dayIndex - 1 ? " (النهارده)" : "") + "<br><span>" +
           (isFuture ? "—" : money(p.perDay[i]) + " / " + money(p.Q)) + "</span></div>";
    }
    h += "</div>";
    if (p.status !== "done") {
      h += '<div class="lnote">مطلوب النهارده: <b>' + money(p.requiredToday) + "</b> · باقي: <b>" + money(p.todayLeft) + "</b>" +
           (a.mode === "fixed" ? " · وضع ثابت" : "") + "</div>";
      if (p.deficitBefore > 0 && a.mode !== "fixed") {
        h += '<div class="lnote warn">فيه ' + money(p.deficitBefore) + " ناقصين من الأيام اللي فاتت اترحّلوا لمطلوب النهارده.</div>";
      }
    }
    const list = (a.entries || []).map((e, i) => ({ e: e, i: i })).reverse();
    h += '<div class="lentries">';
    if (!list.length) h += '<div class="lempty">لسه مفيش تحصيلات</div>';
    for (const it of list) {
      h += '<div class="lentry"><span class="etime">يوم ' + (it.e.day - a.startDay + 1) + " · " + timeLabel(it.e.ts) + "</span>" +
           '<span class="eamt' + (it.e.amount < 0 ? " neg" : "") + '">' + money(it.e.amount) + "</span>" +
           '<span class="enote">' + esc(it.e.note || "") + "</span>" +
           '<button type="button" class="icon-btn" data-act="entry-edit" data-aid="' + a.id + '" data-i="' + it.i + '">تعديل</button></div>';
    }
    h += '</div><div class="lactions"><button type="button" class="main-btn" data-act="entry-add" data-aid="' + a.id + '">+ تحصيل</button></div>';
  } else {
    h += '<div class="lstatus"><span class="lchip free">غير مخصص</span></div>' +
         '<div class="lactions"><button type="button" class="main-btn" data-act="assign" data-n="' + l.n + '">تخصيص على حامل</button></div>';
    const past = assigns.filter(a => a.lineN === l.n && a.status !== "active").slice(-3).reverse();
    if (past.length) {
      h += '<div class="lhist">';
      for (const a of past) {
        h += "<div>" + esc(holderLabel(a)) + " · " + money(sumAmounts(a.entries || [])) + " من " + money(a.target) +
             (a.status === "done" ? " ✓" : " (اتقفلت)") + "</div>";
      }
      h += "</div>";
    }
  }
  return h + "</div>";
}

function activeListHtml() {
  const act = assigns.filter(a => a.status === "active");
  if (!act.length) {
    return lines.length
      ? '<div class="lempty">مفيش خطوط نشطة دلوقتي. دوّر على خط بالرقم وخصّصه.</div>'
      : '<div class="lempty">لسه مفيش خطوط. اضغط «استيراد» وحمّل ملف الخطوط، أو أضف خط بإيدك.</div>';
  }
  const dayId = currentDay().id;
  const items = act.map(a => ({ a: a, p: planInfo(a, dayId) }))
    .sort((x, y) => (STATUS_ORDER[x.p.status] - STATUS_ORDER[y.p.status]) || (y.p.deficitBefore - x.p.deficitBefore));
  const needed = round2(items.reduce((t, it) => t + it.p.requiredToday, 0));
  const got = round2(items.reduce((t, it) => t + it.p.today, 0));
  let h = '<div class="lsum"><div><span>مطلوب النهارده من كل الخطوط</span><strong>' + money(needed) +
          "</strong></div><div><span>اتحصّل النهارده</span><strong>" + money(got) + "</strong></div></div>" +
          '<div class="lsection">الخطوط النشطة (' + items.length + ")</div>";
  for (const it of items) {
    const l = lineByN(it.a.lineN);
    h += '<button type="button" class="lrow" data-act="open-line" data-n="' + it.a.lineN + '">' +
         '<span class="rnum">' + it.a.lineN + "</span><span class=\"rname\">" + esc(holderLabel(it.a)) + "</span>" +
         '<span class="rprog ' + it.p.status + '">' + money(it.p.total) + " / " + money(it.a.target) + "</span></button>";
  }
  return h;
}

function renderLines() {
  const q = lineSearch.value.trim();
  const res = q ? searchLines(q) : [];
  if (q && res.length === 1) selectedLine = res[0].n;
  let h = "";
  if (q && res.length === 0) h += '<div class="lempty">مفيش خط بالرقم أو الاسم ده.</div>';
  if (q && res.length > 1) {
    h += '<div class="lresults">';
    for (const l of res) {
      h += '<button type="button" class="lres" data-act="open-line" data-n="' + l.n + '"><b>' + l.n + "</b><span>" +
           esc(l.name || "") + "</span><small>" + esc(l.phone || "") + "</small></button>";
    }
    h += "</div>";
  }
  const sel = selectedLine !== null ? lineByN(selectedLine) : null;
  if (sel && (!q || res.length <= 1 || res.some(l => l.n === sel.n))) h += lineCardHtml(sel);
  h += activeListHtml();
  linesBody.innerHTML = h;
}

lineSearch.addEventListener("input", () => {
  selectedLine = null;
  renderLines();
});

// ----- نافذة التخصيص / تعديل الخطة -----
const assignDialog = document.getElementById("assign-dialog");
const assignForm = document.getElementById("assign-form");
const assignTitle = document.getElementById("assign-title");
const laHolder = document.getElementById("la-holder");
const laTarget = document.getElementById("la-target");
const laDays = document.getElementById("la-days");
const laMode = document.getElementById("la-mode");
const laEnd = document.getElementById("la-end");
let assignEditing = null;

function holderOptionsHtml(selectedValue) {
  let h = "";
  for (const r of cashRows) {
    for (const c of [1, 2]) {
      const nm = c === 1 ? r.n1 : r.n2;
      if (!nm) continue;
      const v = r.id + ":" + c;
      h += '<option value="' + v + '"' + (v === selectedValue ? " selected" : "") + ">" + esc(nm) + " · كاش " + c + "</option>";
    }
  }
  return h;
}

function openAssignDialog(a, lineN) {
  assignEditing = a ? { a: a } : { lineN: lineN };
  assignTitle.textContent = a ? "تعديل الخطة · خط " + a.lineN : "تخصيص خط " + lineN;
  laHolder.innerHTML = holderOptionsHtml(a ? a.holderId + ":" + a.holderCol : "");
  laTarget.value = a ? a.target : lineDefaults.target;
  laDays.value = a ? a.days : lineDefaults.days;
  laMode.value = a ? a.mode : "carry";
  laEnd.hidden = !a;
  assignDialog.showModal();
}

document.getElementById("la-cancel").addEventListener("click", () => assignDialog.close());

laEnd.addEventListener("click", async () => {
  if (!assignEditing || !assignEditing.a) return;
  const a = assignEditing.a;
  if (!confirm("تقفل خطة الخط " + a.lineN + " دلوقتي؟ التحصيلات هتفضل محفوظة.")) return;
  const old = a.status;
  a.status = "closed";
  try {
    await putStore("assigns", a);
  } catch (e) {
    a.status = old;
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  assignDialog.close();
  renderLines();
});

assignForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!assignEditing) return;
  const target = Number(laTarget.value);
  const days = Math.floor(Number(laDays.value));
  const [hid, hcol] = laHolder.value.split(":").map(Number);
  if (!hid || !(target > 0) || !(days >= 1)) {
    alert("اختار الحامل واكتب المستهدف وعدد الأيام صح.");
    return;
  }
  const row = cashRows.find(r => r.id === hid);
  const label = row ? ((hcol === 2 ? row.n2 : row.n1) + " · كاش " + hcol) : "";
  if (assignEditing.a) {
    const a = assignEditing.a;
    const backup = JSON.stringify(a);
    if (a.holderId !== hid || a.holderCol !== hcol) {
      a.history = a.history || [];
      a.history.push({ ts: Date.now(), from: a.holderLabel, to: label });
    }
    a.holderId = hid; a.holderCol = hcol; a.holderLabel = label;
    a.target = target; a.days = days; a.mode = laMode.value;
    refreshStatus(a);
    try {
      await putStore("assigns", a);
    } catch (err) {
      Object.assign(a, JSON.parse(backup));
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  } else {
    const n = assignEditing.lineN;
    if (activeAssign(n)) {
      alert("الخط ده متخصص بالفعل.");
      return;
    }
    const day = currentDay();
    const a = {
      lineN: n, holderId: hid, holderCol: hcol, holderLabel: label, target: target, days: days,
      mode: laMode.value, startDay: day.id, startDate: day.date, status: "active", entries: [], history: []
    };
    assigns.push(a);
    try {
      await putStore("assigns", a);
    } catch (err) {
      assigns.pop();
      alert("لم يتم الحفظ! حاول مرة أخرى.");
    }
  }
  assignDialog.close();
  renderLines();
});

function refreshStatus(a) {
  if (a.status === "closed") return;
  a.status = sumAmounts(a.entries || []) >= a.target ? "done" : "active";
}

// ----- نافذة التحصيل -----
const entryDialog = document.getElementById("entry-dialog");
const entryForm = document.getElementById("entry-form");
const entryTitle = document.getElementById("entry-title");
const leAmount = document.getElementById("le-amount");
const leNote = document.getElementById("le-note");
const leDelete = document.getElementById("le-delete");
let entryEditing = null;

function openEntryDialog(a, idx) {
  entryEditing = { a: a, idx: idx };
  const e = idx >= 0 ? a.entries[idx] : null;
  entryTitle.textContent = e ? "تعديل تحصيل · خط " + a.lineN : "تحصيل جديد · خط " + a.lineN;
  leAmount.value = e ? e.amount : "";
  leNote.value = e ? (e.note || "") : "";
  leDelete.hidden = !e;
  entryDialog.showModal();
  leAmount.focus();
}

async function saveAssign(a, undo) {
  try {
    await putStore("assigns", a);
  } catch (e) {
    undo();
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
}

async function addLineEntry(a, amount, note) {
  const snapshot = JSON.stringify(a);
  a.entries.push({ day: currentDay().id, amount: amount, ts: Date.now(), note: note || "" });
  refreshStatus(a);
  await saveAssign(a, () => Object.assign(a, JSON.parse(snapshot)));
}

document.getElementById("le-cancel").addEventListener("click", () => entryDialog.close());

leDelete.addEventListener("click", async () => {
  if (!entryEditing || entryEditing.idx < 0) return;
  if (!confirm("تحذف التحصيل ده؟")) return;
  const a = entryEditing.a;
  const snapshot = JSON.stringify(a);
  a.entries.splice(entryEditing.idx, 1);
  refreshStatus(a);
  await saveAssign(a, () => Object.assign(a, JSON.parse(snapshot)));
  entryDialog.close();
  renderLines();
});

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!entryEditing) return;
  const amount = Number(leAmount.value);
  if (leAmount.value.trim() === "" || !Number.isFinite(amount) || amount === 0) {
    alert("اكتب مبلغ صحيح (ممكن يبقى بالسالب للتصحيح).");
    return;
  }
  const a = entryEditing.a;
  const note = leNote.value.trim();
  if (entryEditing.idx >= 0) {
    const snapshot = JSON.stringify(a);
    a.entries[entryEditing.idx].amount = amount;
    a.entries[entryEditing.idx].note = note;
    refreshStatus(a);
    await saveAssign(a, () => Object.assign(a, JSON.parse(snapshot)));
  } else {
    await addLineEntry(a, amount, note);
  }
  entryDialog.close();
  renderLines();
});

// ----- إضافة / تعديل خط -----
const lineDialog = document.getElementById("line-dialog");
const lineForm = document.getElementById("line-form");
const lmN = document.getElementById("lm-n");
const lmName = document.getElementById("lm-name");
const lmPhone = document.getElementById("lm-phone");
let lineEditing = null;

function openLineEdit(n) {
  const l = n !== null ? lineByN(n) : null;
  lineEditing = l;
  document.getElementById("line-dlg-title").textContent = l ? "تعديل خط " + l.n : "خط جديد";
  lmN.value = l ? l.n : (lines.reduce((m, x) => Math.max(m, x.n), 0) + 1);
  lmN.readOnly = !!l;
  lmName.value = l ? l.name : "";
  lmPhone.value = l ? l.phone : "";
  lineDialog.showModal();
  lmName.focus();
}

document.getElementById("line-add-btn").addEventListener("click", () => openLineEdit(null));
document.getElementById("lm-cancel").addEventListener("click", () => lineDialog.close());

lineForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const n = Math.floor(Number(lmN.value));
  const name = lmName.value.trim();
  const phone = toLatinDigits(lmPhone.value.trim());
  if (!(n >= 1) || !name) {
    alert("اكتب رقم الخط والاسم.");
    return;
  }
  if (!lineEditing && lineByN(n)) {
    alert("رقم الخط ده موجود بالفعل.");
    return;
  }
  const rec = { n: n, name: name, phone: phone };
  const old = lineEditing ? Object.assign({}, lineEditing) : null;
  if (lineEditing) Object.assign(lineEditing, rec);
  else { lines.push(rec); lines.sort((a, b) => a.n - b.n); }
  try {
    await putStore("lines", rec);
  } catch (err) {
    if (lineEditing) Object.assign(lineEditing, old);
    else lines.splice(lines.indexOf(rec), 1);
    alert("لم يتم الحفظ! حاول مرة أخرى.");
  }
  lineDialog.close();
  selectedLine = n;
  renderLines();
});

// ----- استيراد الخطوط من ملف -----
const lineImportBtn = document.getElementById("line-import-btn");
const lineImportFile = document.getElementById("line-import-file");

function putMany(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    for (const it of items) store.put(it);
    tx.oncomplete = () => { resolve(); markChanged(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

lineImportBtn.addEventListener("click", () => lineImportFile.click());

lineImportFile.addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    restoring = true;
    try {
      let arr = JSON.parse(event.target.result);
      if (!Array.isArray(arr) && arr && Array.isArray(arr.lines)) arr = arr.lines;
      if (!Array.isArray(arr)) throw new Error("bad");
      const clean = [];
      for (const x of arr) {
        const n = Math.floor(Number(x.n));
        if (!(n >= 1) || !x.name) continue;
        clean.push({ n: n, name: String(x.name), phone: toLatinDigits(String(x.phone || "")) });
      }
      if (!clean.length) throw new Error("empty");
      await putMany("lines", clean);
      let added = 0, updated = 0;
      for (const c of clean) {
        const ex = lineByN(c.n);
        if (ex) { Object.assign(ex, c); updated++; } else { lines.push(c); added++; }
      }
      lines.sort((a, b) => a.n - b.n);
      alert("تم استيراد الخطوط: جديد " + added + "، متحدّث " + updated + ".");
      renderLines();
    } catch (err) {
      alert("الملف ده مش ملف خطوط صالح.");
    } finally {
      restoring = false;
      lineImportFile.value = "";
    }
  };
  reader.readAsText(file);
});

linesBody.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const n = Number(b.dataset.n);
  const a = b.dataset.aid ? assigns.find(x => x.id === Number(b.dataset.aid)) : null;
  if (act === "open-line") { selectedLine = n; renderLines(); }
  else if (act === "line-close") { selectedLine = null; lineSearch.value = ""; renderLines(); }
  else if (act === "line-edit") openLineEdit(n);
  else if (act === "assign") openAssignDialog(null, n);
  else if (act === "plan-edit" && a) openAssignDialog(a);
  else if (act === "entry-add" && a) openEntryDialog(a, -1);
  else if (act === "entry-edit" && a) openEntryDialog(a, Number(b.dataset.i));
});

// ----- الصوت للخطوط -----
function parseLineCommand(text, startsOnly) {
  const clean = toLatinDigits(text);
  const tokens = clean.split(/\s+/).filter(Boolean).map(t => ({ orig: t, n: normAr(t) }));
  const i = tokens.findIndex((t, idx) => (t.n === "خط" || t.n === "الخط") && idx + 1 < tokens.length && /^\d+$/.test(tokens[idx + 1].n));
  if (i === -1) return null;
  if (startsOnly && i !== 0) return null;
  const n = Number(tokens[i + 1].n);
  const rest = tokens.filter((t, idx) => idx !== i && idx !== i + 1).map(t => t.orig).join(" ");
  return { n: n, amount: rest ? parseVoice(rest).amount : 0 };
}

async function runLineCommand(cmd, heard) {
  const head = "سمعتك بتقول: " + heard + "\n\n";
  showView("lines");
  lineSearch.value = String(cmd.n);
  selectedLine = null;
  const l = lineByN(cmd.n);
  renderLines();
  if (!l) {
    alert(head + "مفيش خط برقم " + cmd.n + ".");
    return;
  }
  if (!(cmd.amount > 0)) return;
  const a = activeAssign(cmd.n);
  if (!a) {
    alert(head + "الخط " + cmd.n + " مش متخصص على حامل. خصّصه الأول.");
    return;
  }
  if (!confirm(head + "تسجّل تحصيل " + money(cmd.amount) + " على خط " + cmd.n + " (" + holderLabel(a) + ")؟")) return;
  await addLineEntry(a, cmd.amount, "");
  renderLines();
}
// ===== نهاية الخطوط =====

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

    const lineCmd = parseLineCommand(text, currentView !== "lines");
    if (lineCmd) {
      runLineCommand(lineCmd, text);
      return;
    }

    if (currentView === "daily") {
      const dv = parseDailyVoice(text);
      if (dv.amount > 0) {
        runDailyVoice(dv, text);
        return;
      }
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
    dailyRule = await loadSetting("dailyRule", dailyRule);
    lineDefaults = await loadSetting("lineDefaults", lineDefaults);
    dailyDays = (await loadAllFrom("daily")).sort((a, b) => a.id - b.id);
    lines = (await loadAllFrom("lines")).sort((a, b) => a.n - b.n);
    assigns = await loadAllFrom("assigns");
    await ensureDay();
    dailyViewId = currentDay() ? currentDay().id : null;
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
    cash: cashRows.map(r => ({ name: r.n1, n1: r.n1, n2: r.n2, c1: r.c1, c2: r.c2, order: r.order })),
    closing: { treasury: closing.treasury, balance: closing.balance },
    daily: dailyDays,
    lines: lines,
    assigns: assigns,
    dailyRule: { min: dailyRule.min, unit: dailyRule.unit, first: dailyRule.first, step: dailyRule.step },
    lineDefaults: { target: lineDefaults.target, days: lineDefaults.days }
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
