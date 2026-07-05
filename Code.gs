/**
 * 寶嚴禪寺zoom會議室預約系統 — 後端 (Google Apps Script Web App)
 * 資料存於 ScriptProperties：config（會議室/固定課程/管理密碼）、bookings_YYYY-MM（每月預約）
 */

var TZ = 'Asia/Taipei';

function props() { return PropertiesService.getScriptProperties(); }

function todayStr() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function defaultConfig() {
  var all = [0, 1, 2, 3, 4, 5, 6];
  return {
    adminPassword: 'baoyan2026',
    rooms: [
      { id: '8896316212', name: '889 631 6212' },
      { id: '2023101199', name: '202 310 1199（觀心一支香）' },
      { id: '4079019912', name: '407 901 9912' },
      { id: '8865224676', name: '886 522 4676' },
      { id: '5224676123', name: '522 467 6123（華嚴經共修）' },
      { id: '8865224678', name: '886 522 4678' }
    ],
    bannedRooms: [
      { id: '5224676123', reason: '不開放申請' }
    ],
    fixedSlots: [
      { id: 'f1', title: '觀心一支香', room: '2023101199', days: all, start: '07:00', end: '07:40' },
      { id: 'f2', title: '晨讀教觀綱宗', room: '2023101199', days: all, start: '07:40', end: '08:20' },
      { id: 'f3', title: '英文課', room: '2023101199', days: [1, 3, 4, 5], start: '20:00', end: '21:00' },
      { id: 'f4', title: '英文禪修', room: '2023101199', days: [3], start: '19:00', end: '20:00' },
      { id: 'f5', title: '瑜伽師地論', room: '2023101199', days: [2], start: '19:30', end: '21:30' },
      { id: 'f6', title: '騰雲華嚴六卷組', room: '5224676123', days: all, start: '06:20', end: '08:30' },
      { id: 'f7', title: '童童華嚴', room: '5224676123', days: [1, 3, 4, 5], start: '20:30', end: '21:00' },
      { id: 'f8', title: '華嚴經三卷（早）', room: '8835224601', days: all, start: '05:00', end: '06:30' },
      { id: 'f9', title: '華嚴經三卷（午前）', room: '8835224601', days: all, start: '07:00', end: '08:30' },
      { id: 'f10', title: '華嚴經三卷（下午）', room: '8835224601', days: all, start: '16:30', end: '18:00' },
      { id: 'f11', title: '華嚴經三卷（晚）', room: '8835224601', days: all, start: '20:00', end: '21:30' },
      { id: 'f12', title: '常住會議', room: '3215224676', days: [5], start: '08:00', end: '12:00' }
    ],
    nextFixedId: 13
  };
}

function getConfig() {
  var raw = props().getProperty('config');
  if (raw) return JSON.parse(raw);
  var def = defaultConfig();
  props().setProperty('config', JSON.stringify(def));
  return def;
}

function saveConfig(cfg) { props().setProperty('config', JSON.stringify(cfg)); }

function publicConfig(cfg) {
  return { rooms: cfg.rooms, bannedRooms: cfg.bannedRooms, fixedSlots: cfg.fixedSlots };
}

/* ---------- 預約儲存（按月分片） ---------- */

function monthKeyOf(dateStr) { return 'bookings_' + dateStr.slice(0, 7); }

function loadMonth(mk) {
  var raw = props().getProperty(mk);
  return raw ? JSON.parse(raw) : [];
}

function saveMonth(mk, arr) {
  if (arr.length) props().setProperty(mk, JSON.stringify(arr));
  else props().deleteProperty(mk);
}

function monthsBetween(fromStr, toStr) {
  var res = [];
  var y = +fromStr.slice(0, 4), m = +fromStr.slice(5, 7);
  var ey = +toStr.slice(0, 4), em = +toStr.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    res.push(y + '-' + ('0' + m).slice(-2));
    m++; if (m > 12) { m = 1; y++; }
  }
  return res;
}

function loadBookings(fromStr, toStr) {
  var out = [];
  monthsBetween(fromStr, toStr).forEach(function (ym) {
    loadMonth('bookings_' + ym).forEach(function (b) {
      if (b.date >= fromStr && b.date <= toStr) out.push(b);
    });
  });
  out.sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1; });
  return out;
}

