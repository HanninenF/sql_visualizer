'use strict';

// ─── Sample data ─────────────────────────────────────────────────────────────
// A few made-up rows per table, so a foreign key becomes something concrete:
// OwnerId = 3 is the owner in row 3. Values are guessed from the column name
// (name, email, city, price, …) in English or Swedish, else from the type.
// Every value is seeded by table, column and row, so the data stays put while you type.
// Foreign keys only use values that exist in the table they point to.

const SAMPLE_ROWS = 5;

// Seeded randomness: the same key always gives the same number in [0, 1)
function rand(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const pick = (list, key) => list[Math.floor(rand(key) * list.length)];
// The i-th item of a seeded shuffle: different rows get different items while the list lasts
const nth = (list, key, i) => [...list].map((v, j) => [rand(key + j), v]).sort((a, b) => a[0] - b[0])[i % list.length][1];
const between = (lo, hi, key) => lo + Math.floor(rand(key) * (hi - lo + 1));
const digits = (n, key) => Array.from({ length: n }, (_, i) => between(0, 9, key + i)).join('');
const pad2 = n => String(n).padStart(2, '0');

// Word lists: [English, Swedish]
const W = {
  first: [['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Sophia', 'Oliver', 'Isla', 'Jack'],
    ['Alice', 'Elsa', 'Maja', 'Astrid', 'Wilma', 'Oscar', 'William', 'Hugo', 'Elias', 'Saga', 'Nils', 'Ebba']],
  last: [['Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Clark', 'Walker', 'Hall'],
    ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Lindberg']],
  city: [['London', 'Manchester', 'Leeds', 'Bristol', 'York', 'Oxford', 'Cambridge'],
    ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Umeå', 'Lund', 'Västerås', 'Örebro']],
  street: [['Main Street', 'High Street', 'Park Road', 'Church Lane', 'Mill Road', 'Station Road'],
    ['Storgatan', 'Kungsgatan', 'Drottninggatan', 'Skolgatan', 'Kyrkvägen', 'Parkvägen']],
  country: [['Sweden', 'Norway', 'Denmark', 'Finland', 'Germany', 'France'],
    ['Sverige', 'Norge', 'Danmark', 'Finland', 'Tyskland', 'Frankrike']],
  color: [['red', 'blue', 'green', 'black', 'white', 'yellow'], ['röd', 'blå', 'grön', 'svart', 'vit', 'gul']],
  gender: [['female', 'male', 'other'], ['kvinna', 'man', 'annan']],
  job: [['Developer', 'Teacher', 'Manager', 'Designer', 'Analyst', 'Nurse'],
    ['Utvecklare', 'Lärare', 'Chef', 'Designer', 'Analytiker', 'Sjuksköterska']],
  book: [['The Silent Sea', 'Winter Light', 'Night Train', 'The Last Garden', 'Paper Moon', 'Salt and Stone'],
    ['Tyst hav', 'Vinterljus', 'Nattåg', 'Den sista trädgården', 'Pappersmånen', 'Salt och sten']],
  text: [['Works well.', 'Needs a follow-up.', 'Ordered online.', 'Very popular.', 'Bought as a gift.', 'Check again next week.'],
    ['Fungerar bra.', 'Behöver följas upp.', 'Beställd på nätet.', 'Mycket populär.', 'Köpt som present.', 'Kolla igen nästa vecka.']],
  postcode: [['SW1A 1AA', 'M1 1AE', 'LS1 4AP', 'BS1 5TR', 'OX1 2JD'], null],
};

// Names for things, chosen by what the table (or the column's prefix) is about
const THINGS = [
  [/course|subject|kurs|ämne|amne/, ['Mathematics', 'History', 'Biology', 'Chemistry', 'English', 'Physics', 'Art', 'Music'],
    ['Matematik', 'Historia', 'Biologi', 'Kemi', 'Svenska', 'Fysik', 'Bild', 'Musik']],
  [/categor|genre|kategori/, ['Clothes', 'Shoes', 'Accessories', 'Sports', 'Outdoor'],
    ['Kläder', 'Skor', 'Accessoarer', 'Sport', 'Friluft']],
  [/status|state|tillstånd/, ['New', 'Pending', 'Shipped', 'Delivered', 'Cancelled'],
    ['Ny', 'Väntar', 'Skickad', 'Levererad', 'Avbruten']],
  [/breed|race|ras$/, ['Labrador', 'Beagle', 'Poodle', 'Border Collie', 'Dachshund', 'Boxer'],
    ['Labrador', 'Beagle', 'Pudel', 'Border collie', 'Tax', 'Boxer']],
  [/dog|^pets?$|^cats?$|animal|hund|katt|djur/, ['Bella', 'Max', 'Luna', 'Charlie', 'Molly', 'Rocky'],
    ['Sixten', 'Ludde', 'Bamse', 'Molly', 'Stella', 'Doris']],
  [/product|item|article|artikel|vara|varor|produkt|plagg/, ['T-shirt', 'Jeans', 'Hoodie', 'Sneakers', 'Jacket', 'Scarf', 'Cap'],
    ['T-shirt', 'Jeans', 'Luvtröja', 'Sneakers', 'Jacka', 'Halsduk', 'Keps']],
  [/compan|supplier|brand|företag|foretag|leverantör|leverantor|märke|marke/, ['Acme Ltd', 'Northwind', 'Contoso', 'Globex', 'Initech'],
    ['Nordbolaget AB', 'Svea Handel AB', 'Fjällbo AB', 'Kustfrakt AB', 'Solberg & Co']],
  [/department|dept|avdelning/, ['Sales', 'IT', 'Finance', 'HR', 'Marketing'], ['Försäljning', 'IT', 'Ekonomi', 'HR', 'Marknad']],
  [/school|skola/, ['Northside School', 'Riverside Academy', 'Hill Park School', 'Oak Grove School'],
    ['Norrskolan', 'Ekbackeskolan', 'Sjöviksskolan', 'Tallåsskolan']],
  [/project|projekt/, ['Website', 'Mobile app', 'Data warehouse', 'Intranet', 'CRM upgrade'],
    ['Webbplats', 'Mobilapp', 'Datalager', 'Intranät', 'Nytt CRM']],
  [/building|property|house|fastighet|byggnad|hus/, ['Oak House', 'Elm Court', 'Birch Hall', 'Pine Lodge', 'Ash Row'],
    ['Eken', 'Björken', 'Tallen', 'Linden', 'Aspen']],
  [/team|club|group|klubb|grupp|lag$/, ['Tigers', 'Eagles', 'Wolves', 'Sharks', 'Bears'],
    ['Tigrarna', 'Örnarna', 'Vargarna', 'Hajarna', 'Björnarna']],
  [/event|show|competition|utställning|utstallning|tävling|tavling/, ['Spring Show', 'Summer Cup', 'Autumn Fair', 'Winter Open'],
    ['Vårutställningen', 'Sommarcupen', 'Höstmässan', 'Vinterträffen']],
  [/city|town|stad|ort$/, W.city[0], W.city[1]],
  [/country|land$/, W.country[0], W.country[1]],
];
const PERSON = /student|pupil|teacher|owner|customer|client|employee|person|user|member|author|tenn?ant|janitor|caretaker|vaktmästare|patient|guest|staff|manager|contact|driver|player|judge|landlord|actor|elev|lärare|larare|ägare|agare|kund|anställd|anstalld|användare|anvandare|medlem|författare|forfattare|hyresgäst|hyresgast|gäst|gast|personal|chef|kontakt|förare|forare|spelare|domare|hyresvärd|hyresvard|mentor|coach|tränare|tranare/;
const SWEDISH = /[åäö]|namn|adress|stad|pris|datum|telefon|epost|född|fodd|elev|lärare|larare|kurs|kund|ägare|agare|hund|betyg|antal|beskrivning|avdelning|lön|postnummer|titel|färg|farg|storlek|vara|hyra|projekt|anställd|anstalld|utställning|lägenhet|lagenhet|klädaffär|företag/;

const low = s => s.toLowerCase();
const plain = s => low(s).replace(/[_\s-]/g, '');
const ascii = s => low(s).replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/[^a-z0-9]/g, '');

// What kind of column is this? First by name, then null (the type decides)
function columnKind(c) {
  const rules = [
    ['email', /e?mail|epost/], ['first', /^(first|fore|given)name|^fname|förnamn|fornamn/],
    ['last', /(last|sur|family)name|^lname|efternamn/], ['user', /username|login|användarnamn|anvandarnamn/],
    ['password', /password|lösenord|losenord|hash/], ['ssn', /^ssn$|person(al)?(nummer|nr|number)|^pnr$/],
    ['phone', /phone|telefon|mobile|mobil|^tel$|cell/], ['postcode', /zip|postal|postcode|postnr|postnummer/],
    ['address', /address|adress|street|gata/], ['city', /^(city|town|stad|ort|postort|hemstad|hometown)$/], ['country', /country$|^land$/],
    ['url', /url|website|webb|hemsida|homepage/], ['title', /title|titel|rubrik/],
    ['birth', /born|birth|dob|född|fodd/], ['year', /year|^år$|årtal|artal/],
    ['end', /^(end|slut|finish)|deadline|(end|slut)(date|datum)$/], ['date', /date|datum|created|updated|when|^start/],
    ['age', /^age$|ålder|alder/], ['credits', /credit|^hp$|högskolepoäng/],
    ['salary', /salary|lön$|^lon$|wage/], ['rent', /^(monthly)?rent|hyra/],
    ['money', /price|pris|cost|kostnad|amount|belopp|avgift|total|summa|balance|saldo/],
    ['qty', /quantity|qty|antal|count|stock|lager|^nr|^num/], ['grade', /grade|betyg/], ['score', /score|points|poäng|poang/],
    ['gender', /gender|kön|^kon$|^sex$/], ['color', /colou?r|färg|farg/], ['size', /size|storlek/],
    ['weight', /weight|vikt/], ['height', /height|längd|langd/], ['room', /room|^rum$|^sal$|classroom/],
    ['code', /code|kod|sku|isbn/], ['text', /description|beskrivning|comment|kommentar|note|anteckning|^text$|info|bio|content|innehåll|reason|orsak/],
    ['bool', /^(is|has|can)[A-ZÅÄÖ_]|^(active|aktiv|done|klar)$/],
    ['name', /name$|namn$/],
  ];
  for (const [k, re] of rules) if (re.test(k === 'bool' ? c.name : plain(c.name))) return k;
  return null;
}

function typeInfo(c) {
  const t = c.effType, base = t.split(/[ (]/)[0];
  const len = +(t.match(/^(?:vc|char|varchar)\((\d+)\)/)?.[1] ?? (base === 'vc' ? DEFAULT_VC : base === 'char' ? 1 : 0));
  return {
    base,
    len,
    int: INT_TYPES.has(base) || base === 'year',
    bool: base === 'bool' || base === 'boolean' || /^tinyint\(1\)/.test(t) || base === 'bit',
    dec: /^(decimal|dec|numeric|fixed|float|double|real)$/.test(base),
    options: base === 'enum' || base === 'set' ? [...t.matchAll(/'((?:[^']|'')*)'/g)].map(m => m[1].replace(/''/g, "'")) : null,
  };
}
// Is a column's value written without quotes in SQL?
const isNumeric = c => { const ti = typeInfo(c); return ti.int || ti.bool || ti.dec; };

const dateStr = (y0, y1, key) => `${between(y0, y1, key + 'y')}-${pad2(between(1, 12, key + 'm'))}-${pad2(between(1, 28, key + 'd'))}`;
const timeStr = key => `${pad2(between(8, 17, key + 'h'))}:${pad2(between(0, 3, key + 'n') * 15)}:00`;

// One value (a string, or null) for column c of table t in row i
function sampleValue(t, c, i, sv, person) {
  const key = `${t.name}.${c.name}.${i}`, L = sv ? 1 : 0, ti = typeInfo(c);
  const kind = columnKind(c);
  const int = (lo, hi) => String(between(lo, hi, key));
  // money: whole numbers for an int column, else two decimals (also in a varchar, the default type)
  const money = (lo, hi) => ti.int ? String(between(lo, hi, key)) : (between(lo * 100, hi * 100, key) / 100).toFixed(2);
  if (ti.options) return ti.options.length ? pick(ti.options, key) : '';
  if (ti.bool || kind === 'bool') return String(between(0, 1, key));
  if (/^(date|datetime|timestamp|time)$/.test(ti.base)) {
    const d = kind === 'birth' ? dateStr(1960, 2008, key) : kind === 'end' ? dateStr(2024, 2025, key) : dateStr(2022, 2023, key);
    return ti.base === 'date' ? d : ti.base === 'time' ? timeStr(key) : `${d} ${timeStr(key)}`;
  }
  switch (kind) {
    case 'email': return `${ascii(person.first)}.${ascii(person.last)}@example.com`;
    case 'first': return person.first;
    case 'last': return person.last;
    case 'user': return ascii(person.first) + between(1, 99, key);
    case 'password': return Array.from({ length: 16 }, (_, j) => '0123456789abcdef'[between(0, 15, key + j)]).join('');
    case 'ssn': return `${dateStr(1960, 2008, key).replace(/-/g, '')}-${digits(4, key)}`;
    case 'phone': return sv ? `07${between(0, 9, key)}-${digits(3, key + 'a')} ${digits(2, key + 'b')} ${digits(2, key + 'c')}` : `07${digits(3, key)} ${digits(6, key + 'a')}`;
    case 'postcode': return sv ? `${between(100, 989, key)} ${digits(2, key)}` : pick(W.postcode[0], key);
    case 'address': return sv ? `${pick(W.street[1], key)} ${between(1, 80, key + 'n')}` : `${between(1, 80, key + 'n')} ${pick(W.street[0], key)}`;
    case 'city': return pick(W.city[L], key);
    case 'country': return pick(W.country[L], key);
    case 'url': return `https://example.com/${ascii(t.name)}/${i + 1}`;
    case 'title': return nth(PERSON.test(low(t.name)) ? W.job[L] : W.book[L], `${t.name}.${c.name}`, i);
    case 'color': return pick(W.color[L], key);
    case 'gender': return pick(W.gender[L], key);
    case 'text': return pick(W.text[L], key);
    case 'size': return pick(['XS', 'S', 'M', 'L', 'XL'], key);
    case 'room': return ti.int ? int(101, 320) : pick('ABC', key + 'r') + between(101, 320, key);
    case 'code': return ti.int ? int(1000, 9999) : pick('ABCDEFGH', key + 'a') + pick('KLMNPRST', key + 'b') + digits(4, key);
    case 'birth': return ti.int ? int(1960, 2008) : dateStr(1960, 2008, key);
    case 'date': return ti.int ? int(2022, 2023) : dateStr(2022, 2023, key);
    case 'end': return ti.int ? int(2024, 2025) : dateStr(2024, 2025, key);
    case 'year': return int(1995, 2025);
    case 'age': return PERSON.test(low(t.name)) ? int(18, 80) : int(1, 15);
    case 'credits': return pick(['5', '10', '15', '30'], key);
    case 'salary': return money(25000, 60000);
    case 'rent': return money(5000, 15000);
    case 'money': return money(5, 2000);
    case 'qty': return int(1, 20);
    case 'grade': return ti.int || ti.dec ? int(1, 5) : pick(['A', 'B', 'C', 'D', 'E', 'F'], key);
    case 'score': return int(0, 100);
    case 'weight': return ti.int ? int(2, 40) : (between(20, 400, key) / 10).toFixed(1);
    case 'height': return int(150, 195);
  }
  if (ti.int) return int(1, 100);
  if (ti.dec) return (between(100, 99999, key) / 100).toFixed(2);
  let s;
  switch (kind) {
    case 'name': {
      const prefix = low(c.name).replace(/_?(name|namn)$/, '');
      const about = prefix || low(t.name);
      const thing = THINGS.find(([re]) => re.test(about));
      if (thing) s = nth(thing[1 + L], `${t.name}.${c.name}`, i);
      else if (PERSON.test(about)) s = `${person.first} ${person.last}`;
      else s = `${t.name} ${i + 1}`;
      break;
    }
    default:
      s = `${c.name} ${i + 1}`;
  }
  return ti.len ? s.slice(0, ti.len) : s;
}

// Sample rows for every table: Map table → [{ values: Map column → string | null }]
const sampleCache = new WeakMap();
function sampleData(tables) {
  if (sampleCache.has(tables)) return sampleCache.get(tables);
  const data = new Map();
  // 1. Every column that isn't a foreign key, row by row. Numeric primary keys count 1, 2, 3…
  for (const t of tables) {
    const sv = SWEDISH.test(low(t.name + ' ' + t.cols.map(c => c.name).join(' ')));
    const rows = [];
    for (let i = 0; i < SAMPLE_ROWS; i++) {
      const person = { first: nth(W.first[sv ? 1 : 0], t.name + '#f', i), last: nth(W.last[sv ? 1 : 0], t.name + '#l', i) };
      const values = new Map();
      for (const c of t.cols) {
        if (c.target) continue;
        values.set(c, c.isPk && t.pkCols.length === 1 && typeInfo(c).int ? String(i + 1) : sampleValue(t, c, i, sv, person));
      }
      rows.push({ values });
    }
    // unique columns (and a single-column key): a repeated value gets the row number added
    for (const c of t.cols) {
      if (c.target || !(c.unique || (c.isPk && t.pkCols.length === 1))) continue;
      const seen = new Set();
      rows.forEach((r, i) => {
        let v = r.values.get(c);
        if (v != null && seen.has(v)) r.values.set(c, v = typeInfo(c).int ? String(1000 + i) : `${v} ${i + 1}`);
        seen.add(v);
      });
    }
    data.set(t, rows);
  }
  // 2. Foreign keys: values that exist in the column they point to. A table is finished
  // (including rows dropped as duplicates) before the tables pointing to it use its values.
  const done = new Set(), busy = new Set();
  const finish = t => {
    if (done.has(t) || busy.has(t)) return;
    busy.add(t);
    for (const c of t.cols) if (c.target && c.target !== t) finish(c.target);
    const rows = data.get(t), multiPk = t.pkCols.length > 1, keys = new Set();
    const kept = [];
    rows.forEach((r, i) => {
      for (let attempt = 0; attempt < 12; attempt++) {
        for (const c of t.cols) {
          if (!c.target) continue;
          const key = `${t.name}.${c.name}.${i}.${attempt}`;
          let pool = data.get(c.target).map(o => o.values.get(c.targetCol)).filter(v => v != null);
          if (c.target === t) pool = pool.filter(v => v !== r.values.get(c.targetCol)); // not itself
          if (c.unique) pool = pool.filter(v => !kept.some(o => o.values.get(c) === v));
          const none = !pool.length || (c.nullable && rand(key + 'null') < 0.2);
          r.values.set(c, none ? null : pick(pool, key));
        }
        const k = t.pkCols.map(c => r.values.get(c)).join('\u0000');
        const bad = t.cols.some(c => c.target && !c.nullable && r.values.get(c) == null);
        if (!bad && (!multiPk || !keys.has(k))) { keys.add(k); kept.push(r); break; }
      }
    });
    data.set(t, kept);
    busy.delete(t);
    done.add(t);
  };
  tables.forEach(finish);
  sampleCache.set(tables, data);
  return data;
}

// INSERT statements for the sample rows (appended to the MariaDB script)
function sampleInserts(tables) {
  const data = sampleData(tables);
  const lit = (c, v) => v == null ? 'NULL' : isNumeric(c) ? v : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  const out = ['-- Sample data (made up)', 'SET FOREIGN_KEY_CHECKS = 0;'];
  for (const t of topoOrder(tables.filter(t => t.cols.length)).order) {
    const rows = data.get(t);
    if (!rows.length) continue;
    out.push(`INSERT INTO ${q(t.name)} (${t.cols.map(c => q(c.name)).join(', ')}) VALUES`);
    out.push(rows.map(r => `  (${t.cols.map(c => lit(c, r.values.get(c))).join(', ')})`).join(',\n') + ';');
  }
  out.push('SET FOREIGN_KEY_CHECKS = 1;', '');
  return out.join('\n');
}

// ─── Sample data grids ───────────────────────────────────────────────────────
// With "Sample data" on, clicking a table opens a small grid of its rows next to the box.
// The grids live in an HTML layer over the canvas that pans and zooms with it.
// Clicking a value highlights where it leads: a foreign key → the row it points to
// (opening that table's grid), a key → the rows that point to it.

let sampleOn = false;
const openGrids = new Set();    // table names
const gridAt = new Map();       // table name → { x, y } of its grid, relative to the table's box
let sampleHl = null;            // { table, col, value, from: cell key }
const gridLayer = $('#gridLayer'), gridWorld = $('#gridWorld');

function placeGrids() {
  gridWorld.style.transform = `translate(${view.tx}px,${view.ty}px) scale(${view.s})`;
}

function renderGrids() {
  if (!sampleOn || !openGrids.size) { gridWorld.innerHTML = ''; return; }
  const data = sampleData(model.tables);
  const byName = new Map(model.tables.map(t => [t.name, t]));
  let s = '';
  for (const name of openGrids) {
    const t = byName.get(name), b = t && geometry.boxes.get(t);
    if (!b) continue;
    const at = gridAt.get(name) ?? { x: b.w + 16, y: 0 };
    const cols = shownCols(t), rows = data.get(t) ?? [];
    const hlTable = sampleHl && byName.get(sampleHl.table);
    s += `<div class="sgrid" data-t="${esc(name)}" style="left:${b.x + at.x}px;top:${b.y + at.y}px">`;
    s += `<div class="sg-head"><span>${esc(name)}</span><button class="sg-x" title="Close" aria-label="Close ${esc(name)}">×</button></div>`;
    s += `<table><thead><tr>${cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>`;
    if (!rows.length) s += `<tr><td colspan="${cols.length || 1}" class="sg-none">No rows</td></tr>`;
    rows.forEach((r, i) => {
      // the row a highlighted key points to
      const hit = hlTable === t && r.values.get(t.cols.find(c => c.name === sampleHl.col)) === sampleHl.value;
      s += `<tr${hit ? ' class="hl"' : ''}>`;
      for (const c of cols) {
        const v = r.values.get(c), cellKey = `${name}.${c.name}.${i}`;
        // a foreign key cell that points to the highlighted value
        const points = sampleHl && c.target === hlTable && c.targetCol.name === sampleHl.col && v === sampleHl.value;
        const cls = [c.isPk && 'pk', c.target && 'fk', v == null && 'null', (points || cellKey === sampleHl?.from) && 'hl'].filter(Boolean).join(' ');
        s += `<td class="${cls}" data-c="${esc(c.name)}" data-i="${i}" title="${esc(v ?? 'NULL')}">${esc(v ?? 'NULL')}</td>`;
      }
      s += '</tr>';
    });
    s += '</tbody></table></div>';
  }
  gridWorld.innerHTML = s;
  placeNewGrids();
  placeGrids();
}

// A newly opened grid goes right of, left of, below or above its box: wherever it
// covers the least of the other boxes and grids, preferably on screen. Then the view
// pans, if needed, to show it.
function placeNewGrids() {
  const r = svg.getBoundingClientRect();
  const screen = { x: -view.tx / view.s, y: (CARD_TOP - view.ty) / view.s, w: r.width / view.s, h: (r.height - CARD_TOP - CARD_BOTTOM) / view.s };
  const offScreen = q => q.w * q.h - Math.max(0, Math.min(q.x + q.w, screen.x + screen.w) - Math.max(q.x, screen.x)) *
    Math.max(0, Math.min(q.y + q.h, screen.y + screen.h) - Math.max(q.y, screen.y));
  let shown = null;
  const rects = [...geometry.boxes.values()].map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
  const els = [...gridWorld.querySelectorAll('.sgrid')];
  for (const el of els) if (gridAt.has(el.dataset.t)) rects.push({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: el.offsetWidth, h: el.offsetHeight });
  const overlap = r => rects.reduce((sum, o) =>
    sum + Math.max(0, Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x)) * Math.max(0, Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y)), 0);
  for (const el of els) {
    const name = el.dataset.t;
    if (gridAt.has(name)) continue;
    const b = geometry.boxes.get(model.tables.find(t => t.name === name)), w = el.offsetWidth, h = el.offsetHeight, G = 16;
    const spots = [{ x: b.w + G, y: 0 }, { x: -G - w, y: 0 }, { x: 0, y: b.h + G }, { x: 0, y: -G - h },
      { x: b.w + G, y: b.h - h }, { x: -G - w, y: b.h - h }, { x: b.w - w, y: b.h + G }, { x: b.w - w, y: -G - h }];
    const best = spots.map(p => { const q = { x: b.x + p.x, y: b.y + p.y, w, h }; return { p, cost: overlap(q) * 2 + offScreen(q) }; })
      .reduce((a, c) => c.cost < a.cost ? c : a).p;
    gridAt.set(name, best);
    el.style.left = b.x + best.x + 'px';
    el.style.top = b.y + best.y + 'px';
    rects.push(shown = { x: b.x + best.x, y: b.y + best.y, w, h });
  }
  if (shown && offScreen(shown) > 0) {
    const m = 20 / view.s;
    const dx = shown.x < screen.x ? screen.x - shown.x + m : Math.min(0, screen.x + screen.w - shown.x - shown.w - m);
    const dy = shown.y < screen.y ? screen.y - shown.y + m : Math.min(0, screen.y + screen.h - shown.y - shown.h - m);
    view.tx += dx * view.s;
    view.ty += dy * view.s;
    applyView();
  }
}

