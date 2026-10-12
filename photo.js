'use strict';

// 体の写真（試作）：前回の写真を重ねて撮影し、端末内に保存して比べる

const $ = (sel) => document.querySelector(sel);
const POSE_LABEL = { front: '正面', side: '横', back: '背中' };
const OUT_W = 900;
const OUT_H = 1200; // 3:4

let pose = 'front';
let stream = null;
let facingMode = 'environment';
let photos = []; // { id, pose, takenAt, brightness, blob }
const objectUrls = new Map();

// ---------- IndexedDB ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kintore-photos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('photos', mode);
    const result = fn(t.objectStore('photos'));
    t.oncomplete = () => resolve(result && result.result);
    t.onerror = () => reject(t.error);
  });
}

const dbAll = () => tx('readonly', (s) => s.getAll());
const dbPut = (photo) => tx('readwrite', (s) => s.put(photo));
const dbDelete = (id) => tx('readwrite', (s) => s.delete(id));

// ---------- 表示用 ----------
function urlFor(photo) {
  if (!objectUrls.has(photo.id)) objectUrls.set(photo.id, URL.createObjectURL(photo.blob));
  return objectUrls.get(photo.id);
}

function formatDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const posePhotos = () => photos.filter((p) => p.pose === pose).sort((a, b) => a.takenAt - b.takenAt);
const latestOfPose = () => posePhotos().at(-1) || null;

function showMessage(text, warn = false) {
  const m = $('#message');
  m.textContent = text;
  m.classList.toggle('warn', warn);
}

// ---------- ポーズ ----------
document.querySelectorAll('#pose-select button').forEach((btn) => {
  btn.addEventListener('click', () => {
    pose = btn.dataset.pose;
    document.querySelectorAll('#pose-select button').forEach((b) => b.classList.toggle('on', b === btn));
    showMessage('');
    renderAll();
  });
});

// ---------- カメラ ----------
async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage('このブラウザではカメラを使えません。下のボタンから写真を読み込んでください。', true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1440 }, height: { ideal: 1920 } },
      audio: false,
    });
  } catch (e) {
    showMessage('カメラを起動できませんでした。ブラウザの設定でカメラを許可してください。', true);
    return;
  }
  const video = $('#video');
  video.srcObject = stream;
  // インカメラは鏡のように表示する（保存する写真も表示どおりにする）
  video.classList.toggle('mirror', facingMode === 'user');
  $('#viewfinder').classList.remove('hidden');
  $('#camera-controls').classList.remove('hidden');
  $('#start-camera').classList.add('hidden');
  updateGhost();
}

function stopCamera() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

$('#start-camera').addEventListener('click', startCamera);
$('#flip').addEventListener('click', () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

// 前回の同じポーズの写真をうっすら重ねる
function updateGhost() {
  const ghost = $('#ghost');
  const last = latestOfPose();
  if (last) {
    ghost.src = urlFor(last);
    ghost.classList.remove('hidden');
  } else {
    ghost.classList.add('hidden');
  }
  ghost.style.opacity = $('#ghost-opacity').value / 100;
}

$('#ghost-opacity').addEventListener('input', updateGhost);

// ---------- 撮影 ----------
let shooting = false;

$('#shutter').addEventListener('click', async () => {
  if (shooting || !stream) return;
  shooting = true;
  const seconds = Number($('#timer-select').value);
  const cd = $('#countdown');
  for (let s = seconds; s > 0; s--) {
    cd.textContent = s;
    cd.classList.remove('hidden');
    await new Promise((r) => setTimeout(r, 1000));
  }
  cd.classList.add('hidden');

  const video = $('#video');
  await savePhoto(video, video.videoWidth, video.videoHeight, facingMode === 'user');
  shooting = false;
});

$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    await savePhoto(bitmap, bitmap.width, bitmap.height, false);
    bitmap.close();
  } catch {
    showMessage('写真を読み込めませんでした。', true);
  }
});