function findBooking(id) {
  var keys = props().getKeys();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf('bookings_') !== 0) continue;
    var arr = loadMonth(keys[i]);
    for (var j = 0; j < arr.length; j++) {
      if (arr[j].id === id) return { key: keys[i], arr: arr, idx: j };
    }
  }
  return null;
}

/* ---------- 驗證與衝突檢查 ---------- */

function isValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime()); }
function isValidTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

function dayOfWeek(dateStr) { return new Date(dateStr + 'T00:00:00').getDay(); }

function overlaps(s1, e1, s2, e2) { return s1 < e2 && e1 > s2; }

// 回傳 null＝無衝突；否則回傳衝突說明字串
function findConflict(cfg, date, start, end, room, excludeId) {
  var dow = dayOfWeek(date);
  for (var i = 0; i < cfg.fixedSlots.length; i++) {
    var f = cfg.fixedSlots[i];
    if (f.room === room && f.days.indexOf(dow) >= 0 && overlaps(start, end, f.start, f.end)) {
      return '與固定課程「' + f.title + '」（' + f.start + '–' + f.end + '）時段衝突';
    }
  }
  var dayBookings = loadMonth(monthKeyOf(date)).filter(function (b) {
    return b.date === date && b.room === room && b.id !== excludeId;
  });
  for (var k = 0; k < dayBookings.length; k++) {
    var b = dayBookings[k];
    if (overlaps(start, end, b.start, b.end)) {
      return '此時段已被「' + b.name + '」預約（' + b.start + '–' + b.end + '）';
    }
  }
  return null;
}

/* ---------- API ---------- */

function jsonOut(obj, callback) {
  var text = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + text + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cfg = getConfig();
  var today = todayStr();
  var from = isValidDate(p.from || '') ? p.from : addDays(today, -35);
  var to = isValidDate(p.to || '') ? p.to : addDays(today, 130);
  return jsonOut({
    ok: true,
    today: today,
    config: publicConfig(cfg),
    bookings: loadBookings(from, to)
  }, p.callback);
}

function addDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return jsonOut({ ok: false, error: '無法解析請求' }); }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (err) { return jsonOut({ ok: false, error: '系統忙碌中，請稍後再試' }); }

  var res;
  try {
    switch (req.action) {
      case 'book': res = apiBook(req); break;
      case 'cancel': res = apiCancel(req); break;
      case 'forgot': res = apiForgot(req); break;
      case 'admin': res = apiAdmin(req); break;
      default: res = { ok: false, error: '未知的操作' };
    }
  } catch (err) {
    res = { ok: false, error: '系統錯誤：' + err.message };
  } finally {
    lock.releaseLock();
  }
  return jsonOut(res);
}

function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

