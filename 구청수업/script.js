const slides = document.querySelectorAll(".slide");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const menuBtn = document.getElementById("menu");
const fsHomeBtn = document.getElementById("fs-home");
const fsFontDebugBtn = document.getElementById("fs-font-debug");
const fsTextEditBtn = document.getElementById("fs-text-edit");
const fsTextExportBtn = document.getElementById("fs-text-export");
const textEditToggle = document.getElementById("text-edit-toggle");
const textEditHint = document.getElementById("text-edit-hint");
const fullscreenBtn = document.getElementById("fullscreen");
const counter = document.getElementById("counter");
const fsCounter = document.getElementById("fs-counter");
const scheduleSlide = document.getElementById("schedule-slide");
const fontDebugToggle = document.getElementById("font-debug-toggle");

const FONT_DEBUG_STORAGE_KEY = "slideDeckFontDebug";
const TEXT_EDIT_STORAGE_KEY = "slideDeckTextEdits";
const REM_EDIT_STORAGE_KEY = "slideDeckRemEdits";
const TEXT_EDIT_MODE_STORAGE_KEY = "slideDeckTextEditMode";
const PRESENTATION_STORAGE_KEY = "slideDeckPresentation";
const SLIDE_INDEX_STORAGE_KEY = "slideDeckSlideIndex";
const FONT_DEBUG_SELECTORS =
  "h1,h2,h3,h4,p,li,td,th,figcaption,span,strong,em,button:not(.day-go),a,.tip-box,.highlight-box,.photo-prompt,.lead,.subtitle,.eyebrow,.org-badge,.author,.day-label,.day-title,.step-num,.section-num,.section-time,.instructor-name,.instructor-role,.career-total,.career-year,.career-school,.career-extra,.light-label,.warning-item h3,.warning-item p,.warning-item .action,.review-card h3,.consumables-table th,.consumables-table td";

const TEXT_EDIT_SELECTORS =
  "h1,h2,h3,h4,p,.lead,.subtitle,.step-num,.day-label,.day-title,li,td,th,figcaption,.tip-box,.highlight-box,.light-label,.photo-prompt,.warning-item-text h3,.warning-item-text p,.warning-item .action,.review-card h3,.instructor-name,.instructor-role,.section-num,.section-time,.org-badge,.author,.eyebrow,.intro-panel-lead,.coin-demo,.career-extra,.instructor-career h3,.schedule-lead,.career-total";

/** 23인치·1920×1080 전체화면 = scale 1 (rem 조절 기준) */
const DECK_REF = { width: 1920, height: 1080 };

const DAY_TOPICS = {
  1: ["경고등", "엔진오일", "냉각수", "배터리"],
  2: ["타이어", "브레이크", "소모품"],
};

let current = 0;
let fontDebugEnabled = false;
let textEditEnabled = false;
let textEditSaveTimer;

function getSlideIndex(slide) {
  return [...slides].indexOf(slide);
}

function goToDay(day) {
  const target = document.querySelector(`[data-day-start="${day}"]`);
  if (target) showSlide(getSlideIndex(target));
}

function getDaySlides(day) {
  const startEl = document.querySelector(`[data-day-start="${day}"]`);
  const endEl = document.querySelector(`[data-day-end="${day}"]`);
  if (!startEl || !endEl) return [];
  const startIdx = getSlideIndex(startEl);
  const endIdx = getSlideIndex(endEl);
  if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return [];
  return [...slides].slice(startIdx, endIdx + 1);
}

function refreshTopicTrackerForSlide(index) {
  const info = getSlideTopicInfo(index);
  const tracker = slides[index]?.querySelector(".topic-tracker");
  if (!tracker) return;

  tracker.replaceChildren();
  if (!info) {
    tracker.hidden = true;
    return;
  }

  const topics = DAY_TOPICS[info.day];
  if (!topics) {
    tracker.hidden = true;
    return;
  }

  const nextTopic = getNextTopicFrom(index);
  topics.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "topic-chip";
    chip.textContent = name;
    if (name === info.topic) chip.classList.add("active");
    else if (name === nextTopic) chip.classList.add("next");
    tracker.appendChild(chip);
  });
  tracker.hidden = false;
}

function waitForSlideImages(slideEls) {
  const imgs = slideEls.flatMap((slide) => [...slide.querySelectorAll("img")]);
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })
    )
  );
}

const PDF_PAGE_MM = { width: 297, height: 210, margin: 6 };
const PDF_CAPTURE_BG = "#0d1b2a";

let pdfBusy = false;

function waitForCaptureLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setPdfCaptureMode(enabled) {
  const root = document.documentElement;
  root.classList.toggle("pdf-capturing", enabled);
  if (enabled) {
    root.classList.add("presentation-mode");
    root.setAttribute("data-deck-scaled", "");
    root.style.setProperty("--deck-scale", "1");
    document.body.classList.add("is-fullscreen");
  } else {
    root.classList.remove("presentation-mode");
    root.removeAttribute("data-deck-scaled");
    root.style.removeProperty("--deck-scale");
    document.body.classList.remove("is-fullscreen");
  }
}

function getPdfImageLayout() {
  const margin = PDF_PAGE_MM.margin;
  const contentW = PDF_PAGE_MM.width - margin * 2;
  const contentH = PDF_PAGE_MM.height - margin * 2;
  const imgRatio = DECK_REF.width / DECK_REF.height;
  const areaRatio = contentW / contentH;

  let drawW;
  let drawH;
  if (imgRatio > areaRatio) {
    drawW = contentW;
    drawH = contentW / imgRatio;
  } else {
    drawH = contentH;
    drawW = contentH * imgRatio;
  }

  return {
    x: margin + (contentW - drawW) / 2,
    y: margin + (contentH - drawH) / 2,
    width: drawW,
    height: drawH,
  };
}