function setSampleOn(on) {
  sampleOn = on;
  const b = $('#sampleBtn');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
  if (!on) { openGrids.clear(); gridAt.clear(); sampleHl = null; }
  else toast('Click a table to see its sample rows');
  renderGrids();
}
$('#sampleBtn').onclick = () => setSampleOn(!sampleOn);

// Called by the diagram when a table is clicked (not dragged)
function tableClicked(name) {
  if (!sampleOn || openGrids.has(name)) return;
  openGrids.add(name);
  renderGrids();
}

gridWorld.addEventListener('click', e => {
  const g = e.target.closest('.sgrid');
  if (!g) return;
  if (e.target.closest('.sg-x')) {
    openGrids.delete(g.dataset.t);
    gridAt.delete(g.dataset.t);
    renderGrids();
    return;
  }
  const td = e.target.closest('td[data-c]');
  if (!td) return;
  const t = model.tables.find(o => o.name === g.dataset.t), c = t?.cols.find(o => o.name === td.dataset.c);
  const v = sampleData(model.tables).get(t)?.[+td.dataset.i]?.values.get(c);
  if (!c || v == null) { sampleHl = null; renderGrids(); return; }
  const from = `${t.name}.${c.name}.${td.dataset.i}`;
  if (sampleHl?.from === from) sampleHl = null; // a second click clears it
  else if (c.target) {
    sampleHl = { table: c.target.name, col: c.targetCol.name, value: v, from };
    openGrids.add(c.target.name);
  } else sampleHl = { table: t.name, col: c.name, value: v, from };
  renderGrids();
});

// Drag a grid by its header, e.g. off a box it covers
gridWorld.addEventListener('pointerdown', e => {
  const head = e.target.closest('.sg-head');
  if (!head || e.target.closest('.sg-x') || e.button !== 0) return;
  const name = head.parentNode.dataset.t, start = gridAt.get(name);
  const sx = e.clientX, sy = e.clientY, el = head.parentNode, left = parseFloat(el.style.left), top = parseFloat(el.style.top);
  head.setPointerCapture(e.pointerId);
  const move = ev => {
    const dx = (ev.clientX - sx) / view.s, dy = (ev.clientY - sy) / view.s;
    gridAt.set(name, { x: start.x + dx, y: start.y + dy });
    el.style.left = left + dx + 'px';
    el.style.top = top + dy + 'px';
  };
  const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', up);
});

// Scrolling and pinching over a grid moves the canvas, as everywhere else
gridLayer.addEventListener('wheel', e => {
  e.preventDefault();
  svg.dispatchEvent(new WheelEvent('wheel', e));
}, { passive: false });