function apiBook(req) {
  var cfg = getConfig();
  var name = String(req.name || '').trim();
  var phone = String(req.phone || '').trim();
  var email = String(req.email || '').trim();
  var purpose = String(req.purpose || '').trim();
  var date = String(req.date || '');
  var start = String(req.start || '');
  var end = String(req.end || '');
  var room = String(req.room || '');

  if (!name) return { ok: false, error: '請填寫申請人姓名' };
  if (name.length > 30) return { ok: false, error: '姓名過長' };
  if (!purpose) return { ok: false, error: '請填寫活動名稱' };
  if (purpose.length > 100) return { ok: false, error: '活動名稱過長' };
  if (!email) return { ok: false, error: '請填寫 Email（忘記取消碼時用來找回預約）' };
  if (email.length > 60 || !isValidEmail(email)) return { ok: false, error: 'Email 格式不正確' };
  if (!isValidDate(date)) return { ok: false, error: '日期格式錯誤' };
  if (!isValidTime(start) || !isValidTime(end)) return { ok: false, error: '時間格式錯誤' };
  if (+start.slice(3) % 30 !== 0 || +end.slice(3) % 30 !== 0) {
    return { ok: false, error: '開始與結束時間須以整點或半點為單位（例如 19:00、19:30）' };
  }
  if (start >= end) return { ok: false, error: '結束時間必須晚於開始時間' };

  var today = todayStr();
  if (date < today) return { ok: false, error: '不能預約過去的日期' };
  if (date > addDays(today, 180)) return { ok: false, error: '最多只能預約 180 天內的時段' };

  if (!/^\d{10}$/.test(room)) return { ok: false, error: 'Zoom 會議室號碼必須是 10 碼數字' };
  for (var i = 0; i < cfg.bannedRooms.length; i++) {
    if (cfg.bannedRooms[i].id === room) return { ok: false, error: '會議室 ' + room + ' 禁止申請' };
  }

  var conflict = findConflict(cfg, date, start, end, room, null);
  if (conflict) return { ok: false, error: conflict, conflict: true };

  var id = 'b' + Date.now() + Math.floor(Math.random() * 1000);
  var code = String(Math.floor(1000 + Math.random() * 9000));
  var booking = {
    id: id, name: name, phone: phone, email: email, purpose: purpose,
    date: date, start: start, end: end, room: room,
    code: code, createdAt: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
  };
  var mk = monthKeyOf(date);
  var arr = loadMonth(mk);
  if (JSON.stringify(arr).length > 8300) return { ok: false, error: '該月份預約已滿，請聯絡管理人' };
  arr.push(booking);
  saveMonth(mk, arr);
  return { ok: true, approved: true, id: id, code: code, message: '預約成功！時段無衝突，系統已自動放行。' };
}

function apiCancel(req) {
  var found = findBooking(String(req.id || ''));
  if (!found) return { ok: false, error: '找不到這筆預約' };
  var b = found.arr[found.idx];
  var cfg = getConfig();
  var isAdmin = req.password && req.password === cfg.adminPassword;
  if (!isAdmin && String(req.code || '') !== b.code) {
    return { ok: false, error: '取消碼錯誤' };
  }
  found.arr.splice(found.idx, 1);
  saveMonth(found.key, found.arr);
  return { ok: true, message: '已取消預約' };
}

// 忘記取消碼：寄回該 Email 尚未到期的預約資訊
function apiForgot(req) {
  var email = String(req.email || '').trim();
  if (!isValidEmail(email)) return { ok: false, error: 'Email 格式不正確' };
  var today = todayStr();
  var nowHM = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  var list = [];
  props().getKeys().forEach(function (k) {
    if (k.indexOf('bookings_') !== 0) return;
    loadMonth(k).forEach(function (b) {
      if (!b.email || b.email.toLowerCase() !== email.toLowerCase()) return;
      if (b.date > today || (b.date === today && b.end >= nowHM)) list.push(b);
    });
  });
  if (!list.length) {
    return { ok: false, error: '找不到這個 Email 的未到期預約。（預約時需填寫 Email，才能使用此功能）' };
  }
  list.sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1; });
  var body = '阿彌陀佛！\n\n以下是您在「寶嚴禪寺zoom會議室預約系統」尚未到期的預約：\n\n' +
    list.map(function (b) {
      return '・' + b.date + ' ' + b.start + '–' + b.end +
        '｜會議室 ' + b.room + '｜' + (b.purpose || '') +
        '｜申請人 ' + b.name + '｜取消碼 ' + b.code;
    }).join('\n') +
    '\n\n如需取消預約，請至 https://twnyda07.github.io/baoyan-zoom-booking/ 點選您的預約，輸入取消碼即可。\n\n寶嚴禪寺 合十';
  MailApp.sendEmail(email, '【寶嚴禪寺】您的 Zoom 會議室預約資訊與取消碼', body);
  return { ok: true, message: '已寄出！請至 ' + email + ' 收信（若沒收到請檢查垃圾郵件夾）。' };
}

