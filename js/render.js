let files = [];
let currentLang = "ko";
let currentId = null;
let currentFilter = "all";
const pageMode = document.body?.dataset?.page === "list" ? "list" : "review";

const contentEl = document.getElementById("content");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("fileList");
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
const SITE_ROOT = new URL("..", window.location.href);

const LANG_LABELS = { ko: "KR", en: "EN" };
const FILTER_LABELS = { all: "All", review: "Reviews", writeup: "Writeup" };

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineParse(text) {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

function renderMarkdown(md) {
  const parts = md.replace(/\r\n?/g, "\n").split("```");
  const html = [];

  for (let i = 0; i < parts.length; i += 1) {
    const isCode = i % 2 === 1;
    const chunk = parts[i];
    if (isCode) {
      const lines = chunk.split("\n");
      const code = lines.join("\n");
      html.push(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
      continue;
    }

    const lines = chunk.split("\n");
    let paragraph = [];
    let listType = null;
    let listItemOpen = false;
    let blockquote = null;
    let blockquoteInList = false;

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      const content = `<p>${inlineParse(paragraph.join(" "))}</p>`;
      if (listItemOpen) {
        html.push(content);
      } else {
        html.push(content);
      }
      paragraph = [];
    };

    const openList = (type) => {
      if (listType === type) return;
      closeList();
      listType = type;
      html.push(`<${type}>`);
    };

    const closeList = () => {
      if (!listType) return;
      if (blockquote && blockquoteInList) {
        flushBlockquote();
      }
      if (listItemOpen) {
        html.push(`</li>`);
        listItemOpen = false;
      }
      html.push(`</${listType}>`);
      listType = null;
    };

    const flushBlockquote = () => {
      if (!blockquote) return;
      const paragraphs = [];
      let buffer = [];
      for (const line of blockquote) {
        if (line.trim() === "") {
          if (buffer.length) {
            paragraphs.push(buffer.join(" "));
            buffer = [];
          }
          continue;
        }
        buffer.push(line.trim());
      }
      if (buffer.length) paragraphs.push(buffer.join(" "));
      const inner = paragraphs.map((text) => `<p>${inlineParse(text)}</p>`).join("");
      html.push(`<blockquote>${inner}</blockquote>`);
      blockquote = null;
      blockquoteInList = false;
    };

    for (const line of lines) {
      const isBlank = line.trim() === "";
      const quoteMatch = line.match(/^\s*>\s?(.*)$/);
      if (listItemOpen && !isBlank) {
        const isIndented = /^\s+/.test(line);
        const isListItem = /^\d+\.\s+/.test(line) || /^[*-]\s+/.test(line);
        if (!isIndented && !isListItem) {
          html.push(`</li>`);
          listItemOpen = false;
          closeList();
        }
      }

      if (quoteMatch) {
        flushParagraph();
        if (!blockquote) {
          blockquote = [];
          blockquoteInList = listItemOpen;
        }
        blockquote.push(quoteMatch[1]);
        continue;
      }

      if (isBlank) {
        flushParagraph();
        if (!listItemOpen) closeList();
        if (blockquote) {
          blockquote.push("");
        } else {
          flushBlockquote();
        }
        continue;
      }

      if (blockquote) {
        flushBlockquote();
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        flushBlockquote();
        const level = heading[1].length;
        html.push(`<h${level}>${inlineParse(heading[2])}</h${level}>`);
        continue;
      }

      const olMatch = line.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        flushParagraph();
        flushBlockquote();
        openList("ol");
        if (listItemOpen) html.push(`</li>`);
        html.push(`<li>${inlineParse(olMatch[1])}`);
        listItemOpen = true;
        continue;
      }

      const ulMatch = line.match(/^[*-]\s+(.*)$/);
      if (ulMatch) {
        flushParagraph();
        flushBlockquote();
        openList("ul");
        if (listItemOpen) html.push(`</li>`);
        html.push(`<li>${inlineParse(ulMatch[1])}`);
        listItemOpen = true;
        continue;
      }

      paragraph.push(line.trim());
    }

    flushParagraph();
    if (blockquote && blockquoteInList) flushBlockquote();
    closeList();
    flushBlockquote();
  }

  return html.join("\n");
}

function normalizeLang(value) {
  return value === "en" ? "en" : "ko";
}

function resolveLang(entry, lang) {
  if (entry?.files?.[lang]) return lang;
  if (entry?.files?.ko) return "ko";
  if (entry?.files?.en) return "en";
  return null;
}

function resolveFilePath(entry, file) {
  if (!file) return "";
  if (file.includes("/")) return new URL(file, SITE_ROOT).toString();
  const folder = entry?.type === "writeup" ? "writeup" : "review";
  return new URL(`${folder}/${file}`, SITE_ROOT).toString();
}

function getTitle(entry, lang) {
  return (
    entry?.title?.[lang] ||
    entry?.title?.ko ||
    entry?.title?.en ||
    entry?.id ||
    ""
  );
}

function formatStatus(entry, lang) {
  if (!entry) return "";
  const date = entry.dateLabel || entry.dateRaw || entry.id;
  const langLabel = LANG_LABELS[lang] || lang.toUpperCase();
  return `${date} · ${langLabel}`;
}

function updateLangButtons() {
  langButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
    btn.setAttribute("aria-pressed", btn.dataset.lang === currentLang ? "true" : "false");
  });
}

function normalizeFilter(value) {
  return value === "review" || value === "writeup" ? value : "all";
}

function updateFilterButtons() {
  filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
    btn.setAttribute("aria-pressed", btn.dataset.filter === currentFilter ? "true" : "false");
  });
}

function setActive(id) {
  const links = listEl.querySelectorAll(".file-link");
  links.forEach((link) => {
    link.classList.toggle("active", link.dataset.id === id);
  });
}

