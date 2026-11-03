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
    image.onerror = () => reject(new Error(t('imageError')));
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
    

const originalWidth = shape.width || mask.naturalWidth;
const originalHeight = shape.height || mask.naturalHeight;
const scale = Math.min(1, 1200 / Math.max(originalWidth, originalHeight));
const width = Math.round(originalWidth * scale);
const height = Math.round(originalHeight * scale);

canvas.width = width;
canvas.height = height;
$('canvasArea').style.aspectRatio = `${width}/${height}`;


    document.querySelectorAll('.shape-option').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
    if (state.photo) { fit(); setEnabled(true); }
    render();
} catch { if (version === shapeVersion) status(t('shapeError')); }
}
for (const shape of window.PHOTO_SHAPES) {
  const button = document.createElement('button'); button.className = 'shape-option';
  button.setAttribute('aria-pressed', 'false');
  const image = document.createElement('img'); image.src = shape.src; image.alt = '';
 
button.setAttribute('aria-label', shape.name);
button.append(image);
button.addEventListener('click', () => chooseShape(shape, button));
  $('shapeList').append(button);
}
chooseShape(window.PHOTO_SHAPES[0], $('shapeList').firstElementChild);
$('photoInput').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const version = ++loadVersion; status(t('loading'));
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
    $('emptyState').hidden = true; $('uploadLabel').textContent = t('changePhoto');
    $('fileLabel').textContent = file.name; setEnabled(Boolean(state.mask));
    status(t('loaded'));
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
$('previewButton').disabled = true; status(t('creating'));
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
    if (!resultBlob) throw new Error(t('pngError'));
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(resultBlob);
    $('resultImage').src = resultUrl; $('downloadLink').href = resultUrl;
    $('resultSize').textContent = `${output.width} × ${output.height}px · ${t('transparentLabel')}`;
    $('previewDialog').showModal(); status(t('created'));
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
    if (error.name !== 'AbortError') { $('resultSize').textContent = t('shareError'); }
  }
});


/* POPPING DOODLES — Language switch */