// 3:4 に切り抜いて縮小し、明るさを測って保存する
async function savePhoto(source, sw, sh, mirror) {
  if (!sw || !sh) {
    showMessage('カメラの準備ができていません。少し待ってからもう一度押してください。', true);
    return;
  }
  const canvas = $('#canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d');

  const scale = Math.max(OUT_W / sw, OUT_H / sh);
  const cw = OUT_W / scale, ch = OUT_H / scale;
  const sx = (sw - cw) / 2, sy = (sh - ch) / 2;

  ctx.save();
  if (mirror) { ctx.translate(OUT_W, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);
  ctx.restore();

  const brightness = measureBrightness(ctx);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) {
    showMessage('写真を保存できませんでした。', true);
    return;
  }

  const prev = latestOfPose();
  const photo = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, pose, takenAt: Date.now(), brightness, blob };
  try {
    await dbPut(photo);
  } catch {
    showMessage('保存できませんでした。スマホの空き容量を確認してください。', true);
    return;
  }
  photos.push(photo);

  // 前回より明るさが大きく違えば知らせる
  if (prev) {
    const diff = (brightness - prev.brightness) / Math.max(prev.brightness, 1);
    if (Math.abs(diff) >= 0.15) {
      showMessage(`保存しました。ただし前回より${diff > 0 ? '明るい' : '暗い'}写真です（${Math.round(Math.abs(diff) * 100)}%）。照明や時間帯を揃えると比べやすくなります。`, true);
    } else {
      showMessage('保存しました。明るさは前回とほぼ同じです。');
    }
  } else {
    showMessage(`${POSE_LABEL[pose]}の1枚目を保存しました。次回はこの写真が重ねて表示されます。`);
  }
  renderAll();
}

// 平均の明るさ（0〜255）
function measureBrightness(ctx) {
  const { data } = ctx.getImageData(0, 0, OUT_W, OUT_H);
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 37) { // 間引いて計算する
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    n++;
  }
  return Math.round(sum / n);
}

// ---------- 比較 ----------
function renderCompare() {
  const list = posePhotos();
  const enough = list.length >= 2;
  $('#compare').classList.toggle('hidden', !enough);
  $('#compare-empty').classList.toggle('hidden', enough);
  if (!enough) return;

  for (const [sel, defaultIndex] of [[$('#before-select'), 0], [$('#after-select'), list.length - 1]]) {
    const current = sel.value;
    sel.replaceChildren(...list.map((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = formatDateTime(p.takenAt);
      return o;
    }));
    sel.value = list.some((p) => p.id === current) ? current : list[defaultIndex].id;
  }
  updateCompareImages();
}

function updateCompareImages() {
  const byId = (id) => photos.find((p) => p.id === id);
  const before = byId($('#before-select').value);
  const after = byId($('#after-select').value);
  if (before) $('#before-img').src = urlFor(before);
  if (after) $('#after-img').src = urlFor(after);
  updateSlider();
}

function updateSlider() {
  const v = $('#compare-slider').value;
  $('#after-clip').style.clipPath = `inset(0 0 0 ${v}%)`;
  $('#divider').style.left = `${v}%`;
}

$('#before-select').addEventListener('change', updateCompareImages);
$('#after-select').addEventListener('change', updateCompareImages);
$('#compare-slider').addEventListener('input', updateSlider);

// ---------- 一覧 ----------
function renderGallery() {
  const list = posePhotos().reverse();
  const gallery = $('#gallery');
  if (!list.length) {
    gallery.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: `${POSE_LABEL[pose]}の写真はまだありません` }));
    gallery.style.display = 'block';
    return;
  }
  gallery.style.display = '';
  gallery.replaceChildren(...list.map((p) => {
    const fig = document.createElement('figure');
    const img = Object.assign(document.createElement('img'), { src: urlFor(p), alt: formatDateTime(p.takenAt), loading: 'lazy' });
    const cap = Object.assign(document.createElement('figcaption'), { textContent: formatDateTime(p.takenAt) });
    const del = Object.assign(document.createElement('button'), { type: 'button', textContent: '削除' });
    del.addEventListener('click', async () => {
      if (!confirm('この写真を削除しますか？')) return;
      await dbDelete(p.id);
      photos = photos.filter((x) => x.id !== p.id);
      URL.revokeObjectURL(objectUrls.get(p.id));
      objectUrls.delete(p.id);
      renderAll();
    });
    fig.append(img, cap, del);
    return fig;
  }));
}

function renderAll() {
  renderGallery();
  renderCompare();
  if (stream) updateGhost();
}

// ---------- 起動 ----------
(async () => {
  try {
    photos = await dbAll();
  } catch {
    showMessage('このブラウザでは写真を保存できません（プライベートモードなど）。', true);
  }
  renderAll();
})();
