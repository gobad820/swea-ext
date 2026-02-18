const favSelect = document.getElementById("favSelect");
const nickInput = document.getElementById("nickInput");
const addFavBtn = document.getElementById("addFavBtn");
const removeFavBtn = document.getElementById("removeFavBtn");
const copyBtn = document.getElementById("copyBtn");

async function loadFavorites() {
  const { favorites = [], lastNick = "" } = await chrome.storage.local.get(["favorites", "lastNick"]);
  renderFavorites(favorites);
  nickInput.value = lastNick || "";
}

function renderFavorites(favorites) {
  favSelect.innerHTML = `<option value="">(선택)</option>`;
  for (const nick of favorites) {
    const opt = document.createElement("option");
    opt.value = nick;
    opt.textContent = nick;
    favSelect.appendChild(opt);
  }
}

favSelect.addEventListener("change", async () => {
  if (favSelect.value) {
    nickInput.value = favSelect.value;
    await chrome.storage.local.set({ lastNick: favSelect.value });
  }
});

addFavBtn.addEventListener("click", async () => {
  const nick = nickInput.value.trim();
  if (!nick) return;

  const { favorites = [] } = await chrome.storage.local.get("favorites");
  const set = new Set(favorites);
  set.add(nick);

  const newFavs = Array.from(set);
  await chrome.storage.local.set({ favorites: newFavs, lastNick: nick });
  renderFavorites(newFavs);
  favSelect.value = nick;
});

removeFavBtn.addEventListener("click", async () => {
  const nick = nickInput.value.trim();
  if (!nick) return;

  const { favorites = [] } = await chrome.storage.local.get("favorites");
  const newFavs = favorites.filter(x => x !== nick);
  await chrome.storage.local.set({ favorites: newFavs });
  renderFavorites(newFavs);

  if (favSelect.value === nick) favSelect.value = "";
});

copyBtn.addEventListener("click", async () => {
  const nick = nickInput.value.trim(); // 비우면 최신 제출 복사
  await chrome.storage.local.set({ lastNick: nick });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "COPY_SWEA_STATS", nick }, () => {
    window.close();
  });
});

loadFavorites();