const translations = {
  en: {
    localBadge: 'Photos stay on your device',
    headline: 'Give your memories a little shape.',
    description: 'Turn your photos into playful cutouts.\nPerfect for journals and scrapbooks.',
    transparentPng: 'Transparent PNG',
    canvasLabel: 'Drag to move your photo. Pinch to resize.',
    emptyTitle: 'Which memory will you shape?',
    emptyDescription: 'Choose a photo to get started.',
    choosePhoto: '+ Choose a photo',
    privacyShort: 'Your photo is never uploaded.',
    gestureHint: 'Drag to move · Pinch to resize',
    stepPhoto: 'Choose a photo',
    uploadLabel: 'Select from photo library',
    changePhoto: 'Choose another photo',
    filePrompt: 'Pick your favorite photo.',
    stepShape: 'Pick a shape',
    stepAdjust: 'Adjust your photo',
    reset: 'Reset',
    zoom: 'Zoom',
    nudgeLabel: 'Move photo in small steps',
    moveLeft: 'Move left',
    moveUp: 'Move up',
    moveDown: 'Move down',
    moveRight: 'Move right',
    preview: 'Preview your cutout',
    exportNote: 'Transparent PNG · Up to 2,400px on the longest side. Perfect for journals and scrapbooks.',
    privacyFooter: 'No sign-up needed. Photos are processed in your browser, not uploaded or stored on a server.',
    previewTitle: 'Your cutout is ready!',
    closePreview: 'Close preview',
    checkerNote: 'The checkerboard area is transparent.',
    resultAlt: 'Cutout with a transparent background',
    saveShare: 'Save or share PNG',
    download: 'Download PNG',
    iphoneHint: 'On iPhone, choose Save Image or Save to Files from the share menu. You can also touch and hold the image above.',
    loading: 'Loading your photo…',
    loaded: 'Drag your photo to adjust its position.',
    creating: 'Creating your transparent PNG…',
    created: 'Check your cutout and save it.',
    imageError: 'Could not load the image. Please try a JPEG or PNG.',
    shapeError: 'Could not load the shape. Please try again.',
    pngError: 'Could not create the PNG. Please try another photo.',
    shareError: 'Could not share. Try Download PNG or touch and hold the image.',
    transparentLabel: 'Transparent PNG'
  },
  ja: {
    localBadge: '写真は端末の中だけで処理',
    headline: '思い出を、好きなかたちに。',
    description: '写真をかわいく切り抜いて、\n手帳やスクラップブックをもっと楽しく。',
    editorLabel: '写真の位置調整',
    transparentPng: '透過PNG',
    canvasLabel: '写真をドラッグで移動、2本指で拡大縮小',
    emptyTitle: 'どんな思い出を切り抜く？',
    emptyDescription: '写真を選んで、はじめましょう。',
    choosePhoto: '＋ 写真を選ぶ',
    privacyShort: '写真はアップロードされません。',
    gestureHint: 'ドラッグで移動 · 2本指でピンチして拡大・縮小',
    stepPhoto: '写真を選ぶ',
    uploadLabel: '写真ライブラリから選ぶ',
    changePhoto: '別の写真に変更する',
    filePrompt: 'お気に入りの1枚を用意してください。',
    stepShape: 'かたちを選ぶ',
    stepAdjust: 'ぴったりの位置に',
    reset: 'リセット',
    zoom: '拡大・縮小',
    nudgeLabel: '写真を少しずつ移動',
    moveLeft: '写真を左へ',
    moveUp: '写真を上へ',
    moveDown: '写真を下へ',
    moveRight: '写真を右へ',
    preview: '切り抜きをプレビュー',
    exportNote: '背景透過PNG · 長辺最大2,400px。手帳やアルバムづくりに。',
    privacyFooter: '登録不要。写真は保存・送信されず、このブラウザ内で処理されます。',
    previewTitle: '切り抜きのできあがり',
    closePreview: 'プレビューを閉じる',
    checkerNote: '市松模様の部分は透明です。',
    resultAlt: '背景が透明な切り抜き結果',
    saveShare: 'PNGを保存・共有',
    download: 'PNGをダウンロード',
    iphoneHint: 'iPhoneでは共有メニューから「画像を保存」または「ファイルに保存」を選びます。うまくいかない場合は画像を長押ししてください。',
    loading: '写真を読み込んでいます…',
    loaded: '写真をドラッグして位置を調整できます。',
    creating: '透過PNGを作成しています…',
    created: '切り抜き結果を確認して保存してください。',
    imageError: '画像を読み込めませんでした。JPEGまたはPNGでお試しください。',
    shapeError: 'シルエットを読み込めません。もう一度お試しください。',
    pngError: 'PNGを作成できませんでした。別の写真でお試しください。',
    shareError: '共有できませんでした。「PNGをダウンロード」または画像の長押しをお試しください。',
    transparentLabel: '透過PNG'
  }
};

let currentLanguage = 'en';

function t(key) {
  return translations[currentLanguage][key] || key;
}

function setLanguage(language) {
  currentLanguage = language;
  document.documentElement.lang = language;
  try {
    localStorage.setItem('photoShapeLanguage', language);
  } catch (_) {}

  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.dataset.i18n;

    if (key === 'uploadLabel' && state.photo) {
      element.textContent = t('changePhoto');
    } else if (key === 'filePrompt' && state.photo) {
      // Keep the selected file name.
    } else {
      element.textContent = t(key);
    }
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });

  document.querySelectorAll('[data-i18n-alt]').forEach(element => {
    element.alt = t(element.dataset.i18nAlt);
  });

  $('langEN').setAttribute('aria-pressed', String(language === 'en'));
  $('langJA').setAttribute('aria-pressed', String(language === 'ja'));

  if (resultBlob) {
    const size = $('resultSize').textContent;
    $('resultSize').textContent = size.replace(
      /透過PNG|Transparent PNG/g,
      t('transparentLabel')
    );
  }
}

$('langEN').addEventListener('click', () => setLanguage('en'));
$('langJA').addEventListener('click', () => setLanguage('ja'));

let savedLanguage = 'en';
try {
  savedLanguage = localStorage.getItem('photoShapeLanguage') || 'en';
} catch (_) {}
setLanguage(savedLanguage === 'ja' ? 'ja' : 'en');
