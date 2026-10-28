// Умная проверка ответов ЕГЭ: числа, обыкновенные/десятичные дроби, корни, π, арк-функции,
// серии корней, промежутки, неравенства, несколько значений через «;», пункты а) б) в).
// Верные варианты в поле ответа можно перечислять через «|».

const CONST = { pi: Math.PI, e: Math.E, inf: Infinity }
const FUNCS = {
  arctg: Math.atan, arcctg: x => Math.PI / 2 - Math.atan(x), arcsin: Math.asin, arccos: Math.acos,
  sin: Math.sin, cos: Math.cos, tg: Math.tan, ctg: x => 1 / Math.tan(x), ln: Math.log, sqrt: Math.sqrt,
}
const NAMES = ['arcctg', 'arctg', 'arcsin', 'arccos', 'sqrt', 'sin', 'cos', 'ctg', 'tg', 'log', 'ln', 'pi', 'inf']
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' }

// Приведение записи к единому виду
export function canon(s) {
  let t = String(s ?? '').toLowerCase().replace(/ё/g, 'е')
  t = t.replace(/[−–—]/g, '-')
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, m => '^(' + [...m].map(c => SUP[c]).join('') + ')')
  t = t.replace(/[₀-₉]+/g, m => '_(' + [...m].map(c => SUB[c]).join('') + ')')
  t = t.replace(/√|корень|квадратный корень|кв\.?\s*корень/g, 'sqrt')
  t = t.replace(/π|пи(?![а-я])|\bpi\b/g, 'pi')
  t = t.replace(/arctan|atan|арктангенс|арктг/g, 'arctg').replace(/arccot|arcctan|арккотангенс|арккотг/g, 'arcctg')
  t = t.replace(/арксинус|арксин/g, 'arcsin').replace(/арккосинус|арккос/g, 'arccos')
  t = t.replace(/\btan\b/g, 'tg').replace(/\bcot\b/g, 'ctg').replace(/тангенс|тг/g, 'tg').replace(/котангенс|ктг/g, 'ctg')
  t = t.replace(/∞|бесконечность|беск\.?/g, 'inf').replace(/\binfinity\b/g, 'inf')
  t = t.replace(/≤|=<|⩽/g, '<=').replace(/≥|=>|⩾/g, '>=').replace(/≠/g, '!=')
  t = t.replace(/·|×|⋅/g, '*').replace(/∪|\bили\b|\bu\b/g, '∪').replace(/÷/g, '/')
  t = t.replace(/[∈∊]|\bin\b|принадлежит/g, '∈').replace(/ℤ/g, 'z').replace(/\bцелое\b/g, 'z')
  // «, k∈Z» в конце серии не нужно
  t = t.replace(/(^|[,;\s])[a-zа-я](\s*,\s*[a-zа-я])*\s*∈\s*z\b\.?/g, '$1').replace(/[,;]\s*(?=[,;]|$)/g, '')
  t = t.replace(/°|градусов|градуса|град\.?/g, '').replace(/\+\/-|\+-|-\+/g, '±').replace(/:/g, '/')
  t = t.replace(/\s+/g, '')
  t = t.replace(/(\d),(\d)/g, '$1.$2').replace(/\.$/, '')
  t = t.replace(/\^\(([-\d.]+)\)/g, '^($1)')
  return t
}

// ---------- вычисление выражения ----------
const VAR = c => (/[kjnmlipqt]/.test(c) ? 0.7371 : c === 'a' ? 0.4113 : c === 'r' ? 0.8771 : 0.3 + (c.charCodeAt(0) % 97) / 131)

function tokenize(s) {
  const out = []; let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/[\d.]/.test(c)) { const m = s.slice(i).match(/^\d*\.?\d+(?:e[-+]?\d+)?|^\d+\./); if (!m) throw 0; out.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length; continue }
    if ('+-*/^()_'.includes(c)) { out.push({ t: c }); i++; continue }
    const nm = NAMES.find(n => s.startsWith(n, i))
    if (nm) { out.push({ t: 'id', v: nm }); i += nm.length; continue }
    if (/[a-zа-я]/.test(c)) { out.push({ t: 'v', v: c }); i++; continue }
    throw 0
  }
  return out
}

