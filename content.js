// content.js
// - 닉네임(부분일치) 제출 row 찾기
// - 없으면 1~끝 페이지까지 자동 탐색(fetch + DOMParser)
// - 메모리/시간 천 단위 콤마 적용
// - 단축키: Ctrl(or Cmd)+Shift+Y => lastNick 우선, 없으면 favorites[0], 없으면 최신 제출

function norm(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function formatWithThousands(n) {
  const num = Number(String(n).replace(/,/g, ""));
  if (!Number.isFinite(num)) return String(n);
  return new Intl.NumberFormat("en-US").format(num);
}

function formatJavaDoc(mem, time) {
  return `/**
* 메모리 사용량 : ${formatWithThousands(mem)} kb
* 실행 시간: ${formatWithThousands(time)} ms
*/`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

/** ====== DOM에서 row 파싱 ====== */

function getSubmitterName(problemSmtEl) {
  const nameEl = problemSmtEl.querySelector(".submitter .club_name .name");
  return nameEl ? norm(nameEl.textContent) : "";
}

function pickValueByLabelInRow(problemSmtEl, labelText) {
  const lis = problemSmtEl.querySelectorAll(".info li");
  for (const li of lis) {
    const spans = li.querySelectorAll("span");
    if (spans.length < 2) continue;

    const value = norm(spans[0].innerText);
    const label = norm(spans[1].innerText);

    if (label === labelText) return value;
  }
  return null;
}

function parseNumber(valueWithUnit, unit) {
  const m = norm(valueWithUnit).match(new RegExp(String.raw`([\d,]+)\s*${unit}`, "i"));
  if (!m) return null;
  return m[1].replace(/,/g, "");
}

function extractFromRow(row) {
  const memRaw = pickValueByLabelInRow(row, "메모리");
  const timeRaw = pickValueByLabelInRow(row, "실행시간");
  if (!memRaw || !timeRaw) return null;

  const mem = parseNumber(memRaw, "kb");
  const time = parseNumber(timeRaw, "ms");
  if (!mem || !time) return null;

  return { mem, time };
}

function findTargetRowInDocument(doc, nickInput) {
  const rows = Array.from(doc.querySelectorAll(".problem_smt"));
  if (rows.length === 0) return null;

  const nick = norm(nickInput);

  if (!nick) return rows[0]; // nick 비우면 최신(첫 row)

  const nickLower = nick.toLowerCase();

  for (const row of rows) {
    const submitter = getSubmitterName(row);
    if (submitter && submitter.toLowerCase().includes(nickLower)) {
      return row; // 첫 매칭
    }
  }
  return null;
}

/** ====== 페이지네이션 파악 ====== */

function getEndPageFromCurrentDom() {
  const end = document.querySelector("#endPage");
  if (end) {
    const n = parseInt(norm(end.textContent), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  const pageNums = Array.from(document.querySelectorAll(".pagination .page-link"))
    .map((a) => parseInt(norm(a.textContent), 10))
    .filter((n) => !Number.isNaN(n));
  return pageNums.length ? Math.max(...pageNums) : 1;
}

function getSubmitHistoryUrl() {
  const form = document.querySelector("form#problemForm");
  if (form?.action) return form.action;

  return "https://swexpertacademy.com/main/talk/solvingClub/problemSubmitHistory.do";
}

function buildFormParamsForPage(pageIndex) {
  const form = document.querySelector("form#problemForm");
  const params = new URLSearchParams();

  if (form) {
    const data = new FormData(form);
    for (const [k, v] of data.entries()) params.set(k, v);
  }

  params.set("pageIndex", String(pageIndex));
  if (!params.get("pageSize")) params.set("pageSize", "20");

  return params;
}

async function fetchPageHtml(pageIndex) {
  const url = getSubmitHistoryUrl();
  const params = buildFormParamsForPage(pageIndex);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: params.toString(),
    credentials: "include"
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function searchAcrossAllPages(nick) {
  let row = findTargetRowInDocument(document, nick);
  if (row) return { row, page: "current" };

  const endPage = getEndPageFromCurrentDom();
  console.log(`[SWEA] '${nick}' not found on current page. Searching 1..${endPage}`);

  for (let p = 1; p <= endPage; p++) {
    let html;
    try {
      html = await fetchPageHtml(p);
    } catch (e) {
      console.warn(`[SWEA] fetch failed on page ${p}:`, e);
      continue;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    row = findTargetRowInDocument(doc, nick);
    if (row) return { row, page: p };
  }

  return null;
}

/** ====== 메인 실행 ====== */

async function runCopy(nick) {
  const result = await searchAcrossAllPages(nick);

  if (!result) {
    alert(`'${nick}' 제출자를 1~끝 페이지에서 찾지 못했어요.`);
    return;
  }

  const stats = extractFromRow(result.row);
  if (!stats) {
    alert("메모리/실행시간을 읽지 못했어요.");
    return;
  }

  const out = formatJavaDoc(stats.mem, stats.time);
  const ok = await copyToClipboard(out);

  if (ok) {
    const where = result.page === "current" ? "현재 페이지" : `${result.page}페이지`;
    console.log(`[SWEA Copier] Copied from ${where}:\n${out}`);
  } else {
    alert("클립보드 복사 실패");
  }
}

/** ====== 메시지 수신 ====== */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "COPY_SWEA_STATS") {
    runCopy(msg.nick || "");
  }
});

/** ====== 단축키(페이지에서 직접 처리) ======
 * Ctrl+Shift+Y (Win/Linux), Cmd+Shift+Y (Mac)
 * - lastNick 우선
 * - 없으면 favorites[0]
 * - 없으면 nick="" => 최신 제출
 */
document.addEventListener("keydown", async (e) => {
  const isY = e.key && e.key.toLowerCase() === "y";
  const isHotkey = isY && e.shiftKey && (e.ctrlKey || e.metaKey);

  if (!isHotkey) return;

  // 페이지 기본 단축키 방지
  e.preventDefault();
  e.stopPropagation();

  const { lastNick = "", favorites = [] } = await chrome.storage.local.get(["lastNick", "favorites"]);

  const nick =
    (lastNick && lastNick.trim()) ||
    (Array.isArray(favorites) && favorites.length > 0 ? String(favorites[0]).trim() : "") ||
    "";

  runCopy(nick);
});
