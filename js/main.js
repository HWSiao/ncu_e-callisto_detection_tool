// --- DOM Elements ---
const fitsInput = document.getElementById('fitsInput');
const fileInfo = document.getElementById('fileInfo');
const fileNamesList = document.getElementById('fileNamesList');
const fileCountBadge = document.getElementById('fileCountBadge');
const currentTileLabel = document.getElementById('currentTileLabel');
const boxCount = document.getElementById('boxCount');
const boxCountBadge = document.getElementById('boxCountBadge');
const exportCount = document.getElementById('exportCount');
const windowRangeLabel = document.getElementById('windowRangeLabel');
const timeSlider = document.getElementById('timeSlider');
const timeSliderVal = document.getElementById('timeSliderVal');
const prevTileBtn = document.getElementById('prevTileBtn');
const nextTileBtn = document.getElementById('nextTileBtn');
const clearBoxesBtn = document.getElementById('clearBoxesBtn');
const exportYoloBtn = document.getElementById('exportYoloBtn');
const placeholderOverlay = document.getElementById('placeholderOverlay');
const enableRfi = document.getElementById('enableRfi');
const sliderContrast = document.getElementById('sliderContrast');
const valContrast = document.getElementById('valContrast');
const sliderHorizontal = document.getElementById('sliderHorizontal');
const valHorizontal = document.getElementById('valHorizontal');
const colormapSelect = document.getElementById('colormapSelect');
const reprocessBtn = document.getElementById('reprocessBtn');
const resetRfiBtn = document.getElementById('resetRfiBtn');
const bboxList = document.getElementById('bboxList');
const yoloPreview = document.getElementById('yoloPreview');

const specCanvas = document.getElementById('spectrumCanvas');
const specCtx = specCanvas.getContext('2d');
const interactCanvas = document.getElementById('interactionCanvas');
const interactCtx = interactCanvas.getContext('2d');

// Layout Containers for Mobile RWD
const sidebarLeft = document.getElementById('sidebarLeft');
const sidebarRight = document.getElementById('sidebarRight');
const mainCanvasArea = document.getElementById('mainCanvasArea');

// --- Global State ---
let currentRawFitsData = null; // Float32Array
let fullTimeSteps = 0;
let windowSize = 600; // 5-minute slice at 2 samples/sec
let currentStartStep = 0;
let currentTileIdx = 0;
let totalTiles = 1;
let baseObservationDate = null;
let currentFileName = "";
let exportedCounter = 0;
let currentMinFreq = 45.0;
let currentMaxFreq = 80.81;

let isDrawing = false;
let startX = 0;
let startY = 0;
let currentRect = null;
let boundingBoxes = [];

const classColors = {
  "0": { stroke: "#6b7280", fill: "rgba(107, 114, 128, 0.2)", label: "RFI" },
  "1": { stroke: "#3b82f6", fill: "rgba(59, 130, 246, 0.2)", label: "Type I" },
  "2": { stroke: "#f43f5e", fill: "rgba(244, 63, 94, 0.2)", label: "Type II" },
  "3": { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.2)", label: "Type III" },
  "4": { stroke: "#a855f7", fill: "rgba(168, 85, 247, 0.2)", label: "Type IV" },
  "5": { stroke: "#06b6d4", fill: "rgba(6, 182, 212, 0.2)", label: "Type V" },
  "6": { stroke: "#10b981", fill: "rgba(16, 185, 129, 0.2)", label: "Other" }
};

function getClassStyle(classId) {
  return classColors[classId] || { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.2)", label: `Class ${classId}` };
}

// --- Mobile Responsive View Navigation ---
function switchMobileTab(tab) {
  const btnControls = document.getElementById('tabControlsBtn');
  const btnCanvas = document.getElementById('tabCanvasBtn');
  const btnBoxes = document.getElementById('tabBoxesBtn');

  [btnControls, btnCanvas, btnBoxes].forEach(btn => {
    btn.className = "px-2.5 py-1 rounded-md text-slate-400 transition flex items-center gap-1";
  });

  if (tab === 'controls') {
    sidebarLeft.classList.remove('hidden');
    sidebarRight.classList.add('hidden');
    mainCanvasArea.classList.add('hidden');
    btnControls.className = "px-2.5 py-1 rounded-md text-amber-400 font-semibold bg-slate-800 transition flex items-center gap-1";
  } else if (tab === 'canvas') {
    sidebarLeft.classList.add('hidden');
    sidebarRight.classList.add('hidden');
    mainCanvasArea.classList.remove('hidden');
    btnCanvas.className = "px-2.5 py-1 rounded-md text-amber-400 font-semibold bg-slate-800 transition flex items-center gap-1";
  } else if (tab === 'boxes') {
    sidebarLeft.classList.add('hidden');
    sidebarRight.classList.remove('hidden');
    mainCanvasArea.classList.add('hidden');
    btnBoxes.className = "px-2.5 py-1 rounded-md text-amber-400 font-semibold bg-slate-800 transition flex items-center gap-1";
  }
}

// Handle screen resize to reset mobile display overrides on desktop
window.addEventListener('resize', () => {
  if (window.innerWidth >= 1024) {
    sidebarLeft.classList.remove('hidden');
    sidebarRight.classList.remove('hidden');
    mainCanvasArea.classList.remove('hidden');
  }
});

function getPercentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = Float32Array.from(arr).sort();
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[index];
}

function linearInterp(x, xArr, yArr) {
  if (!xArr || xArr.length === 0) return 0;
  if (x <= xArr[0]) return yArr[0];
  if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
  for (let i = 0; i < xArr.length - 1; i++) {
    if (x >= xArr[i] && x <= xArr[i + 1]) {
      const t = (x - xArr[i]) / (xArr[i + 1] - xArr[i]);
      return yArr[i] + t * (yArr[i + 1] - yArr[i]);
    }
  }
  return 0;
}

function getColormapRgb(val, type) {
  val = Math.max(0, Math.min(1, val));
  if (type === "grayscale") {
    const c = Math.floor(val * 255);
    return [c, c, c];
  }
  let r, g, b;
  if (val < 0.25) {
    r = Math.floor(val * 4 * 120);
    g = Math.floor(val * 4 * 15);
    b = Math.floor(val * 4 * 80);
  } else if (val < 0.5) {
    const t = (val - 0.25) * 4;
    r = Math.floor(120 + t * 90);
    g = Math.floor(15 + t * 35);
    b = Math.floor(80 - t * 40);
  } else if (val < 0.75) {
    const t = (val - 0.5) * 4;
    r = Math.floor(210 + t * 35);
    g = Math.floor(50 + t * 110);
    b = Math.floor(40 - t * 20);
  } else {
    const t = (val - 0.75) * 4;
    r = Math.floor(245 + t * 10);
    g = Math.floor(160 + t * 95);
    b = Math.floor(20 + t * 180);
  }
  return [r, g, b];
}

// Callisto FITS Parser
function parseFitsBuffer(buffer) {
  const view = new DataView(buffer);
  let offset = 0;

  function parseHeaderBlock() {
    let header = {};
    while (offset < buffer.byteLength) {
      let card = "";
      for (let i = 0; i < 80; i++) {
        card += String.fromCharCode(view.getUint8(offset + i));
      }
      offset += 80;

      const eqIdx = card.indexOf("=");
      if (eqIdx !== -1) {
        const key = card.substring(0, eqIdx).trim();
        const valStr = card.substring(eqIdx + 1).split("/")[0].trim().replace(/^'|'$/g, '');
        header[key] = valStr;
      }

      if (card.startsWith("END")) {
        offset = Math.ceil(offset / 2880) * 2880;
        break;
      }
    }
    return header;
  }

  // HDU 0: Primary Spectrum Array
  const hdu0Header = parseHeaderBlock();
  const naxis1_0 = parseInt(hdu0Header["NAXIS1"] || "0", 10);
  const naxis2_0 = parseInt(hdu0Header["NAXIS2"] || "0", 10);
  const bitpix0 = parseInt(hdu0Header["BITPIX"] || "-32", 10);

  let hdu0Data = null;
  if (naxis1_0 > 0 && naxis2_0 > 0) {
    const totalPixels = naxis1_0 * naxis2_0;
    hdu0Data = new Float32Array(totalPixels);
    for (let i = 0; i < totalPixels; i++) {
      if (offset >= buffer.byteLength) break;
      let val = 0;
      if (bitpix0 === -32) {
        val = view.getFloat32(offset, false);
        offset += 4;
      } else if (bitpix0 === 16) {
        val = view.getInt16(offset, false);
        offset += 2;
      } else {
        val = view.getUint8(offset);
        offset += 1;
      }
      hdu0Data[i] = (isNaN(val) || !isFinite(val)) ? 0 : val;
    }
    offset = Math.ceil(offset / 2880) * 2880;
  }

  // HDU 1: BINTABLE Extension (Frequency Vector)
  let freqArray = [];
  if (offset < buffer.byteLength) {
    const hdu1Header = parseHeaderBlock();
    const naxis1_1 = parseInt(hdu1Header["NAXIS1"] || "0", 10);
    const naxis2_1 = parseInt(hdu1Header["NAXIS2"] || "0", 10);

    if (naxis1_1 > 0 && naxis2_1 > 0) {
      const tableStart = offset;
      const candidates = [];
      for (let p = 0; p < naxis1_1 * naxis2_1; p += 4) {
        if (tableStart + p + 4 <= buffer.byteLength) {
          const val = view.getFloat32(tableStart + p, false);
          if (!isNaN(val) && isFinite(val) && val >= 30.0 && val <= 120.0) {
            candidates.push(val);
          }
        }
      }

      if (candidates.length >= naxis2_0) {
        freqArray = candidates.slice(0, naxis2_0);
      }
    }
  }

  return {
    width: naxis1_0 || 3600,
    height: naxis2_0 || 200,
    data: hdu0Data,
    freqRaw: freqArray.length > 0 ? freqArray : null
  };
}