async function captureDeckScreenshot() {
  const deck = document.getElementById("deck");
  if (!deck || !window.html2canvas) return null;

  const canvas = await html2canvas(deck, {
    width: DECK_REF.width,
    height: DECK_REF.height,
    scale: 1,
    useCORS: true,
    allowTaint: false,
    backgroundColor: PDF_CAPTURE_BG,
    logging: false,
    windowWidth: DECK_REF.width,
    windowHeight: DECK_REF.height,
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function downloadDayPdf(day) {
  if (pdfBusy) return;

  const daySlides = getDaySlides(day);
  if (!daySlides.length) return;

  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    window.alert("PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    return;
  }

  const savedIndex = current;
  const wasFullscreen = !!document.fullscreenElement;
  const wasPresentation = isPresentationMode();

  if (wasFullscreen) await document.exitFullscreen().catch(() => {});
  if (wasPresentation) setPresentationMode(false);

  pdfBusy = true;
  document.querySelectorAll("[data-pdf-day]").forEach((btn) => {
    btn.disabled = true;
  });

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const layout = getPdfImageLayout();

  try {
    setPdfCaptureMode(true);

    for (let i = 0; i < daySlides.length; i++) {
      const slide = daySlides[i];
      const slideIndex = getSlideIndex(slide);

      showSlide(slideIndex);
      refreshTopicTrackerForSlide(slideIndex);
      loadImagesForSlide(slideIndex);
      await waitForSlideImages([slide]);
      await waitForCaptureLayout();

      const imageData = await captureDeckScreenshot();
      if (!imageData) throw new Error("capture failed");

      if (i > 0) pdf.addPage("a4", "landscape");
      pdf.addImage(imageData, "JPEG", layout.x, layout.y, layout.width, layout.height);
    }

    pdf.save(`자동차관리_${day}일차.pdf`);
  } catch (err) {
    console.error(err);
    window.alert("PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    setPdfCaptureMode(false);
    showSlide(savedIndex);
    refreshTopicTracker();
    syncDeckView();
    if (wasPresentation) setPresentationMode(true);
    if (wasFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    pdfBusy = false;
    document.querySelectorAll("[data-pdf-day]").forEach((btn) => {
      btn.disabled = false;
    });
  }
}

function goToSchedule() {
  if (scheduleSlide) showSlide(getSlideIndex(scheduleSlide));
}

function resolveImageUrl(path) {
  if (!path) return "";
  return encodeURI(path).replace(/#/g, "%23");
}

function bindImageError(img, placeholder) {
  if (img.dataset.errorBound === "1") return;
  img.dataset.errorBound = "1";
  img.onerror = () => {
    if (placeholder && img.dataset.fallbackTried !== "1") {
      img.dataset.fallbackTried = "1";
      img.src = resolveImageUrl(placeholder);
      return;
    }
    img.onerror = null;
  };
}

function loadImgElement(img) {
  if (img.dataset.loaded === "1") return;
  const config = window.SLIDE_IMAGES || {};
  const key = img.dataset.img;
  const placeholder = img.dataset.placeholder;
  const src = config[key];
  img.dataset.loaded = "1";
  bindImageError(img, placeholder);
  if (src) {
    img.src = resolveImageUrl(src);
  } else if (placeholder) {
    img.src = resolveImageUrl(placeholder);
  }
}

function loadWarningImgWrap(wrap) {
  if (wrap.dataset.loaded === "1") return;
  const config = window.SLIDE_IMAGES || {};
  const key = wrap.dataset.warningImg;
  const src = config[key];
  if (!src) return;
  wrap.dataset.loaded = "1";
  wrap.innerHTML = "";
  const img = document.createElement("img");
  img.alt = wrap.getAttribute("aria-label") || "";
  img.className = "warning-custom-img";
    bindImageError(img, "");
    img.src = resolveImageUrl(src);
  wrap.classList.add("has-custom-img");
  wrap.appendChild(img);
}

/** 현재 슬라이드 ±1만 로드 — GitHub Pages 동시 요청·속도 제한 방지 */
const IMAGE_PRELOAD_RANGE = 1;

function loadImagesForSlide(slideIndex) {
  const slide = slides[slideIndex];
  if (!slide) return;
  slide.querySelectorAll("[data-img]").forEach(loadImgElement);
  slide.querySelectorAll("[data-warning-img]").forEach(loadWarningImgWrap);
}

function loadImagesNear(index) {
  const from = Math.max(0, index - IMAGE_PRELOAD_RANGE);
  const to = Math.min(slides.length - 1, index + IMAGE_PRELOAD_RANGE);
  for (let i = from; i <= to; i++) loadImagesForSlide(i);
}

function applyImages() {
  loadImagesNear(current);
}

let imageLightboxEl = null;
let imageLightboxOpen = false;

function isZoomableSlideImage(img) {
  if (!img?.closest(".slide")) return false;
  const src = (img.currentSrc || img.src || "").toLowerCase();
  if (!src || src.includes("/placeholders/") || src.endsWith(".svg")) return false;
  if (!img.complete || img.naturalWidth === 0) return false;
  return true;
}

function refreshZoomableImages(root = document.getElementById("deck")) {
  if (!root) return;
  root.querySelectorAll(".slide img").forEach((img) => {
    img.classList.toggle("img-zoomable", isZoomableSlideImage(img));
  });
}

function ensureImageLightbox() {
  if (imageLightboxEl) return imageLightboxEl;

  const el = document.createElement("div");
  el.id = "img-lightbox";
  el.className = "img-lightbox";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "이미지 확대");
  el.innerHTML =
    '<button type="button" class="img-lightbox-close" aria-label="닫기">&times;</button>' +
    '<img class="img-lightbox-photo" alt="" />' +
    '<p class="img-lightbox-caption" hidden></p>';

  el.addEventListener("click", (e) => {
    if (e.target === el) closeImageLightbox();
  });
  el.querySelector(".img-lightbox-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeImageLightbox();
  });

  document.body.appendChild(el);
  imageLightboxEl = el;
  return el;
}

function openImageLightbox(img) {
  if (!isZoomableSlideImage(img)) return;

  const box = ensureImageLightbox();
  const photo = box.querySelector(".img-lightbox-photo");
  const caption = box.querySelector(".img-lightbox-caption");
  const figcaption = img.closest("figure")?.querySelector("figcaption")?.textContent?.trim();

  photo.src = img.currentSrc || img.src;
  photo.alt = img.alt || "";

  if (figcaption) {
    caption.textContent = figcaption;
    caption.hidden = false;
  } else if (img.alt) {
    caption.textContent = img.alt;
    caption.hidden = false;
  } else {
    caption.textContent = "";
    caption.hidden = true;
  }

  box.hidden = false;
  imageLightboxOpen = true;
  document.body.classList.add("img-lightbox-open");
}

function closeImageLightbox() {
  if (!imageLightboxEl || !imageLightboxOpen) return;
  imageLightboxEl.hidden = true;
  imageLightboxOpen = false;
  document.body.classList.remove("img-lightbox-open");
  const photo = imageLightboxEl.querySelector(".img-lightbox-photo");
  photo.removeAttribute("src");
}

function initImageLightbox() {
  const deck = document.getElementById("deck");
  if (!deck) return;

  deck.addEventListener(
    "click",
    (e) => {
      if (textEditEnabled || imageLightboxOpen) return;
      const img = e.target.closest("img");
      if (!img || !img.classList.contains("img-zoomable")) return;
      e.stopPropagation();
      e.preventDefault();
      openImageLightbox(img);
    },
    true
  );

  deck.addEventListener(
    "load",
    (e) => {
      if (e.target.tagName === "IMG") refreshZoomableImages(deck);
    },
    true
  );

  refreshZoomableImages(deck);
}

function showSlide(index) {
  slides.forEach((slide, i) => {
    slide.classList.remove("active", "prev");
    if (i === index) slide.classList.add("active");
    else if (i < index) slide.classList.add("prev");
  });
  current = index;
  const pageLabel = `${current + 1} / ${slides.length}`;
  if (counter) counter.textContent = pageLabel;
  if (fsCounter) fsCounter.textContent = pageLabel;
  saveSlideIndex();
  refreshTopicTracker();
  refreshFontDebug();
  refreshRemInputs();
  loadImagesNear(index);
  refreshZoomableImages();
}

function getSlideTopicInfo(index) {
  const slide = slides[index];
  if (!slide?.dataset.day || !slide.dataset.topic) return null;
  return {
    day: parseInt(slide.dataset.day, 10),
    topic: slide.dataset.topic,
  };
}

function getNextTopicFrom(index) {
  const current = getSlideTopicInfo(index);
  if (!current) return null;

  const next = getSlideTopicInfo(index + 1);
  if (
    next &&
    next.day === current.day &&
    next.topic !== current.topic
  ) {
    return next.topic;
  }
  return null;
}

function createTopicTracker() {
  const tracker = document.createElement("div");
  tracker.className = "topic-tracker";
  tracker.setAttribute("aria-label", "과목 진행");
  tracker.hidden = true;
  return tracker;
}

function initTopicTrackers() {
  slides.forEach((slide) => {
    if (!slide.dataset.day) return;

    if (slide.dataset.topicIntro) {
      const inner = slide.querySelector(".slide-inner");
      if (!inner || inner.querySelector(".topic-tracker")) return;
      const tracker = createTopicTracker();
      tracker.classList.add("topic-tracker-section");
      inner.appendChild(tracker);
      return;
    }

    const header = slide.querySelector(".slide-header");
    const h2 = header?.querySelector("h2");
    if (!header || !h2 || header.querySelector(".topic-tracker")) return;

    const row = document.createElement("div");
    row.className = "slide-header-row";
    header.insertBefore(row, h2);
    row.appendChild(h2);

    row.appendChild(createTopicTracker());
  });
}

function refreshTopicTracker() {
  document.querySelectorAll(".topic-tracker").forEach((tracker) => {
    tracker.hidden = true;
    tracker.replaceChildren();
  });

  const info = getSlideTopicInfo(current);
  const tracker = slides[current]?.querySelector(".topic-tracker");
  if (!info || !tracker) return;

  const topics = DAY_TOPICS[info.day];
  if (!topics) return;

  const nextTopic = getNextTopicFrom(current);

  topics.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "topic-chip";
    chip.textContent = name;
    if (name === info.topic) chip.classList.add("active");
    else if (name === nextTopic) chip.classList.add("next");
    tracker.appendChild(chip);
  });

  tracker.hidden = false;
}

function saveSlideIndex() {
  try {
    sessionStorage.setItem(SLIDE_INDEX_STORAGE_KEY, String(current));
  } catch (_) {
    /* sessionStorage unavailable */
  }
}

function isPresentationMode() {
  return document.documentElement.classList.contains("presentation-mode");
}

function isDeckExpanded() {
  return isFullscreen() || isPresentationMode();
}

function setPresentationMode(enabled) {
  document.documentElement.classList.toggle("presentation-mode", enabled);
  try {
    sessionStorage.setItem(PRESENTATION_STORAGE_KEY, enabled ? "1" : "0");
  } catch (_) {
    /* sessionStorage unavailable */
  }
  syncDeckView();
}

function syncDeckView() {
  document.body.classList.toggle("is-fullscreen", isDeckExpanded());
  updateDeckScale();
  refreshFontDebug();
}

function hasDirectText(el) {
  return [...el.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
  );
}

function formatFontSize(styles) {
  const px = parseFloat(styles.fontSize);
  if (!Number.isFinite(px)) return "";
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const rem = px / rootPx;
  return `${Math.round(px)}px · ${rem.toFixed(2)}rem`;
}

function clearFontDebugBadges() {
  document.querySelectorAll(".font-size-badge").forEach((badge) => badge.remove());
  document.querySelectorAll(".font-debug-target").forEach((el) => {
    el.classList.remove("font-debug-target");
  });
}

function refreshFontDebug() {
  clearFontDebugBadges();
  if (!fontDebugEnabled) return;

  const slide = slides[current];
  if (!slide) return;

  slide.querySelectorAll(FONT_DEBUG_SELECTORS).forEach((el) => {
    if (el.closest(".controls, .fs-home-btn, .fs-font-debug-btn, .font-size-badge")) return;
    if (el.classList.contains("font-size-badge")) return;
    if (!el.textContent.trim() || !hasDirectText(el)) return;

    const styles = getComputedStyle(el);
    if (styles.display === "none" || styles.visibility === "hidden") return;

    const label = formatFontSize(styles);
    if (!label) return;

    el.classList.add("font-debug-target");
    const badge = document.createElement("span");
    badge.className = "font-size-badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = label;
    el.appendChild(badge);
  });
}

function syncFontDebugButtons(enabled) {
  const pressed = enabled ? "true" : "false";
  const title = enabled
    ? "폰트 크기 표시 끄기 (D)"
    : "폰트 크기 표시 켜기 (D)";
  [fontDebugToggle, fsFontDebugBtn].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute("aria-pressed", pressed);
    btn.title = title;
  });
}