function apiAdmin(req) {
  var cfg = getConfig();
  if (String(req.password || '') !== cfg.adminPassword) {
    return { ok: false, error: '管理密碼錯誤' };
  }
  var op = req.op;

  if (op === 'verify') return { ok: true, message: '登入成功' };

  if (op === 'deleteBooking') {
    var found = findBooking(String(req.id || ''));
    if (!found) return { ok: false, error: '找不到這筆預約' };
    found.arr.splice(found.idx, 1);
    saveMonth(found.key, found.arr);
    return { ok: true, message: '已刪除預約' };
  }

  if (op === 'addFixed') {
    var s = req.slot || {};
    if (!s.title || !s.room || !isValidTime(s.start) || !isValidTime(s.end) || s.start >= s.end ||
        !Array.isArray(s.days) || !s.days.length) {
      return { ok: false, error: '固定時段資料不完整' };
    }
    s.id = 'f' + cfg.nextFixedId++;
    s.days = s.days.map(Number).filter(function (d) { return d >= 0 && d <= 6; });
    cfg.fixedSlots.push({ id: s.id, title: String(s.title), room: String(s.room), days: s.days, start: s.start, end: s.end });
    saveConfig(cfg);
    return { ok: true, message: '已新增固定時段', slot: s };
  }

  if (op === 'updateFixed') {
    var s2 = req.slot || {};
    for (var i = 0; i < cfg.fixedSlots.length; i++) {
      if (cfg.fixedSlots[i].id === req.slotId) {
        if (!s2.title || !s2.room || !isValidTime(s2.start) || !isValidTime(s2.end) || s2.start >= s2.end ||
            !Array.isArray(s2.days) || !s2.days.length) {
          return { ok: false, error: '固定時段資料不完整' };
        }
        cfg.fixedSlots[i] = { id: req.slotId, title: String(s2.title), room: String(s2.room),
          days: s2.days.map(Number), start: s2.start, end: s2.end };
        saveConfig(cfg);
        return { ok: true, message: '已更新固定時段' };
      }
    }
    return { ok: false, error: '找不到該固定時段' };
  }

  if (op === 'delFixed') {
    var before = cfg.fixedSlots.length;
    cfg.fixedSlots = cfg.fixedSlots.filter(function (f) { return f.id !== req.slotId; });
    if (cfg.fixedSlots.length === before) return { ok: false, error: '找不到該固定時段' };
    saveConfig(cfg);
    return { ok: true, message: '已刪除固定時段' };
  }

  if (op === 'addRoom') {
    var r = req.room || {};
    if (!/^\d{10}$/.test(String(r.id || ''))) return { ok: false, error: 'Zoom 號碼須為 10 碼數字' };
    if (cfg.rooms.some(function (x) { return x.id === r.id; })) return { ok: false, error: '此會議室已存在' };
    cfg.rooms.push({ id: String(r.id), name: String(r.name || r.id) });
    saveConfig(cfg);
    return { ok: true, message: '已新增會議室' };
  }

  if (op === 'delRoom') {
    var before2 = cfg.rooms.length;
    cfg.rooms = cfg.rooms.filter(function (x) { return x.id !== req.roomId; });
    if (cfg.rooms.length === before2) return { ok: false, error: '找不到該會議室' };
    saveConfig(cfg);
    return { ok: true, message: '已移除會議室' };
  }

  if (op === 'setRooms') {
    var rl = req.rooms;
    if (!Array.isArray(rl) || !rl.length ||
        rl.some(function (r) { return !/^\d{10}$/.test(String(r.id || '')); })) {
      return { ok: false, error: '會議室清單格式錯誤（每筆需 10 碼數字 id）' };
    }
    cfg.rooms = rl.map(function (r) { return { id: String(r.id), name: String(r.name || r.id) }; });
    saveConfig(cfg);
    return { ok: true, message: '已更新會議室清單' };
  }

  if (op === 'setBanned') {
    var bl = req.banned;
    if (!Array.isArray(bl)) return { ok: false, error: '禁止清單格式錯誤' };
    cfg.bannedRooms = bl.map(function (b) {
      return { id: String(b.id), reason: String(b.reason || '禁止申請') };
    });
    saveConfig(cfg);
    return { ok: true, message: '已更新禁止申請清單' };
  }

  if (op === 'setPassword') {
    var np = String(req.newPassword || '');
    if (np.length < 6) return { ok: false, error: '新密碼至少 6 個字元' };
    cfg.adminPassword = np;
    saveConfig(cfg);
    return { ok: true, message: '已更改管理密碼' };
  }

  return { ok: false, error: '未知的管理操作' };
}