function evaluate(str) {
  const tk = tokenize(str); let p = 0
  const peek = () => tk[p]
  const startsFactor = x => x && (x.t === 'n' || x.t === '(' || x.t === 'id' || x.t === 'v')
  function expr() {
    let v = term()
    while (peek() && (peek().t === '+' || peek().t === '-')) { const o = tk[p++].t; const r = term(); v = o === '+' ? v + r : v - r }
    return v
  }
  function term() {
    let v = unary()
    for (;;) {
      const x = peek()
      if (x && (x.t === '*' || x.t === '/')) { p++; const r = unary(); v = x.t === '*' ? v * r : v / r }
      else if (startsFactor(x)) { v = v * unary() }   // неявное умножение: 2√3, πk, 5π
      else break
    }
    return v
  }
  function unary() {
    const x = peek()
    if (x && x.t === '-') { p++; return -unary() }
    if (x && x.t === '+') { p++; return unary() }
    return power()
  }
  function power() {
    let b = atom()
    if (peek() && peek().t === '^') { p++; const e = unary(); b = Math.pow(b, e) }
    return b
  }
  function atom() {
    const x = tk[p++]
    if (!x) throw 0
    if (x.t === 'n') return x.v
    if (x.t === '(') { const v = expr(); if (!peek() || peek().t !== ')') throw 0; p++; return v }
    if (x.t === 'v') return VAR(x.v)
    if (x.t === 'id') {
      if (x.v in CONST) return CONST[x.v]
      if (x.v === 'log') {                       // log_(5)2, log_5(2), log5(2), log_(5)^(2)10 = (log_5 10)^2
        let base = 10
        if (peek() && peek().t === '_') {
          p++
          if (peek() && peek().t === '(') { p++; base = tk[p++].v; if (!peek() || peek().t !== ')') throw 0; p++ }
          else if (peek() && peek().t === 'n') base = tk[p++].v
          else throw 0
        } else if (peek() && peek().t === 'n' && tk[p + 1] && tk[p + 1].t === '(') base = tk[p++].v
        let ex = 1
        if (peek() && peek().t === '^') { p++; ex = atom() }
        const a = funcArg(); return Math.pow(Math.log(a) / Math.log(base), ex)
      }
      const f = FUNCS[x.v]; if (!f) throw 0
      return f(funcArg())
    }
    throw 0
  }
  function funcArg() {
    const x = peek()
    if (!x) throw 0
    if (x.t === '(') return atom()
    if (x.t === '-') { p++; return -funcArg() }
    if (x.t === 'n' || x.t === 'v' || x.t === 'id') return atom()
    throw 0
  }
  const v = expr()
  if (p !== tk.length || !isFinite(v) && !(Math.abs(v) === Infinity)) throw 0
  return v
}

const fmt = v => (v === Infinity ? '+inf' : v === -Infinity ? '-inf' : String(+v.toPrecision(8)))
function num(s) { try { return evaluate(s) } catch { return null } }