// FITS Alignment Pipeline
function processAndAlignFits(parsed) {
  const rawWidth = parsed.width;
  const rawHeight = parsed.height;
  const rawData = parsed.data;

  // Recover hardcoded data[:-8] truncation
  const trimHeight = Math.max(1, rawHeight - 8);

  let freqRaw = [];
  if (parsed.freqRaw && parsed.freqRaw.length >= trimHeight) {
    for (let i = 0; i < trimHeight; i++) {
      freqRaw.push(parsed.freqRaw[i]);
    }
  } else {
    // Fallback default e-CALLISTO TAIWAN-NCU bounds (80.81 down to 45.00 MHz)
    for (let i = 0; i < trimHeight; i++) {
      freqRaw.push(80.81 - (i / Math.max(1, trimHeight - 1)) * (80.81 - 45.00));
    }
  }

  const activeHeight = freqRaw.length;
  const minFreq = Math.min(...freqRaw);
  const maxFreq = Math.max(...freqRaw);

  let freqPairs = freqRaw.map((f, idx) => ({ freq: f, origRow: idx }));
  freqPairs.sort((a, b) => a.freq - b.freq);

  const freqAsc = freqPairs.map(p => p.freq);
  const rowIndicesAsc = freqPairs.map(p => p.origRow);

  const nTimeResampled = Math.floor(rawWidth / 2);
  const timeResampledData = new Float32Array(activeHeight * nTimeResampled);

  for (let y = 0; y < activeHeight; y++) {
    for (let t = 0; t < nTimeResampled; t++) {
      const t1 = rawData[y * rawWidth + (t * 2)];
      const t2 = rawData[y * rawWidth + (t * 2 + 1)];
      timeResampledData[y * nTimeResampled + t] = ((isNaN(t1)?0:t1) + (isNaN(t2)?0:t2)) / 2.0;
    }
  }

  const targetFreqs = new Float32Array(640);
  for (let i = 0; i < 640; i++) {
    targetFreqs[i] = maxFreq - (i / 639) * (maxFreq - minFreq);
  }

  const freqAlignedData = new Float32Array(640 * nTimeResampled);
  const colBuffer = new Float32Array(activeHeight);

  for (let t = 0; t < nTimeResampled; t++) {
    for (let i = 0; i < activeHeight; i++) {
      const srcRow = rowIndicesAsc[i];
      colBuffer[i] = timeResampledData[srcRow * nTimeResampled + t];
    }

    for (let f = 0; f < 640; f++) {
      freqAlignedData[f * nTimeResampled + t] = linearInterp(targetFreqs[f], freqAsc, colBuffer);
    }
  }

  return {
    alignedData: freqAlignedData,
    timeSteps: nTimeResampled,
    minFreq: minFreq,
    maxFreq: maxFreq
  };
}

function extractFileDate(fileObj) {
  const fileName = fileObj.name;
  const match = fileName.match(/(\d{8})_(\d{6})/);
  if (!match) return null;

  const dStr = match[1];
  const tStr = match[2];

  const yr = parseInt(dStr.slice(0, 4), 10);
  const mo = parseInt(dStr.slice(4, 6), 10) - 1;
  const dy = parseInt(dStr.slice(6, 8), 10);
  const hr = parseInt(tStr.slice(0, 2), 10);
  const mi = parseInt(tStr.slice(2, 4), 10);
  const sc = parseInt(tStr.slice(4, 6), 10);

  const parsedDate = new Date(Date.UTC(yr, mo, dy, hr, mi, sc));
  if (isNaN(parsedDate.getTime())) return null;

  return { file: fileObj, date: parsedDate, name: fileName };
}

