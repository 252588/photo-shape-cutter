'use strict';
const $ = id => document.getElementById(id);
const canvas = $('editor');
const ctx = canvas.getContext('2d');
const state = { photo: null, mask: null, shape: null, zoom: 1, x: 0, y: 0, base: 1 };
const pointers = new Map();
let gesture = null, resultBlob = null, resultUrl = null, loadVersion = 0, shapeVersion = 0;
const status = message => { $('status').textContent = message; };
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。JPEGまたはPNGでお試しください。'));
    image.src = src;
  });
}
function fit() {
  state.base = Math.max(canvas.width / state.photo.width, canvas.height / state.photo.height);
  state.zoom = 1; state.x = canvas.width / 2; state.y = canvas.height / 2;
  syncZoom();
}
function clampPosition() {
  const halfW = state.photo.width * state.base * state.zoom / 2;
  const halfH = state.photo.height * state.base * state.zoom / 2;
  state.x = Math.min(halfW, Math.max(canvas.width - halfW, state.x));
  state.y = Math.min(halfH, Math.max(canvas.height - halfH, state.y));
}
function paintPhoto(context, ratio = 1) {
  context.save(); context.scale(ratio, ratio);
  const scale = state.base * state.zoom;
  context.drawImage(state.photo, state.x - state.photo.width * scale / 2, state.y - state.photo.height * scale / 2, state.photo.width * scale, state.photo.height * scale);
  context.restore();
}
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state.photo || !state.mask) return;
  clampPosition(); paintPhoto(ctx);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(state.mask, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}
function syncZoom() { $('zoom').value = state.zoom; $('zoomValue').value = `${Math.round(state.zoom * 100)}%`; }
function setEnabled(enabled) {
  for (const el of document.querySelectorAll('#zoom, #reset, #previewButton, .nudge button')) el.disabled = !enabled;
}
async function chooseShape(shape, button) {
  const version = ++shapeVersion;
  setEnabled(false);
  try {
    const mask = await loadImage(shape.src);
    if (version !== shapeVersion) return;
    state.shape = shape; state.mask = mask;
    canvas.width = shape.width; canvas.height = shape.height;
    $('canvasArea').style.aspectRatio = `${shape.width}/${shape.height}`;
    document.querySelectorAll('.shape-option').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
    if (state.photo) { fit(); setEnabled(true); }
    render();
  } catch { if (version === shapeVersion) status('シルエットを読み込めません。SVGのファイル名と場所を確認してください。'); }
}
for (const shape of window.PHOTO_SHAPES) {
  const button = document.createElement('button'); button.className = 'shape-option';
  button.setAttribute('aria-pressed', 'false');
  const image = document.createElement('img'); image.src = shape.src; image.alt = '';
  const label = document.createElement('span'); label.textContent = shape.name;
  button.append(image, label); button.addEventListener('click', () => chooseShape(shape, button));
  $('shapeList').append(button);
}
chooseShape(window.PHOTO_SHAPES[0], $('shapeList').firstElementChild);
$('photoInput').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const version = ++loadVersion; status('写真を読み込んでいます…');
  const url = URL.createObjectURL(file);
  try {
    const photo = await loadImage(url);
    // iPhoneのメモリ使用量を抑えるため、作業用写真の長辺を最大3000pxにします。
    const ratio = Math.min(1, 3000 / Math.max(photo.naturalWidth, photo.naturalHeight));
    const working = document.createElement('canvas');
    working.width = Math.max(1, Math.round(photo.naturalWidth * ratio));
    working.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
    working.getContext('2d').drawImage(photo, 0, 0, working.width, working.height);
    if (version !== loadVersion) return;
    state.photo = working; fit(); render();
    $('emptyState').hidden = true; $('uploadLabel').textContent = '別の写真に変更する';
    $('fileLabel').textContent = file.name; setEnabled(Boolean(state.mask));
    status('写真をドラッグして位置を調整できます。');
  } catch (error) { if (version === loadVersion) status(error.message); }
  finally { URL.revokeObjectURL(url); event.target.value = ''; }
});
function point(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}
function snapshotGesture() {
  const pts = [...pointers.values()];
  if (!pts.length) { gesture = null; return; }
  const center = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
  gesture = { center, distance: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, x: state.x, y: state.y, zoom: state.zoom };
}
canvas.addEventListener('pointerdown', event => {
  if (!state.photo || !state.mask) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, point(event)); snapshotGesture();
});
canvas.addEventListener('pointermove', event => {
  if (!pointers.has(event.pointerId) || !gesture) return;
  event.preventDefault(); pointers.set(event.pointerId, point(event));
  const pts = [...pointers.values()];
  const center = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
  if (pts.length > 1 && gesture.distance > 0) {
    const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    state.zoom = Math.min(5, Math.max(1, gesture.zoom * distance / gesture.distance));
  }
  const factor = state.zoom / gesture.zoom;
  state.x = center.x + (gesture.x - gesture.center.x) * factor;
  state.y = center.y + (gesture.y - gesture.center.y) * factor;
  syncZoom(); render();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => { pointers.delete(event.pointerId); snapshotGesture(); });
$('zoom').addEventListener('input', event => {
  const old = state.zoom; state.zoom = Number(event.target.value);
  state.x = canvas.width / 2 + (state.x - canvas.width / 2) * state.zoom / old;
  state.y = canvas.height / 2 + (state.y - canvas.height / 2) * state.zoom / old;
  syncZoom(); render();
});
$('reset').addEventListener('click', () => { fit(); render(); });
for (const button of document.querySelectorAll('.nudge button')) button.addEventListener('click', () => { state.x += Number(button.dataset.dx); state.y += Number(button.dataset.dy); render(); });
$('previewButton').addEventListener('click', async () => {
  if (!state.photo || !state.mask) return;
  $('previewButton').disabled = true; status('透過PNGを作成しています…');
  try {
    const output = document.createElement('canvas');
    // 元写真を過度に引き伸ばさず、長辺最大2400pxに書き出します。
    const ratio = Math.min(2400 / Math.max(canvas.width, canvas.height), Math.max(1, 1 / (state.base * state.zoom)));
    output.width = Math.round(canvas.width * ratio); output.height = Math.round(canvas.height * ratio);
    const out = output.getContext('2d');
    paintPhoto(out, output.width / canvas.width);
    out.globalCompositeOperation = 'destination-in';
    out.drawImage(state.mask, 0, 0, output.width, output.height);
    resultBlob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!resultBlob) throw new Error('PNGを作成できませんでした。別の写真でお試しください。');
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(resultBlob);
    $('resultImage').src = resultUrl; $('downloadLink').href = resultUrl;
    $('resultSize').textContent = `${output.width} × ${output.height}px · 透過PNG`;
    $('previewDialog').showModal(); status('切り抜き結果を確認して保存してください。');
  } catch (error) { status(error.message); }
  finally { $('previewButton').disabled = !state.photo || !state.mask; }
});
$('closePreview').addEventListener('click', () => $('previewDialog').close());
$('saveButton').addEventListener('click', async () => {
  if (!resultBlob) return;
  const file = new File([resultBlob], 'photo-shape.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else { $('downloadLink').click(); }
  } catch (error) {
    if (error.name !== 'AbortError') { $('resultSize').textContent = '共有できませんでした。「PNGをダウンロード」または画像の長押しをお試しください。'; }
  }
});