function setFontDebugEnabled(enabled) {
  fontDebugEnabled = enabled;
  document.body.classList.toggle("font-debug-on", enabled);
  syncFontDebugButtons(enabled);
  try {
    localStorage.setItem(FONT_DEBUG_STORAGE_KEY, enabled ? "1" : "0");
  } catch (_) {
    /* localStorage unavailable */
  }
  refreshFontDebug();
}

function toggleFontDebug() {
  setFontDebugEnabled(!fontDebugEnabled);
}

function isTextEditExcluded(el) {
  return !!el.closest(
    ".controls, .fs-home-btn, .fs-font-debug-btn, .fs-text-edit-btn, .fs-text-export-btn, button.day-go, button.day-pdf, .font-size-badge, .rem-edit-input"
  );
}

function collectEditableBlocks(slide) {
  const nodes = [...slide.querySelectorAll(TEXT_EDIT_SELECTORS)].filter(
    (el) => !isTextEditExcluded(el)
  );
  return nodes.filter(
    (el) => !nodes.some((other) => other !== el && other.contains(el))
  );
}

function inferEditHint(el) {
  if (el.classList.contains("lead")) return "lead";
  if (el.classList.contains("tip-box")) return "tip-box";
  if (el.classList.contains("highlight-box")) return "highlight-box";
  if (el.classList.contains("step-num")) return "step-num";
  if (el.classList.contains("light-label")) return "light-label";
  if (el.classList.contains("schedule-lead")) return "schedule-lead";
  if (el.classList.contains("day-label")) return "day-label";
  if (el.classList.contains("day-title")) return "day-title";
  if (el.classList.contains("intro-panel-lead")) return "intro-panel-lead";
  if (el.closest(".step-card-text")) return "step-text";
  if (el.closest(".warning-item-text")) return "warning-text";
  if (el.tagName === "H1") return "h1";
  if (el.tagName === "H2") return "h2";
  if (el.tagName === "H3") return "h3";
  if (el.tagName === "LI") return "li";
  if (el.tagName === "P") return "p";
  return el.tagName.toLowerCase();
}