// File Loader Listener
fitsInput.addEventListener('change', async (e) => {
  const rawFiles = Array.from(e.target.files);
  if (!rawFiles || rawFiles.length === 0) return;

  if (rawFiles.length > 4) {
    showToast("⚠️ 上傳限制：一次最多只能上傳 4 個 FITS 檔案！", "error");
    fitsInput.value = "";
    return;
  }

  const parsedItems = [];
  for (const f of rawFiles) {
    const item = extractFileDate(f);
    if (item) {
      parsedItems.push(item);
    } else {
      parsedItems.push({ file: f, date: new Date(0), name: f.name });
    }
  }

  parsedItems.sort((a, b) => a.date - b.date);
  const files = parsedItems.map(item => item.file);

  if (parsedItems[0] && parsedItems[0].date.getTime() > 0) {
    baseObservationDate = parsedItems[0].date;
  } else {
    baseObservationDate = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  }
  
  fileNamesList.innerHTML = "";
  parsedItems.forEach((item, i) => {
    const badge = document.createElement('div');
    badge.className = "flex items-start gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200 leading-tight break-all font-mono";
    badge.innerHTML = `
      <span class="text-amber-400 font-bold shrink-0">${i + 1}.</span>
      <span class="select-all">${item.name}</span>
    `;
    fileNamesList.appendChild(badge);
  });

  fileCountBadge.innerText = `${files.length} file${files.length > 1 ? 's' : ''}`;
  fileCountBadge.classList.remove('hidden');
  fileInfo.classList.remove('hidden');

  // Check Time Continuity
  if (parsedItems.length > 1) {
    let isNonConsecutive = false;
    let gapInfo = "";

    for (let i = 0; i < parsedItems.length - 1; i++) {
      const item1 = parsedItems[i];
      const item2 = parsedItems[i + 1];

      if (item1.date.getTime() > 0 && item2.date.getTime() > 0) {
        const diffMinutes = Math.abs(item2.date - item1.date) / (1000 * 60);

        if (diffMinutes < 14 || diffMinutes > 16) {
          isNonConsecutive = true;
          gapInfo = `檔案「${item1.name}」與「${item2.name}」觀測時間間隔 ${Math.round(diffMinutes)} 分鐘（標準連續區間應為15分鐘）！`;
          break;
        }
      }
    }

    if (isNonConsecutive) {
      showToast(`⚠️ 警告：上傳之FIT為非連續時間資料！${gapInfo}`, "error");

      specCtx.fillStyle = "#0f172a";
      specCtx.fillRect(0, 0, 720, 700);

      specCtx.fillStyle = "#f43f5e";
      specCtx.font = "bold 20px Inter, sans-serif";
      specCtx.textAlign = "center";
      specCtx.fillText("Non-Consecutive Time Data Detected", 360, 340);

      specCtx.fillStyle = "#94a3b8";
      specCtx.font = "13px Inter, sans-serif";
      specCtx.fillText("Please upload consecutive 15-min FITS files.", 360, 370);

      placeholderOverlay.classList.add('hidden');
      currentRawFitsData = null;
      fitsInput.value = "";
      
      if (window.innerWidth < 1024) switchMobileTab('canvas');
      return;
    }
  }

  if (files.length === 1) {
    currentFileName = files[0].name.replace(/\.[^/.]+$/, "");
  } else {
    currentFileName = `${files[0].name.replace(/\.[^/.]+$/, "")}_to_${files[files.length - 1].name.replace(/\.[^/.]+$/, "")}`;
  }

  try {
    const alignedList = [];
    let totalTimeSteps = 0;

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const parsed = parseFitsBuffer(buffer);
      const aligned = processAndAlignFits(parsed);
      alignedList.push(aligned);
      totalTimeSteps += aligned.timeSteps;
      if (aligned.minFreq !== undefined) currentMinFreq = aligned.minFreq;
      if (aligned.maxFreq !== undefined) currentMaxFreq = aligned.maxFreq;
    }

    const mergedData = new Float32Array(640 * totalTimeSteps);
    let timeOffset = 0;

    for (const aligned of alignedList) {
      for (let f = 0; f < 640; f++) {
        for (let t = 0; t < aligned.timeSteps; t++) {
          const srcIdx = f * aligned.timeSteps + t;
          const destIdx = f * totalTimeSteps + (timeOffset + t);
          mergedData[destIdx] = aligned.alignedData[srcIdx];
        }
      }
      timeOffset += aligned.timeSteps;
    }

    currentRawFitsData = mergedData;
    fullTimeSteps = totalTimeSteps;

    currentStartStep = 0;
    const maxStartStep = Math.max(0, fullTimeSteps - windowSize);
    timeSlider.min = 0;
    timeSlider.max = maxStartStep;
    timeSlider.value = 0;
    timeSlider.disabled = maxStartStep === 0;

    totalTiles = Math.max(1, Math.ceil(fullTimeSteps / windowSize));
    currentTileIdx = 0;

    updateTimeWindowLabels();
    updateTileDropdownUI();

    placeholderOverlay.classList.add('hidden');
    processAndRenderSpectrum();

    // Switch automatically to canvas on mobile upon loading
    if (window.innerWidth < 1024) switchMobileTab('canvas');
  } catch (err) {
    console.error("FITS Processing Error:", err);
    showToast(`Error processing FITS: ${err.message}`, "error");
  }
});

function getObsTimeInfo(offsetSec) {
  if (!baseObservationDate) {
    const m = Math.floor(offsetSec / 60).toString().padStart(2, '0');
    const s = Math.floor(offsetSec % 60).toString().padStart(2, '0');
    return { display: `00:${m}:${s}`, raw: `00${m}${s}` };
  }

  const currentUtc = new Date(baseObservationDate.getTime() + offsetSec * 1000);
  const hh = currentUtc.getUTCHours().toString().padStart(2, '0');
  const mm = currentUtc.getUTCMinutes().toString().padStart(2, '0');
  const ss = currentUtc.getUTCSeconds().toString().padStart(2, '0');

  return { display: `${hh}:${mm}:${ss}`, raw: `${hh}${mm}${ss}` };
}