function findEntryById(id) {
  return files.find((entry) => entry.id === id);
}

function findEntryByFile(file) {
  return files.find((entry) => Object.values(entry.files || {}).includes(file));
}

function getFilteredEntries() {
  if (currentFilter === "all") return files;
  return files.filter((entry) => entry.type === currentFilter);
}

function updateUrl(id, lang) {
  const params = new URLSearchParams();
  if (id) params.set("review", id);
  if (lang) params.set("lang", lang);
  const query = params.toString();
  history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

async function loadEntry(entry, lang) {
  if (!entry) return;
  if (!contentEl || !statusEl) return;
  const resolvedLang = resolveLang(entry, lang);
  if (!resolvedLang) {
    statusEl.textContent = "No markdown file available.";
    contentEl.innerHTML = "";
    return;
  }

  const file = entry.files[resolvedLang];
  statusEl.textContent = `Loading ${file}...`;
  const filePath = resolveFilePath(entry, file);
  const cacheBust = `v=${Date.now()}`;
  try {
    const res = await fetch(`${filePath}?${cacheBust}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${file}`);
    const text = await res.text();
    contentEl.innerHTML = renderMarkdown(text);
    if (window.renderMathInElement) {
      window.renderMathInElement(contentEl, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
      });
    } else {
      statusEl.textContent = `${formatStatus(entry, resolvedLang)} · LaTeX not loaded`;
    }
    currentLang = resolvedLang;
    currentId = entry.id;
    updateLangButtons();
    refreshListTitles();
    statusEl.textContent = formatStatus(entry, resolvedLang);
    setActive(entry.id);
    updateUrl(entry.id, resolvedLang);
  } catch (err) {
    statusEl.textContent = `Could not load ${file}`;
    contentEl.innerHTML = "";
  }
}

function initList() {
  listEl.innerHTML = "";
  const entries = getFilteredEntries();
  entries.forEach((entry) => {
    const link = document.createElement("a");
    link.href = `?review=${encodeURIComponent(entry.id)}&lang=${encodeURIComponent(currentLang)}`;
    link.className = "file-link";
    link.textContent = getTitle(entry, currentLang);
    link.dataset.id = entry.id;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (pageMode === "list") {
        window.location.href = `review.html?review=${encodeURIComponent(entry.id)}&lang=${encodeURIComponent(currentLang)}`;
      } else {
        loadEntry(entry, currentLang);
      }
    });
    listEl.appendChild(link);
  });
}

function refreshListTitles() {
  initList();
  if (currentId) setActive(currentId);
}

async function init() {
  try {
    const res = await fetch(new URL("index/review-index.json", SITE_ROOT), { cache: "no-store" });
    if (!res.ok) throw new Error("review-index.json not found");
    const data = await res.json();
    if (Array.isArray(data)) {
      if (data.length && data[0].file) {
        files = data.map((entry) => ({
          id: entry.file.replace(/\.md$/i, ""),
          type: "review",
          title: { ko: entry.title },
          files: { ko: entry.file },
          dateLabel: entry.dateLabel,
          dateRaw: entry.dateRaw,
          sortKey: entry.sortKey,
        }));
      } else {
        files = data;
      }
    } else {
      files = [];
    }
  } catch (err) {
    files = [];
  }
  files = files.map((entry) => ({ ...entry, type: entry.type || "review" }));

  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("review");
  const requestedFile = params.get("file");
  const requestedLang = normalizeLang(params.get("lang"));
  let storedLang = null;
  let storedFilter = null;
  try {
    storedLang = localStorage.getItem("reviewLang");
    storedFilter = localStorage.getItem("reviewFilter");
  } catch (err) {
    storedLang = null;
    storedFilter = null;
  }
  currentLang = normalizeLang(requestedLang || storedLang || "ko");
  currentFilter = normalizeFilter(storedFilter || "all");
  updateLangButtons();
  updateFilterButtons();
  initList();

  let targetEntry = requestedId ? findEntryById(requestedId) : null;
  let targetLang = currentLang;

  if (!targetEntry && requestedFile) {
    const entryByFile = findEntryByFile(requestedFile);
    if (entryByFile) {
      targetEntry = entryByFile;
      const matchedLang = Object.keys(entryByFile.files || {}).find(
        (lang) => entryByFile.files[lang] === requestedFile
      );
      if (matchedLang) targetLang = matchedLang;
    }
  }

  if (!targetEntry) {
    targetEntry = files[0] || null;
  }

  const shouldLoad = Boolean(requestedId || requestedFile);
  if (pageMode === "list") {
    currentId = null;
    return;
  }

  if (targetEntry && shouldLoad) {
    loadEntry(targetEntry, targetLang);
  } else {
    if (statusEl) {
      statusEl.textContent = files.length ? "Select a post from the list." : "No markdown files configured.";
    }
    if (contentEl) contentEl.innerHTML = "";
  }
}

langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextLang = normalizeLang(button.dataset.lang);
    if (nextLang === currentLang) return;
    currentLang = nextLang;
    updateLangButtons();
    refreshListTitles();
    try {
      localStorage.setItem("reviewLang", currentLang);
    } catch (err) {
      // ignore storage errors
    }
    const entry = currentId ? findEntryById(currentId) : files[0];
    if (entry && pageMode === "review") loadEntry(entry, currentLang);
  });
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextFilter = normalizeFilter(button.dataset.filter);
    if (nextFilter === currentFilter) return;
    currentFilter = nextFilter;
    updateFilterButtons();
    refreshListTitles();
    try {
      localStorage.setItem("reviewFilter", currentFilter);
    } catch (err) {
      // ignore storage errors
    }
  });
});

init();