function initTextEditTargets() {
  slides.forEach((slide, slideIndex) => {
    const slideKey = slide.id || `slide-${slideIndex}`;
    const hintCounts = {};

    collectEditableBlocks(slide).forEach((el) => {
      const hint = inferEditHint(el);
      const n = hintCounts[hint] || 0;
      hintCounts[hint] = n + 1;
      el.dataset.editId = `${slideKey}:${hint}:${n}`;
    });
  });
}

function hasEditEntries(obj) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

function loadTextEdits() {
  try {
    return JSON.parse(localStorage.getItem(TEXT_EDIT_STORAGE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveTextEdit(id, html) {
  if (!id) return;
  try {
    const edits = loadTextEdits();
    edits[id] = html;
    localStorage.setItem(TEXT_EDIT_STORAGE_KEY, JSON.stringify(edits));
  } catch (_) {
    /* localStorage unavailable */
  }
}

function collectCurrentTextEdits() {
  const edits = {};
  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    edits[el.dataset.editId] = el.innerHTML;
  });
  return edits;
}

function applyTextEditsObject(edits) {
  if (!edits || typeof edits !== "object") return;
  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    const saved = edits[el.dataset.editId];
    if (saved !== undefined) {
      el.innerHTML = saved;
    }
  });
}

function migrateAndApplyTextEdits() {
  const edits = loadTextEdits();
  if (!hasEditEntries(edits)) return;

  const migrated = { ...edits };
  let changed = false;

  slides.forEach((slide, slideIndex) => {
    collectEditableBlocks(slide).forEach((el, i) => {
      const legacyId = `s${slideIndex}-${i}`;
      const newId = el.dataset.editId;
      if (
        legacyId !== newId &&
        edits[legacyId] !== undefined &&
        migrated[newId] === undefined
      ) {
        migrated[newId] = edits[legacyId];
        changed = true;
      }
    });
  });

  applyTextEditsObject(migrated);

  if (changed) {
    try {
      localStorage.setItem(TEXT_EDIT_STORAGE_KEY, JSON.stringify(migrated));
    } catch (_) {
      /* localStorage unavailable */
    }
  }
}