function getYYYYMMDDStr() {
  if (!baseObservationDate) return "YYYYMMDD";
  const yyyy = baseObservationDate.getUTCFullYear();
  const mm = (baseObservationDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = baseObservationDate.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function updateTimeWindowLabels() {
  const startSec = Math.floor(currentStartStep / 2);
  const endSec = Math.floor((currentStartStep + windowSize) / 2);

  const startTimeObj = getObsTimeInfo(startSec);
  const endTimeObj = getObsTimeInfo(endSec);

  let dateStr = "YYYY/MM/DD";
  if (baseObservationDate) {
    const yyyy = baseObservationDate.getUTCFullYear();
    const mm = (baseObservationDate.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = baseObservationDate.getUTCDate().toString().padStart(2, '0');
    dateStr = `${yyyy}/${mm}/${dd}`;
  }

  timeSliderVal.innerText = startTimeObj.display;
  windowRangeLabel.innerText = `${dateStr} ${startTimeObj.display} - ${endTimeObj.display} (5m)`;
}

function updateTileDropdownUI() {
  currentTileLabel.innerText = `${currentTileIdx + 1} / ${totalTiles}`;
  prevTileBtn.disabled = currentTileIdx === 0;
  nextTileBtn.disabled = currentTileIdx === totalTiles - 1;
}

timeSlider.addEventListener('input', (e) => {
  currentStartStep = parseInt(e.target.value, 10);
  updateTimeWindowLabels();
  processAndRenderSpectrum();
});

prevTileBtn.addEventListener('click', () => {
  if (currentTileIdx > 0) {
    currentTileIdx--;
    currentStartStep = currentTileIdx * windowSize;
    timeSlider.value = currentStartStep;
    updateTimeWindowLabels();
    boundingBoxes = [];
    updateTileDropdownUI();
    updateBoxUI();
    processAndRenderSpectrum();
  }
});

nextTileBtn.addEventListener('click', () => {
  if (currentTileIdx < totalTiles - 1) {
    currentTileIdx++;
    currentStartStep = currentTileIdx * windowSize;
    timeSlider.value = currentStartStep;
    updateTimeWindowLabels();
    boundingBoxes = [];
    updateTileDropdownUI();
    updateBoxUI();
    processAndRenderSpectrum();
  }
});

enableRfi.addEventListener('change', () => processAndRenderSpectrum());
sliderContrast.addEventListener('input', (e) => {
  valContrast.innerText = parseFloat(e.target.value).toFixed(1);
  processAndRenderSpectrum();
});
sliderHorizontal.addEventListener('input', (e) => {
  valHorizontal.innerText = parseFloat(e.target.value).toFixed(1);
  processAndRenderSpectrum();
});
colormapSelect.addEventListener('change', () => processAndRenderSpectrum());

reprocessBtn.addEventListener('click', () => {
  processAndRenderSpectrum();
  showToast("Applied RFI filters.", "info");
});

resetRfiBtn.addEventListener('click', () => {
  enableRfi.checked = true;
  sliderContrast.value = 2.0;
  valContrast.innerText = "2.0";
  sliderHorizontal.value = 1.0;
  valHorizontal.innerText = "1.0";
  colormapSelect.value = "inferno";
  processAndRenderSpectrum();
  showToast("Reset parameters.", "info");
});

// Spectrum Render Pipeline
function processAndRenderSpectrum() {
  if (!currentRawFitsData) return;

  const totalT = fullTimeSteps;
  const isRfiEnabled = enableRfi.checked;
  const contrastMult = parseFloat(sliderContrast.value);
  const horizCutoff = parseFloat(sliderHorizontal.value);

  const cleaned = new Float32Array(640 * totalT);

  if (!isRfiEnabled) {
    for (let i = 0; i < currentRawFitsData.length; i++) {
      cleaned[i] = currentRawFitsData[i];
    }
  } else {
    const channelMedians = new Float32Array(640);
    for (let f = 0; f < 640; f++) {
      const row = new Float32Array(totalT);
      for (let t = 0; t < totalT; t++) {
        row[t] = currentRawFitsData[f * totalT + t];
      }
      row.sort();
      channelMedians[f] = row[Math.floor(totalT / 2)];
    }

    for (let f = 0; f < 640; f++) {
      const med = channelMedians[f] * horizCutoff;
      for (let t = 0; t < totalT; t++) {
        const idx = f * totalT + t;
        const val = currentRawFitsData[idx] - med;
        cleaned[idx] = val > 0 ? val : 0;
      }
    }
  }

  const startT = currentStartStep;
  const endT = Math.min(startT + windowSize, totalT);
  const activeWindowWidth = endT - startT;

  const tileSlice = new Float32Array(640 * activeWindowWidth);
  for (let f = 0; f < 640; f++) {
    for (let t = 0; t < activeWindowWidth; t++) {
      tileSlice[f * activeWindowWidth + t] = cleaned[f * totalT + (startT + t)];
    }
  }

  const posValues = [];
  for (let i = 0; i < tileSlice.length; i++) {
    if (tileSlice[i] > 0) posValues.push(tileSlice[i]);
  }

  const vmin = posValues.length > 0 ? getPercentile(posValues, 1.0) : 0;
  const vmax = getPercentile(tileSlice, 99.5) * (contrastMult / 2.0);

  specCtx.fillStyle = "#020617";
  specCtx.fillRect(0, 0, 720, 700);

  const imgData = specCtx.createImageData(640, 640);
  const data = imgData.data;
  const cmap = colormapSelect.value;

  for (let cy = 0; cy < 640; cy++) {
    const fy = cy;
    for (let cx = 0; cx < 640; cx++) {
      const tx = Math.floor((cx / 640) * activeWindowWidth);
      const rawVal = tileSlice[fy * activeWindowWidth + tx];
      const normVal = Math.max(0, Math.min(1, (rawVal - vmin) / (vmax - vmin + 1e-6)));

      const [r, g, b] = getColormapRgb(normVal, cmap);
      const pixelIdx = (cy * 640 + cx) * 4;

      data[pixelIdx] = r;
      data[pixelIdx + 1] = g;
      data[pixelIdx + 2] = b;
      data[pixelIdx + 3] = 255;
    }
  }

  specCtx.putImageData(imgData, 50, 20);

  const startSec = Math.floor(currentStartStep / 2);
  drawSpectrumAxes(activeWindowWidth, startSec);
  redrawBoxes();
}

// Pure Clean 640x640 Spectrum Canvas for Export
function getCleanSpectrumCanvas() {
  if (!currentRawFitsData) return null;

  const totalT = fullTimeSteps;
  const isRfiEnabled = enableRfi.checked;
  const contrastMult = parseFloat(sliderContrast.value);
  const horizCutoff = parseFloat(sliderHorizontal.value);

  const cleaned = new Float32Array(640 * totalT);

  if (!isRfiEnabled) {
    for (let i = 0; i < currentRawFitsData.length; i++) {
      cleaned[i] = currentRawFitsData[i];
    }
  } else {
    const channelMedians = new Float32Array(640);
    for (let f = 0; f < 640; f++) {
      const row = new Float32Array(totalT);
      for (let t = 0; t < totalT; t++) {
        row[t] = currentRawFitsData[f * totalT + t];
      }
      row.sort();
      channelMedians[f] = row[Math.floor(totalT / 2)];
    }

    for (let f = 0; f < 640; f++) {
      const med = channelMedians[f] * horizCutoff;
      for (let t = 0; t < totalT; t++) {
        const idx = f * totalT + t;
        const val = currentRawFitsData[idx] - med;
        cleaned[idx] = val > 0 ? val : 0;
      }
    }
  }

  const startT = currentStartStep;
  const endT = Math.min(startT + windowSize, totalT);
  const activeWindowWidth = endT - startT;

  const tileSlice = new Float32Array(640 * activeWindowWidth);
  for (let f = 0; f < 640; f++) {
    for (let t = 0; t < activeWindowWidth; t++) {
      tileSlice[f * activeWindowWidth + t] = cleaned[f * totalT + (startT + t)];
    }
  }

  const posValues = [];
  for (let i = 0; i < tileSlice.length; i++) {
    if (tileSlice[i] > 0) posValues.push(tileSlice[i]);
  }

  const vmin = posValues.length > 0 ? getPercentile(posValues, 1.0) : 0;
  const vmax = getPercentile(tileSlice, 99.5) * (contrastMult / 2.0);

  const cleanCanvas = document.createElement('canvas');
  cleanCanvas.width = 640;
  cleanCanvas.height = 640;
  const cleanCtx = cleanCanvas.getContext('2d');

  const imgData = cleanCtx.createImageData(640, 640);
  const data = imgData.data;
  const cmap = colormapSelect.value;

  for (let cy = 0; cy < 640; cy++) {
    const fy = cy;
    for (let cx = 0; cx < 640; cx++) {
      const tx = Math.floor((cx / 640) * activeWindowWidth);
      const rawVal = tileSlice[fy * activeWindowWidth + tx];
      const normVal = Math.max(0, Math.min(1, (rawVal - vmin) / (vmax - vmin + 1e-6)));

      const [r, g, b] = getColormapRgb(normVal, cmap);
      const pixelIdx = (cy * 640 + cx) * 4;

      data[pixelIdx] = r;
      data[pixelIdx + 1] = g;
      data[pixelIdx + 2] = b;
      data[pixelIdx + 3] = 255;
    }
  }

  cleanCtx.putImageData(imgData, 0, 0);
  return cleanCanvas;
}

function drawSpectrumAxes(activeWindowWidth, startSec) {
  const offsetX = 50;
  const offsetY = 20;
  const specW = 640;
  const specH = 640;

  const minFreq = currentMinFreq;
  const maxFreq = currentMaxFreq;

  specCtx.save();
  specCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  specCtx.fillStyle = "#94a3b8";
  specCtx.lineWidth = 1;
  specCtx.font = "11px Inter, monospace";

  // Y-AXIS: Frequency
  const freqSteps = 10; 
  for (let i = 0; i <= freqSteps; i++) {
    const y = offsetY + (i / freqSteps) * specH;
    const freqVal = (maxFreq - (i / freqSteps) * (maxFreq - minFreq)).toFixed(1);

    specCtx.beginPath();
    specCtx.moveTo(offsetX, y);
    specCtx.lineTo(offsetX + specW, y);
    specCtx.stroke();

    specCtx.beginPath();
    specCtx.moveTo(offsetX - 5, y);
    specCtx.lineTo(offsetX, y);
    specCtx.stroke();

    specCtx.textAlign = "right";
    specCtx.textBaseline = "middle";
    specCtx.fillText(`${freqVal}`, offsetX - 10, y);
  }

  specCtx.fillStyle = "#f59e0b";
  specCtx.font = "bold 12px Inter, sans-serif";
  specCtx.textAlign = "center";
  specCtx.fillText("MHz", offsetX - 15, offsetY - 10);

  // X-AXIS: UTC Time
  const timeSteps = 5;
  specCtx.fillStyle = "#94a3b8";
  specCtx.font = "11px Inter, monospace";

  for (let i = 0; i <= timeSteps; i++) {
    const x = offsetX + (i / timeSteps) * specW;
    const tickSec = startSec + (i / timeSteps) * (activeWindowWidth / 2);
    const timeObj = getObsTimeInfo(tickSec);

    specCtx.beginPath();
    specCtx.moveTo(x, offsetY);
    specCtx.lineTo(x, offsetY + specH);
    specCtx.stroke();

    specCtx.beginPath();
    specCtx.moveTo(x, offsetY + specH);
    specCtx.lineTo(x, offsetY + specH + 5);
    specCtx.stroke();

    specCtx.textAlign = "center";
    specCtx.textBaseline = "top";
    specCtx.fillText(timeObj.display, x, offsetY + specH + 8);
  }

  specCtx.fillStyle = "#f59e0b";
  specCtx.font = "bold 12px Inter, sans-serif";
  specCtx.textAlign = "center";
  specCtx.fillText("UTC", offsetX + specW / 2, offsetY + specH + 26);

  specCtx.restore();
}

// Touch & Mouse Coordinate Normalization
function getCanvasCoordinates(e) {
  const rect = interactCanvas.getBoundingClientRect();
  const scaleX = interactCanvas.width / rect.width;
  const scaleY = interactCanvas.height / rect.height;

  let clientX, clientY;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  return {
    x: Math.max(0, Math.min(640, x)),
    y: Math.max(0, Math.min(640, y))
  };
}

function handleStart(e) {
  const coords = getCanvasCoordinates(e);
  startX = coords.x;
  startY = coords.y;
  isDrawing = true;
}

function handleMove(e) {
  if (!isDrawing) return;
  if (e.cancelable) e.preventDefault(); // Prevent page scroll on touch drag

  const coords = getCanvasCoordinates(e);
  const x = Math.min(startX, coords.x);
  const y = Math.min(startY, coords.y);
  const width = Math.abs(coords.x - startX);
  const height = Math.abs(coords.y - startY);

  currentRect = { x, y, width, height };
  redrawBoxes();
}

function handleEnd() {
  if (!isDrawing) return;
  isDrawing = false;

  if (currentRect && currentRect.width > 5 && currentRect.height > 5) {
    const selectedClass = document.querySelector('input[name="classType"]:checked').value;
    
    boundingBoxes.push({
      classId: selectedClass,
      x1: Math.round(currentRect.x),
      y1: Math.round(currentRect.y),
      x2: Math.round(currentRect.x + currentRect.width),
      y2: Math.round(currentRect.y + currentRect.height)
    });

    updateBoxUI();
  }
  currentRect = null;
  redrawBoxes();
}

// Mouse Listeners
interactCanvas.addEventListener('mousedown', handleStart);
interactCanvas.addEventListener('mousemove', handleMove);
interactCanvas.addEventListener('mouseup', handleEnd);

// Touch Listeners for Mobile Drawing
interactCanvas.addEventListener('touchstart', handleStart, { passive: false });
interactCanvas.addEventListener('touchmove', handleMove, { passive: false });
interactCanvas.addEventListener('touchend', handleEnd);

function redrawBoxes() {
  interactCtx.clearRect(0, 0, 640, 640);

  boundingBoxes.forEach((box, index) => {
    const style = getClassStyle(box.classId);
    interactCtx.strokeStyle = style.stroke;
    interactCtx.fillStyle = style.fill;
    interactCtx.lineWidth = 2;

    const w = box.x2 - box.x1;
    const h = box.y2 - box.y1;

    interactCtx.fillRect(box.x1, box.y1, w, h);
    interactCtx.strokeRect(box.x1, box.y1, w, h);

    const labelWidth = 75;
    const labelHeight = 18;
    
    let labelY = box.y1 - labelHeight;
    if (labelY < 0) labelY = box.y1;

    let labelX = box.x1;
    if (labelX + labelWidth > 640) labelX = Math.max(0, 640 - labelWidth);

    interactCtx.fillStyle = style.stroke;
    interactCtx.fillRect(labelX, labelY, labelWidth, labelHeight);
    interactCtx.fillStyle = "#ffffff";
    interactCtx.font = "bold 10px sans-serif";
    interactCtx.fillText(`#${index + 1} ${style.label}`, labelX + 4, labelY + 13);
  });

  if (currentRect) {
    const selectedClass = document.querySelector('input[name="classType"]:checked').value;
    const style = getClassStyle(selectedClass);
    interactCtx.strokeStyle = style.stroke;
    interactCtx.fillStyle = style.fill;
    interactCtx.setLineDash([4, 4]);
    interactCtx.fillRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    interactCtx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
    interactCtx.setLineDash([]);
  }
}

function updateBoxUI() {
  boxCount.innerText = boundingBoxes.length;
  boxCountBadge.innerText = `${boundingBoxes.length} Items`;

  if (boundingBoxes.length === 0) {
    bboxList.innerHTML = `<div class="text-center py-8 text-xs text-slate-500">No bounding boxes drawn yet.<br>Click/drag on the 5-min spectrum.</div>`;
    yoloPreview.value = "";
    return;
  }

  let html = "";
  let yoloTxtLines = [];

  boundingBoxes.forEach((box, idx) => {
    const style = getClassStyle(box.classId);
    const boxWidth = box.x2 - box.x1;
    const boxHeight = box.y2 - box.y1;

    const xCenter = ((box.x1 + box.x2) / 2 / 640).toFixed(6);
    const yCenter = ((box.y1 + box.y2) / 2 / 640).toFixed(6);
    const normWidth = (boxWidth / 640).toFixed(6);
    const normHeight = (boxHeight / 640).toFixed(6);

    yoloTxtLines.push(`${box.classId} ${xCenter} ${yCenter} ${normWidth} ${normHeight}`);

    html += `
      <div class="bg-slate-950 border border-slate-800 rounded-lg p-2 flex items-center justify-between group hover:border-slate-700 transition">
        <div class="flex items-center gap-2 truncate">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${style.stroke}"></span>
          <div>
            <div class="text-xs font-semibold text-slate-200">#${idx + 1} ${style.label}</div>
            <div class="text-[10px] text-slate-500 font-mono">
              [${box.x1}, ${box.y1}] - [${box.x2}, ${box.y2}] (${boxWidth}x${boxHeight}px)
            </div>
          </div>
        </div>
        <button onclick="deleteBox(${idx})" class="text-slate-500 hover:text-rose-400 p-2 rounded transition">
          <i class="fa-solid fa-xmark text-sm"></i>
        </button>
      </div>
    `;
  });

  bboxList.innerHTML = html;
  yoloPreview.value = yoloTxtLines.join('\n');
}

function deleteBox(index) {
  boundingBoxes.splice(index, 1);
  updateBoxUI();
  redrawBoxes();
}

clearBoxesBtn.addEventListener('click', () => {
  boundingBoxes = [];
  updateBoxUI();
  redrawBoxes();
  showToast("Cleared all bounding boxes.", "info");
});

// YOLO Dataset Sample Exporter
exportYoloBtn.addEventListener('click', () => {
  if (!currentRawFitsData) {
    showToast("Please load a FITS file first.", "error");
    return;
  }
  triggerExport(yoloPreview.value);
});

async function triggerExport(yoloTxtContent) {
  const startSec = Math.floor(currentStartStep / 2);
  const endSec = Math.floor((currentStartStep + windowSize) / 2);

  const yyyymmdd = getYYYYMMDDStr();
  const startTimeStr = getObsTimeInfo(startSec).raw;
  const endTimeStr = getObsTimeInfo(endSec).raw;

  const exportBaseName = `TAIWAN-NCU_${yyyymmdd}_${startTimeStr}_${endTimeStr}`;
  
  const cleanSpectrumCanvas = getCleanSpectrumCanvas();
  if (!cleanSpectrumCanvas) return;

  const zip = new JSZip();

  // 1. Raw Pure 640x640 Image
  const rawExportCanvas = document.createElement('canvas');
  rawExportCanvas.width = 640;
  rawExportCanvas.height = 640;
  const rawExportCtx = rawExportCanvas.getContext('2d');
  rawExportCtx.drawImage(cleanSpectrumCanvas, 0, 0);

  const rawBase64 = rawExportCanvas.toDataURL("image/jpeg", 0.95).split(',')[1];
  zip.file(`${exportBaseName}.jpg`, rawBase64, { base64: true });

  // 2. Labeled Image Overlay
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = 640;
  exportCanvas.height = 640;
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.drawImage(cleanSpectrumCanvas, 0, 0);

  boundingBoxes.forEach((box, index) => {
    const style = getClassStyle(box.classId);
    exportCtx.strokeStyle = style.stroke;
    exportCtx.fillStyle = style.fill;
    exportCtx.lineWidth = 2;

    const w = box.x2 - box.x1;
    const h = box.y2 - box.y1;

    exportCtx.fillRect(box.x1, box.y1, w, h);
    exportCtx.strokeRect(box.x1, box.y1, w, h);

    const labelWidth = 75;
    const labelHeight = 18;
    
    let labelY = box.y1 - labelHeight;
    if (labelY < 0) labelY = box.y1;

    let labelX = box.x1;
    if (labelX + labelWidth > 640) labelX = Math.max(0, 640 - labelWidth);

    exportCtx.fillStyle = style.stroke;
    exportCtx.fillRect(labelX, labelY, labelWidth, labelHeight);
    exportCtx.fillStyle = "#ffffff";
    exportCtx.font = "bold 10px sans-serif";
    exportCtx.fillText(`#${index + 1} ${style.label}`, labelX + 4, labelY + 13);
  });

  const labeledBase64 = exportCanvas.toDataURL("image/jpeg", 0.95).split(',')[1];
  zip.file(`${exportBaseName}_labeled.jpg`, labeledBase64, { base64: true });

  // 3. YOLO Format Text Annotation
  zip.file(`${exportBaseName}.txt`, yoloTxtContent || "");

  // Generate & Trigger Download
  try {
    const zipContent = await zip.generateAsync({ type: "blob" });
    const zipUrl = URL.createObjectURL(zipContent);
    const zipLink = document.createElement('a');
    zipLink.href = zipUrl;
    zipLink.download = `${exportBaseName}.zip`;
    document.body.appendChild(zipLink);
    zipLink.click();
    document.body.removeChild(zipLink);
    URL.revokeObjectURL(zipUrl);

    exportedCounter++;
    exportCount.innerText = exportedCounter;
    showToast(`Exported ZIP package (${exportBaseName}.zip)!`, "success");
  } catch (err) {
    showToast("Error creating ZIP file: " + err.message, "error");
  }
}

function showToast(message, type = "info") {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = message;

  if (type === "success") {
    toastIcon.className = "fa-solid fa-circle-check text-emerald-400 text-base flex-shrink-0";
  } else if (type === "error") {
    toastIcon.className = "fa-solid fa-circle-exclamation text-rose-400 text-base flex-shrink-0";
  } else {
    toastIcon.className = "fa-solid fa-circle-info text-amber-400 text-base flex-shrink-0";
  }

  toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
  setTimeout(() => {
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
  }, 5000);
}