// Ключ одного значения
function itemKey(s) {
  if (!s) return ''
  // промежутки: [a;b)∪(c;+inf), {x}
  if (/∪|^[[({].*[\])}]$/.test(s) && (/;/.test(s) || /^\{/.test(s))) {
    const pieces = s.split('∪'), keys = []
    for (const pc of pieces) {
      if (/^\{.*\}$/.test(pc)) {
        const ps = pc.slice(1, -1).split(';').map(x => num(x.replace(/^\+/, '')))
        if (ps.some(x => x === null)) return 's:' + s
        keys.push('{' + ps.map(fmt).sort().join(';') + '}'); continue
      }
      const m = pc.match(/^([[(])(.*);(.*)([\])])$/)
      if (!m) return 's:' + s
      const a = num(m[2].replace(/^\+/, '')), b = num(m[3].replace(/^\+/, ''))
      if (a === null || b === null) return 's:' + s
      keys.push(m[1] + fmt(a) + ';' + fmt(b) + m[4])
    }
    return 'i:' + keys.join('∪')
  }
  // неравенства и равенства: a<-1.25, -2/3<a<=-0.4, a=(…)/40
  if (/(<=|>=|<|>|=)/.test(s)) {
    const ops = s.match(/<=|>=|<|>|=/g), parts = s.split(/<=|>=|<|>|=/)
    let vals = parts.map(x => (/^[a-zа-я]$/.test(x) ? 'v:' + x : (num(x) === null ? 's:' + x : fmt(num(x)))))
    // 1<a  →  a>1
    if (ops.length === 1 && !vals[0].startsWith('v:') && vals[1].startsWith('v:')) {
      const flip = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=' }
      return 'r:' + vals[1] + flip[ops[0]] + vals[0]
    }
    return 'r:' + vals.map((x, i) => x + (ops[i] || '')).join('')
  }
  const v = num(s)
  return v === null ? 's:' + s : 'n:' + fmt(v)
}

// разбиение по «;» на верхнем уровне (не внутри скобок)
function topSplit(s) {
  const out = []; let d = 0, cur = ''
  for (const c of s) {
    if ('([{'.includes(c)) d++
    if (')]}'.includes(c)) d--
    if ((c === ';' || c === ',') && d <= 0) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out.filter(Boolean)
}
const expandPm = it => (it.includes('±') ? [it.replace('±', '+'), it.replace('±', '-')] : [it])
const setKey = s => topSplit(s).flatMap(expandPm).map(itemKey).sort().join('|')

// пункты а) б) в)
function labelled(s) {
  const re = /(^|[\s;,.])([абвabc])\)/g, marks = []
  let m
  while ((m = re.exec(s))) marks.push({ lab: m[2].replace('a', 'а').replace('b', 'б').replace('c', 'в'), at: m.index + m[1].length, end: m.index + m[0].length })
  if (!marks.length) return null
  const o = {}
  marks.forEach((k, i) => { o[k.lab] = s.slice(k.end, i + 1 < marks.length ? marks[i + 1].at : s.length).replace(/[;,\s]+$/, '') })
  return o
}
const words = s => (s.match(/да|нет|-?\d+(?:\.\d+)?/g) || [])

function sameOne(userRaw, corrRaw) {
  const cRaw = String(corrRaw ?? ''), uRaw = String(userRaw ?? '')
  const cl = labelled(cRaw.toLowerCase().replace(/ё/g, 'е'))
  if (cl) {
    const ul = labelled(uRaw.toLowerCase().replace(/ё/g, 'е'))
    const simple = Object.values(cl).every(v => /^[\sда нет\d.,-]+$/.test(v))
    if (ul) {
      const ls = Object.keys(cl)
      return ls.every(l => ul[l] !== undefined && setKey(canon(ul[l])) === setKey(canon(cl[l])))
    }
    if (!ul && Object.keys(cl).length === 1) return setKey(canon(uRaw)) === setKey(canon(Object.values(cl)[0]))
    if (simple) {                                  // «да нет 580» без букв пунктов
      const a = words(canon(Object.values(cl).join(' ')).replace(/(\d)\.(\d)/g, '$1.$2'))
      const b = words(canon(uRaw))
      return a.length === b.length && a.every((x, i) => x === b[i])
    }
    return false
  }
  const c = canon(cRaw), u = canon(uRaw)
  if (!u) return false
  if (c === u) return true
  return setKey(c) === setKey(u)
}

export function isCorrectAnswer(user, correct) {
  const u = String(user ?? '').trim()
  if (!u) return false
  try {
    return String(correct ?? '').split('|').map(x => x.trim()).filter(Boolean).some(v => sameOne(u, v))
  } catch { return false }
}