function migrateAndApplyRemEdits() {
  const edits = loadRemEdits();
  if (!hasEditEntries(edits)) return;

  const migrated = { ...edits };
  let changed = false;

  slides.forEach((slide, slideIndex) => {
    collectEditableBlocks(slide).forEach((el, i) => {
      const legacyId = `s${slideIndex}-${i}`;
      const newId = el.dataset.editId;
      if (
        legacyId !== newId &&
        edits[legacyId] !== undefined &&
        migrated[newId] === undefined
      ) {
        migrated[newId] = edits[legacyId];
        changed = true;
      }
    });
  });

  applyRemEditsObject(migrated);

  if (changed) {
    try {
      localStorage.setItem(REM_EDIT_STORAGE_KEY, JSON.stringify(migrated));
    } catch (_) {
      /* localStorage unavailable */
    }
  }
}

async function mergeEditsFromProjectFile() {
  async function tryMerge(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();

      if (data.version || data.text !== undefined || data.rem !== undefined) {
        if (hasEditEntries(data.text)) {
          applyTextEditsObject(data.text);
          localStorage.setItem(TEXT_EDIT_STORAGE_KEY, JSON.stringify(data.text));
        }
        if (hasEditEntries(data.rem)) {
          applyRemEditsObject(data.rem);
        }
        return true;
      }

      if (hasEditEntries(data)) {
        localStorage.setItem(TEXT_EDIT_STORAGE_KEY, JSON.stringify(data));
        applyTextEditsObject(data);
        return true;
      }
    } catch (_) {
      /* project edit file unavailable */
    }
    return false;
  }

  const loaded = await tryMerge("slide-edits.json");
  if (!loaded && !hasEditEntries(loadTextEdits())) {
    await tryMerge("text-edits.json");
  }

  refreshRemInputs();
  refreshFontDebug();
}

async function loadEditsFromProjectFile() {
  return mergeEditsFromProjectFile();
}

function exportAllEditsToFile() {
  const text = collectCurrentTextEdits();
  const rem = collectCurrentRemEdits();

  try {
    localStorage.setItem(TEXT_EDIT_STORAGE_KEY, JSON.stringify(text));
    localStorage.setItem(REM_EDIT_STORAGE_KEY, JSON.stringify(rem));
  } catch (_) {
    /* localStorage unavailable */
  }

  const payload = { version: 1, text, rem };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "slide-edits.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportTextEditsToFile() {
  exportAllEditsToFile();
}

async function loadTextEditsFromProjectFile() {
  return loadEditsFromProjectFile();
}

function getComputedRem(el) {
  const px = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(px)) return "";
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return (px / rootPx).toFixed(2);
}

function loadRemEdits() {
  try {
    return JSON.parse(localStorage.getItem(REM_EDIT_STORAGE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveRemEdit(id, rem) {
  if (!id || !Number.isFinite(parseFloat(rem))) return;
  try {
    const edits = loadRemEdits();
    edits[id] = parseFloat(rem).toFixed(2);
    localStorage.setItem(REM_EDIT_STORAGE_KEY, JSON.stringify(edits));
  } catch (_) {
    /* localStorage unavailable */
  }
}

function collectCurrentRemEdits() {
  const edits = { ...loadRemEdits() };
  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    const id = el.dataset.editId;
    if (el.style.fontSize) {
      const rem = parseFloat(el.style.fontSize);
      if (Number.isFinite(rem)) {
        edits[id] = rem.toFixed(2);
      }
    }
  });
  return edits;
}

function applyRemEditsObject(remEdits) {
  if (!remEdits || typeof remEdits !== "object") return;
  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    const saved = remEdits[el.dataset.editId];
    if (saved !== undefined) {
      el.style.fontSize = `${parseFloat(saved)}rem`;
    }
  });
  try {
    localStorage.setItem(REM_EDIT_STORAGE_KEY, JSON.stringify(remEdits));
  } catch (_) {
    /* localStorage unavailable */
  }
}

