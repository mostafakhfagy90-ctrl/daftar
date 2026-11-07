let currentBook = "in";
const data = { in: [], out: [] };
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("daftar-db", 2);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("people")) {
        database.createObjectStore("people", { keyPath: "id", autoIncrement: true });
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
  currentBook = name;
  document.body.classList.toggle("out", name === "out");
  tabIn.classList.toggle("active", name === "in");
  tabOut.classList.toggle("active", name === "out");
  render();
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

document.getElementById("btn-export-excel").addEventListener("click", () => {
  const wb = XLSX.utils.book_new();

  for (const bookKey of ["in", "out"]) {
    const book = data[bookKey];
    const title = bookKey === "in" ? "الداخل" : "الخارج";
    
    if (book.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([["الدفتر فارغ"]]);
      XLSX.utils.book_append_sheet(wb, ws, title);
      continue;
    }

    const maxOps = Math.max(1, ...book.map(p => p.ops.length));
    const sheetData = [];
    
    const headers = ["الاسم"];
    for (let i = 0; i < maxOps; i++) headers.push("عملية " + (i + 1));
    headers.push("المجموع");
    sheetData.push(headers);
    
    let bookGrandTotal = 0;
    book.forEach(p => {
      const row = [p.name];
      for (let i = 0; i < maxOps; i++) {
        row.push(p.ops[i] !== undefined ? p.ops[i] : "");
      }
      const personTotal = sum(p.ops);
      row.push(personTotal);
      bookGrandTotal += personTotal;
      sheetData.push(row);
    });

    sheetData.push([]);
    const totalRow = ["الإجمالي الكلي للدفتر"];
    for (let i = 0; i < maxOps; i++) totalRow.push("");
    totalRow.push(bookGrandTotal);
    sheetData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, title);
  }
  
  const fileName = `دفتر_حسابات_${getDateString()}.xlsx`;
  XLSX.writeFile(wb, fileName);
});

document.getElementById("btn-export-pdf").addEventListener("click", () => {
  const element = document.getElementById("pdf-area");
  const opt = {
    margin:       10,
    filename:     `تقرير_دفتر_${currentBook}_${getDateString()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
  };
  html2pdf().from(element).set(opt).save();
});

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
      render();
      alert("تمت استعادة البيانات بنجاح!");
    } catch (err) {
      alert("الملف غير صالح أو حدث خطأ أثناء الاستعادة.");
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
    out: data.out.filter(p => p.ops.length > 0)
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