function clearRemInputs() {
  document.querySelectorAll(".rem-edit-input").forEach((input) => input.remove());
  document.querySelectorAll(".rem-edit-target").forEach((el) => {
    el.classList.remove("rem-edit-target");
  });
}

function applyRemToElement(el, value) {
  const rem = parseFloat(value);
  if (!Number.isFinite(rem) || rem <= 0) return;
  el.style.fontSize = `${rem}rem`;
  saveRemEdit(el.dataset.editId, rem);
}

function refreshRemInputs() {
  clearRemInputs();
  if (!textEditEnabled) return;

  const slide = slides[current];
  if (!slide) return;

  slide.querySelectorAll("[data-edit-id]").forEach((el) => {
    if (isTextEditExcluded(el)) return;
    if (!el.textContent.trim()) return;

    el.classList.add("rem-edit-target");

    const input = document.createElement("input");
    input.type = "number";
    input.className = "rem-edit-input";
    input.step = "0.05";
    input.min = "0.5";
    input.max = "6";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", "글자 크기 rem");

    const saved = loadRemEdits()[el.dataset.editId];
    input.value = saved !== undefined ? saved : getComputedRem(el);

    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("mousedown", (e) => e.stopPropagation());
    input.addEventListener("change", () => applyRemToElement(el, input.value));
    input.addEventListener("keydown", (e) => e.stopPropagation());

    el.appendChild(input);
  });
}

function applyStoredTextEdits() {
  migrateAndApplyTextEdits();
}

function applyStoredRemEdits() {
  migrateAndApplyRemEdits();
}

function scheduleTextEditSave(el) {
  clearTimeout(textEditSaveTimer);
  textEditSaveTimer = setTimeout(() => {
    saveTextEdit(el.dataset.editId, el.innerHTML);
  }, 250);
}

function bindTextEditListeners() {
  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    if (el.dataset.editBound === "1") return;
    el.dataset.editBound = "1";
    el.addEventListener("input", () => scheduleTextEditSave(el));
    el.addEventListener("blur", () => saveTextEdit(el.dataset.editId, el.innerHTML));
  });
}

function syncTextEditButtons(enabled) {
  const pressed = enabled ? "true" : "false";
  const title = enabled ? "텍스트 편집 끄기 (E)" : "텍스트 편집 켜기 (E)";
  [textEditToggle, fsTextEditBtn].forEach((btn) => {
    if (!btn) return;
    btn.setAttribute("aria-pressed", pressed);
    btn.title = title;
  });
  if (textEditHint) {
    textEditHint.hidden = !enabled;
  }
  if (fsTextExportBtn) {
    fsTextExportBtn.hidden = !enabled;
  }
}

function setTextEditEnabled(enabled) {
  textEditEnabled = enabled;
  document.body.classList.toggle("text-edit-on", enabled);
  syncTextEditButtons(enabled);

  document.querySelectorAll("[data-edit-id]").forEach((el) => {
    el.contentEditable = enabled ? "true" : "false";
    el.spellcheck = false;
  });

  try {
    localStorage.setItem(TEXT_EDIT_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch (_) {
    /* localStorage unavailable */
  }

  if (enabled && fontDebugEnabled) {
    setFontDebugEnabled(false);
  }
  refreshRemInputs();
}

function toggleTextEdit() {
  setTextEditEnabled(!textEditEnabled);
}

function isEditingText() {
  return textEditEnabled && document.activeElement?.isContentEditable;
}

function isDayEndSlide(index = current) {
  const slide = slides[index];
  return !!slide?.dataset?.dayEnd;
}

function next() {
  if (isDayEndSlide()) return;
  if (current < slides.length - 1) showSlide(current + 1);
}

function prev() {
  if (current > 0) showSlide(current - 1);
}

prevBtn.addEventListener("click", prev);
nextBtn.addEventListener("click", next);
menuBtn.addEventListener("click", goToSchedule);
if (fsHomeBtn) fsHomeBtn.addEventListener("click", goToSchedule);

function isNavExcluded(target) {
  return !!target.closest(
    "button, a, input, select, textarea, .controls, .fs-home-btn, .fs-font-debug-btn, .fs-text-edit-btn, .fs-text-export-btn, .font-debug-toggle, .text-edit-toggle, .rem-edit-input, .img-lightbox, .img-zoomable, [contenteditable='true']"
  );
}

function isFullscreen() {
  return !!document.fullscreenElement;
}

function updateDeckScale() {
  const root = document.documentElement;

  if (!isDeckExpanded()) {
    root.style.setProperty("--deck-scale", "1");
    root.removeAttribute("data-deck-scaled");
    return;
  }

  const scale = Math.min(
    window.innerWidth / DECK_REF.width,
    window.innerHeight / DECK_REF.height
  );
  root.style.setProperty("--deck-scale", String(scale));
  root.setAttribute("data-deck-scaled", "");
}

document.addEventListener("click", (e) => {
  if (!isDeckExpanded()) return;
  if (textEditEnabled) return;
  if (e.button !== 0) return;
  if (isNavExcluded(e.target)) return;
  if (isDayEndSlide()) return;
  next();
});

document.addEventListener("contextmenu", (e) => {
  if (!isDeckExpanded()) return;
  if (textEditEnabled) return;
  if (isNavExcluded(e.target)) return;
  e.preventDefault();
  prev();
});

document.addEventListener("fullscreenchange", () => {
  syncDeckView();
});

if (fontDebugToggle) {
  fontDebugToggle.addEventListener("click", toggleFontDebug);
}
if (fsFontDebugBtn) {
  fsFontDebugBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFontDebug();
  });
}
if (fsTextEditBtn) {
  fsTextEditBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTextEdit();
  });
}
if (textEditToggle) {
  textEditToggle.addEventListener("click", toggleTextEdit);
}
if (fsTextExportBtn) {
  fsTextExportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportAllEditsToFile();
  });
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    updateDeckScale();
    if (fontDebugEnabled) refreshFontDebug();
    if (textEditEnabled) refreshRemInputs();
  }, 150);
});

document.querySelectorAll("[data-goto-day]").forEach((btn) => {
  btn.addEventListener("click", () => goToDay(btn.dataset.gotoDay));
});

document.querySelectorAll("[data-pdf-day]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadDayPdf(btn.dataset.pdfDay);
  });
});

function toggleDeckExpanded() {
  const want = !isDeckExpanded();
  if (want) {
    setPresentationMode(true);
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    setPresentationMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

fullscreenBtn.addEventListener("click", toggleDeckExpanded);

document.addEventListener("keydown", (e) => {
  if (imageLightboxOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeImageLightbox();
    }
    return;
  }

  if (e.target?.classList?.contains("rem-edit-input")) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.target.blur();
    }
    return;
  }

  if (isEditingText()) {
    if (e.key === "Escape") {
      e.preventDefault();
      document.activeElement.blur();
      setTextEditEnabled(false);
    }
    return;
  }

  if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
    e.preventDefault();
    prev();
  } else if (e.key === "Escape" && isDeckExpanded() && !textEditEnabled) {
    e.preventDefault();
    setPresentationMode(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    toggleDeckExpanded();
  } else if (e.key === "Home") {
    e.preventDefault();
    goToSchedule();
  } else if (e.key === "d" || e.key === "D") {
    e.preventDefault();
    toggleFontDebug();
  } else if (e.key === "e" || e.key === "E") {
    e.preventDefault();
    toggleTextEdit();
  }
});

// 터치 스와이프
let touchStartX = 0;
document.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
});
document.addEventListener("touchend", (e) => {
  if (imageLightboxOpen) return;
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) <= 50) return;
  if (diff > 0) {
    if (!isDayEndSlide()) next();
  } else {
    prev();
  }
});

applyImages();
initImageLightbox();
initTopicTrackers();
initTextEditTargets();
applyStoredTextEdits();
applyStoredRemEdits();
bindTextEditListeners();
loadEditsFromProjectFile();

function restoreSessionView() {
  let index = 0;
  try {
    const saved = sessionStorage.getItem(SLIDE_INDEX_STORAGE_KEY);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed < slides.length) {
        index = parsed;
      }
    }
  } catch (_) {
    /* sessionStorage unavailable */
  }
  showSlide(index);

  try {
    if (sessionStorage.getItem(PRESENTATION_STORAGE_KEY) === "1") {
      setPresentationMode(true);
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (_) {
    /* sessionStorage unavailable */
  }
}

restoreSessionView();

try {
  setFontDebugEnabled(localStorage.getItem(FONT_DEBUG_STORAGE_KEY) === "1");
} catch (_) {
  setFontDebugEnabled(false);
}

try {
  setTextEditEnabled(localStorage.getItem(TEXT_EDIT_MODE_STORAGE_KEY) === "1");
} catch (_) {
  setTextEditEnabled(false);
}
