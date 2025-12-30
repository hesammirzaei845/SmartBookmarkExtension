// =========================
// SETTINGS & GLOBAL STATE
// =========================

let SETTINGS = {
  enableDedup: true,
  enableSorting: true,
  showFavicons: true,
  showFolderIcons: true,
  showDateAdded: false,
  showCount: true,
  compactMode: false,
  fontSize: "medium", // "small" | "medium" | "large"
  theme: "light",     // "light" | "dark"
  enableManualTags: true // allow manual tags on/off
};

let ALL_BOOKMARKS = [];
let CURRENT_SORT = "none";
let IS_SEARCH_MODE = false;
let VIEW_MODE = "folders";       // "folders" | "tags"
let SELECTED_TAGS = new Set();   // active tag filters
let FOLDER_STATE = {};           // { "Folder / Sub": true/false }
let PINNED_FOLDERS = new Set();  // Set of folder.path strings
let CURRENT_FOLDER_PATH = "";

// Manual tag data (manual tags only)
let TAG_DATA = {
  tagsByBookmarkId: {}, // { [bookmarkId]: string[] }
  allTags: []           // string[]
};

// =========================
// AUTO-TAGGING ML ENGINE
// =========================

const PREDEFINED_TAG_KEYWORDS = {
  programming: [
    "stack overflow",
    "stackoverflow",
    "github",
    "gitlab",
    "codepen",
    "jsfiddle",
    "w3schools",
    "mdn",
    "visual studio",
    "vscode",
    "c#",
    "dotnet",
    "java",
    "python",
    "cpp",
    "c++",
    "golang",
    "go lang",
    "rust",
    "typescript",
    "programming",
    "developer",
    "coding",
    "api",
    "docker",
    "kubernetes"
  ],
  ai_tools: [
    "copilot",
    "chatgpt",
    "openai",
    "bard",
    "claude",
    "midjourney",
    "perplexity",
    "ai",
    "machine learning",
    "deep learning"
  ],
  email: [
    "gmail",
    "outlook",
    "yahoo mail",
    "protonmail",
    "inbox",
    "mail",
    "webmail"
  ],
  gaming: [
    "steam",
    "epic games",
    "epicgames",
    "rockstar games",
    "rockstargames",
    "wb games",
    "wbgames",
    "playstation",
    "xbox",
    "nintendo",
    "game",
    "gaming",
    "gog.com",
    "cd projekt",
    "cdprojekt",
    "ubisoft",
    "riot games",
    "league of legends",
    "valorant"
  ],
  shopping: [
    "digikala",
    "دیجی کالا",
    "amazon",
    "ebay",
    "sheypoor",
    "شیپور",
    "divar",
    "دیوار",
    "shopping",
    "store",
    "shop",
    "market",
    "online shop",
    "cart",
    "checkout",
    "product",
    "offer",
    "deal"
  ],
  social: [
    "twitter",
    "x.com",
    "instagram",
    "facebook",
    "reddit",
    "linkedin",
    "discord",
    "telegram",
    "whatsapp",
    "social"
  ],
  video: [
    "youtube",
    "youtu.be",
    "twitch",
    "netflix",
    "hulu",
    "prime video",
    "movie",
    "series",
    "stream",
    "streaming",
    "aparat",
    "نماشا",
    "film"
  ],
  news: [
    "news",
    "bbc",
    "cnn",
    "reuters",
    "guardian",
    "nytimes",
    "nyt",
    "economist"
  ],
  education: [
    "university",
    "course",
    "tutorial",
    "udemy",
    "coursera",
    "edx",
    "khan academy",
    "learn",
    "lecture",
    "assignment",
    "exam"
  ],
  docs: [
    "drive.google.com",
    "docs.google.com",
    "notion",
    "confluence",
    "onenote",
    "evernote",
    "document",
    "spreadsheet",
    "slides"
  ],
  tools: [
    "soft98",
    "download",
    "tool",
    "utility",
    "app",
    "software"
  ]
};

const TAG_LEARNING_STORAGE_KEY = "tagLearningModel";
let TAG_LEARNING_MODEL = {};


// ML helpers

// Corpus stats for TF-IDF

const TAG_MODEL_VERSION = 1;

function ensureModelMeta() {
  TAG_LEARNING_MODEL.__meta = TAG_LEARNING_MODEL.__meta || {
    version: TAG_MODEL_VERSION,
    docCount: 0,
    tokenDocFreq: {}
  };
}

function incrementCorpus(bookmarkItem, uniqueTokens) {
  ensureModelMeta();
  TAG_LEARNING_MODEL.__meta.docCount += 1;
  uniqueTokens.forEach(tok => {
    TAG_LEARNING_MODEL.__meta.tokenDocFreq[tok] =
      (TAG_LEARNING_MODEL.__meta.tokenDocFreq[tok] || 0) + 1;
  });
}

function computeIdf(token) {
  ensureModelMeta();
  const docCount = TAG_LEARNING_MODEL.__meta.docCount || 1;
  const df = TAG_LEARNING_MODEL.__meta.tokenDocFreq[token] || 0;
  return Math.log((docCount + 1) / (df + 1)) + 1;
}


function tokenizeText(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^\p{L}\p{N}\s./_-]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function loadTagLearningModel() {
  return new Promise((resolve) => {
    chrome.storage.local.get(TAG_LEARNING_STORAGE_KEY, (data) => {
      TAG_LEARNING_MODEL = data[TAG_LEARNING_STORAGE_KEY] || {};
      resolve(TAG_LEARNING_MODEL);
    });
  });
}

function saveTagLearningModel() {
  ensureModelMeta();                       
  TAG_LEARNING_MODEL.__meta.lastUpdated = Date.now(); 
  const obj = {};
  obj[TAG_LEARNING_STORAGE_KEY] = TAG_LEARNING_MODEL;
  chrome.storage.local.set(obj);
}


function recordManualTagsForLearning(bookmarkItem, manualTags) {
  if (!manualTags || !manualTags.length || !bookmarkItem) return;

  const textParts = [
    bookmarkItem.title || "",
    bookmarkItem.url || ""
  ];
  const tokens = tokenizeText(textParts.join(" "));
  const uniqueTokens = Array.from(new Set(tokens));

  manualTags.forEach((tag) => {
    const tagKey = tag.toLowerCase();
    uniqueTokens.forEach((token) => {
      if (!TAG_LEARNING_MODEL[token]) TAG_LEARNING_MODEL[token] = {};
      if (!TAG_LEARNING_MODEL[token][tagKey]) TAG_LEARNING_MODEL[token][tagKey] = 0;
      TAG_LEARNING_MODEL[token][tagKey] += 1;
    });
  });

  incrementCorpus(bookmarkItem, uniqueTokens);
  saveTagLearningModel();
}



function scoreTagsFromPredefined(textTokens) {
  const scores = {};
  const text = textTokens.join(" ");

  Object.entries(PREDEFINED_TAG_KEYWORDS).forEach(([tag, keywords]) => {
    let score = 0;
    keywords.forEach((kw) => {
      const kwLower = kw.toLowerCase();
      if (text.includes(kwLower)) {
        score += 2;
      }
    });

    textTokens.forEach((token) => {
      keywords.forEach((kw) => {
        if (kw.toLowerCase().includes(token) || token.includes(kw.toLowerCase())) {
          score += 1;
        }
      });
    });

    if (score > 0) {
      scores[tag] = (scores[tag] || 0) + score;
    }
  });

  return scores;
}

function scoreTagsFromLearning(textTokens) {
  const scores = {};
  textTokens.forEach((token) => {
    const entry = TAG_LEARNING_MODEL[token];
    if (!entry) return;
    Object.entries(entry).forEach(([tag, val]) => {
      scores[tag] = (scores[tag] || 0) + val;
    });
  });
  return scores;
}

function generateAutoTagsForBookmark(bookmarkItem, maxTags = 3) {
  const textParts = [bookmarkItem.title || "", bookmarkItem.url || ""];
  let tokens = tokenizeText(textParts.join(" "));
  if (!tokens.length) return [];

  const titleTokens = tokenizeText(bookmarkItem.title || "");
  let hostTokens = [];
  let pathTokens = [];
  try {
    const u = new URL(bookmarkItem.url || "");
    hostTokens = tokenizeText(u.hostname || "");
    pathTokens = tokenizeText((u.pathname || "") + " " + (u.search || ""));
  } catch (_) {}

  const tf = {};
  tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);

  const sectionWeight = (t) => {
    if (titleTokens.includes(t)) return 1.0;
    if (hostTokens.includes(t))  return 0.7;
    if (pathTokens.includes(t))  return 0.5;
    return 0.6;
  };

  const tagScoresNB = {};
  const tagTotals = {};
  const vocabSize = Object.keys(TAG_LEARNING_MODEL).length || 1;

  Object.entries(TAG_LEARNING_MODEL).forEach(([tok, tagMap]) => {
    if (tok === "__meta") return;
    Object.entries(tagMap).forEach(([tag, cnt]) => {
      tagTotals[tag] = (tagTotals[tag] || 0) + cnt;
    });
  });

  const tagsSeen = Object.keys(tagTotals);
  const hasLearned = tagsSeen.length > 0;

  if (hasLearned) {
    const totalCountsAll = Object.values(tagTotals).reduce((a, b) => a + b, 0) || 1;

    tagsSeen.forEach(tag => {
      const prior = (tagTotals[tag] + 1) / (totalCountsAll + tagsSeen.length);
      let logScore = Math.log(prior);

      Object.keys(tf).forEach(tok => {
        const countTokTag = (TAG_LEARNING_MODEL[tok] && TAG_LEARNING_MODEL[tok][tag]) ? TAG_LEARNING_MODEL[tok][tag] : 0;
        const tokIdf = computeIdf(tok);
        const tokTf = tf[tok];
        const w = sectionWeight(tok);

        const likelihood = (countTokTag + 1) / (tagTotals[tag] + vocabSize);
        logScore += Math.log(likelihood) * (tokTf * tokIdf * w);
      });

      tagScoresNB[tag] = logScore;
    });
  }

  const tokensAll = Array.from(new Set(tokens));
  const predefinedScores = scoreTagsFromPredefined(tokensAll);

  const combined = {};

  Object.entries(predefinedScores).forEach(([tag, score]) => {
    combined[tag] = (combined[tag] || 0) + score;
  });

  if (hasLearned) {
    const nbValues = Object.values(tagScoresNB);
    const maxLog = nbValues.length ? Math.max(...nbValues) : 0;
    Object.entries(tagScoresNB).forEach(([tag, logScore]) => {
      const rel = Math.exp(logScore - maxLog);
      combined[tag] = (combined[tag] || 0) + rel * 2;
    });
  }

  const sorted = Object.entries(combined).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, maxTags);

  const CONF_THRESHOLD = hasLearned ? 0.2 : 2;
  const confident = top.filter(([, s]) => s >= CONF_THRESHOLD).map(([tag]) => tag);

  return confident;
}

function rejectAutoTag(bookmarkItem, tag) {
  const tokens = tokenizeText((bookmarkItem.title || "") + " " + (bookmarkItem.url || ""));
  tokens.forEach(tok => {
    if (TAG_LEARNING_MODEL[tok] && TAG_LEARNING_MODEL[tok][tag]) {
      TAG_LEARNING_MODEL[tok][tag] -= 1;
      if (TAG_LEARNING_MODEL[tok][tag] <= 0) {
        delete TAG_LEARNING_MODEL[tok][tag];
      }
    }
  });
  saveTagLearningModel();
}


function getAllTagsForBookmark(item) {
  const manualEnabled = SETTINGS.enableManualTags !== false;
  const manualTags =
    manualEnabled && Array.isArray(item.manualTags) ? item.manualTags : [];

  const autoTags = generateAutoTagsForBookmark(item);
  const all = [...manualTags, ...autoTags];

  if (!all.length) return ["other"];

  const unique = Array.from(new Set(all.map((t) => String(t).toLowerCase())));
  return unique;
}

// =========================
// INITIALIZATION
// =========================

chrome.bookmarks.getTree(tree => {
  ALL_BOOKMARKS = flatten(tree[0].children);

  chrome.storage.local.get(Object.keys(SETTINGS), data => {
    SETTINGS = { ...SETTINGS, ...data };
    applySettings();

    loadTagLearningModel().then(() => {
      chrome.storage.sync.get(["TAG_DATA"], dataTags => {
        const stored = dataTags.TAG_DATA;
        const storedTagsById =
          stored && stored.tagsByBookmarkId && typeof stored.tagsByBookmarkId === "object"
            ? stored.tagsByBookmarkId
            : {};

        const initialAllTags =
          stored && Array.isArray(stored.allTags)
            ? new Set(stored.allTags)
            : new Set();

        ALL_BOOKMARKS = ALL_BOOKMARKS.map(b => {
          let manualTags = storedTagsById[b.id];
          if (!Array.isArray(manualTags)) {
            manualTags = [];
          }

          manualTags.forEach(t => initialAllTags.add(t));

          return {
            ...b,
            manualTags
          };
        });

        TAG_DATA = {
          tagsByBookmarkId: Object.fromEntries(
            ALL_BOOKMARKS.map(b => [b.id, b.manualTags])
          ),
          allTags: Array.from(initialAllTags)
        };

        chrome.storage.local.get(["PINNED_FOLDERS"], data2 => {
          if (Array.isArray(data2.PINNED_FOLDERS)) {
            PINNED_FOLDERS = new Set(data2.PINNED_FOLDERS);
          }

          wireControls();
          wireSearch();

          loadVisitCounts().then(() => {
            renderList(ALL_BOOKMARKS);
          });
        });
      });
    });
  });
});

// =========================
// Helpers: flatten bookmarks
// =========================

function flatten(nodes, acc = [], path = []) {
  nodes.forEach(node => {
    const currentPath = node.title ? [...path, node.title] : path;

    if (node.url) {
      acc.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        path: currentPath.join(" / "),
        dateAdded: node.dateAdded || 0
      });
    } else if (node.children) {
      flatten(node.children, acc, currentPath);
    }
  });
  return acc;
}

// =========================
// Settings
// =========================

function applySettings() {
  const body = document.body;

  // theme
  body.classList.toggle("dark", SETTINGS.theme === "dark");

  // font size
  body.style.fontSize =
    SETTINGS.fontSize === "small" ? "12px" :
    SETTINGS.fontSize === "large" ? "16px" : "14px";

  // compact mode
  body.classList.toggle("compact", SETTINGS.compactMode);
  body.classList.toggle("hideVisits", SETTINGS.showVisitCount === false);

  // controls visibility
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.style.display = SETTINGS.enableSorting ? "inline-block" : "none";
  }

  const sortDropdown = document.getElementById("sortDropdown");
  if (sortDropdown) {
    sortDropdown.style.display = SETTINGS.enableSorting ? "inline-block" : "none";
  }

  const dedupBtn = document.getElementById("dedupBtn");
  if (dedupBtn) {
    dedupBtn.style.display = SETTINGS.enableDedup ? "inline-block" : "none";
  }
}

// =========================
// Manual tag data helpers
// =========================

function saveTagData() {
  chrome.storage.sync.set({ TAG_DATA });
}

function getManualTagsForBookmark(id) {
  const tags = TAG_DATA.tagsByBookmarkId[id];
  return Array.isArray(tags) ? tags : [];
}

function setTagsForBookmark(id, tags) {
  const cleanTags = Array.from(
    new Set(
      (tags || [])
        .map(t => String(t).trim())
        .filter(t => t.length > 0)
    )
  );

  TAG_DATA.tagsByBookmarkId[id] = cleanTags;

  ALL_BOOKMARKS = ALL_BOOKMARKS.map(b =>
    b.id === id
      ? { ...b, manualTags: cleanTags }
      : b
  );

  const tagSet = new Set();
  Object.values(TAG_DATA.tagsByBookmarkId).forEach(arr => {
    (arr || []).forEach(t => tagSet.add(t));
  });
  TAG_DATA.allTags = Array.from(tagSet);

  saveTagData();

  const bookmarkItem = ALL_BOOKMARKS.find(b => b.id === id);
  if (bookmarkItem) {
    recordManualTagsForLearning(bookmarkItem, cleanTags);
  }
}

// =========================
// Tag editor
// =========================

function openTagEditor(bookmarkId, parentLi) {
  if (!SETTINGS.enableManualTags) return;

  const old = parentLi.querySelector(".tagEditor");
  if (old) old.remove();

  const editor = document.createElement("div");
  editor.className = "tagEditor";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Add tag...";
  input.className = "tagEditorInput";

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const newTag = input.value.trim();
      if (newTag.length > 0) {
        const manualTags = getManualTagsForBookmark(bookmarkId);
        const updated = [...manualTags, newTag];
        setTagsForBookmark(bookmarkId, updated);
        renderList(ALL_BOOKMARKS);
      }
    }
  });

  editor.appendChild(input);

  const list = document.createElement("div");
  list.className = "tagEditorList";

  const allTags = getAllTagsForBookmark(ALL_BOOKMARKS.find(b => b.id === bookmarkId));
  const manualTags = getManualTagsForBookmark(bookmarkId);
  const bookmarkItem = ALL_BOOKMARKS.find(b => b.id === bookmarkId);

  allTags.forEach(t => {
    const chip = document.createElement("span");
    chip.className = "tagChip";
    chip.textContent = t;

    const x = document.createElement("span");
    x.className = "tagChipRemove";
    x.textContent = "×";
    x.title = manualTags.includes(t) ? "Remove manual tag" : "Reject auto tag";

    x.addEventListener("click", () => {
      if (manualTags.includes(t)) {
        const updated = manualTags.filter(ct => ct !== t);
        setTagsForBookmark(bookmarkId, updated);
      } else {
        rejectAutoTag(bookmarkItem, t);
      }

      renderList(ALL_BOOKMARKS);
    });

    chip.appendChild(x);
    list.appendChild(chip);
  });

  editor.appendChild(list);
  parentLi.appendChild(editor);

  input.focus();
}


// =========================
// Visit count helpers
// =========================

function getVisitCount(url) {
  return new Promise(resolve => {
    let hostname = "";

    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      resolve(0);
      return;
    }

    chrome.history.search(
      {
        text: hostname,
        startTime: 0,
        maxResults: 999999
      },
      results => {
        resolve(results.length);
      }
    );
  });
}

async function loadVisitCounts() {
  for (const b of ALL_BOOKMARKS) {
    b.visitCount = await getVisitCount(b.url);
  }
}

// =========================
// Folder tree building
// =========================

function buildFolderTree(items) {
  const root = {
    name: "root",
    path: "",
    folders: new Map(),
    bookmarks: [],
    totalCount: 0
  };

  items.forEach(item => {
    const parts = item.path ? item.path.split(" / ").filter(Boolean) : [];
    let node = root;
    const stack = [root];

    parts.forEach(part => {
      if (!node.folders.has(part)) {
        const newPath = node.path ? node.path + " / " + part : part;
        node.folders.set(part, {
          name: part,
          path: newPath,
          folders: new Map(),
          bookmarks: [],
          totalCount: 0
        });
      }
      node = node.folders.get(part);
      stack.push(node);
    });

    node.bookmarks.push(item);

    stack.forEach(n => {
      n.totalCount += 1;
    });
  });

  return root;
}

function pruneSingleItemFolders(node) {
  if (!node || !node.folders) return;

  node.folders.forEach(child => {
    pruneSingleItemFolders(child);
  });

  const toDelete = [];

  node.folders.forEach((child, name) => {
    const hasSubfolders = child.folders.size > 0;
    const hasOneBookmark = child.bookmarks.length === 1;

    if (!hasSubfolders && hasOneBookmark) {
      node.bookmarks.push(child.bookmarks[0]);
      toDelete.push(name);
    }
  });

  toDelete.forEach(name => {
    node.folders.delete(name);
  });
}

// =========================
// Sorting
// =========================

// labels for UI sync (select + dropdown)
const SORT_LABELS = {
  "none": "No sorting",
  "title-asc": "Title A→Z",
  "title-desc": "Title Z→A",
  "date-desc": "Newest",
  "date-asc": "Oldest",
  "visits-desc": "Most visited"
};

// core sort logic on items
function applySort(items) {
  if (CURRENT_SORT === "none") return items;

  const sorted = [...items];

  switch (CURRENT_SORT) {
    case "title-asc":
      sorted.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" })
      );
      break;

    case "visits-desc":
      return [...items].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));

    case "title-desc":
      sorted.sort((a, b) =>
        (b.title || "").localeCompare(a.title || "", undefined, { sensitivity: "base" })
      );
      break;

    case "date-asc":
      sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
      break;

    case "date-desc":
      sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
      break;
  }

  return sorted;
}

// set sort mode and refresh UI
function setSortMode(mode) {
  CURRENT_SORT = mode;

  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.value = CURRENT_SORT;
  }

  const sortLabel = document.getElementById("sortDropdownLabel");
  if (sortLabel) {
    sortLabel.textContent = SORT_LABELS[CURRENT_SORT] || "Sort";
  }

  renderList(ALL_BOOKMARKS);
}

// =========================
// Main render
// =========================

function renderList(items) {
  const container = document.getElementById("listContainer");
  if (!container) return;

  container.innerHTML = "";

  if (SETTINGS.showCount) {
    const count = document.createElement("div");
    count.className = "countBar";
    count.textContent = `Showing ${items.length} bookmarks`;
    container.appendChild(count);
  }

  const tagFilterBar = document.getElementById("tagFilterBar");
  if (tagFilterBar) {
    if (VIEW_MODE !== "tags" || IS_SEARCH_MODE || CURRENT_SORT !== "none") {
      tagFilterBar.innerHTML = "";
    }
  }

  let content;
  const isSortedMode = CURRENT_SORT !== "none";

  if (IS_SEARCH_MODE || isSortedMode) {
    const base = isSortedMode ? applySort(items) : items;
    content = renderFlatList(base);
  } else if (VIEW_MODE === "tags") {
    let filtered = items;
    if (SELECTED_TAGS.size > 0) {
      filtered = items.filter(item => {
        const tags = getAllTagsForBookmark(item);
        return tags.some(t => SELECTED_TAGS.has(t));
      });
    }
    content = renderTagView(filtered);
    renderTagFilters(ALL_BOOKMARKS);
  } else {
    const tree = buildFolderTree(items);
    pruneSingleItemFolders(tree);
    content = renderFolderTree(tree);
  }

  container.appendChild(content);
  updateBreadcrumb();
}

// =========================
// Flat list render
// =========================

function renderFlatList(items) {
  const ul = document.createElement("ul");
  items.forEach(item => {
    ul.appendChild(createBookmarkItem(item));
  });
  return ul;
}

// =========================
// Breadcrumb
// =========================

function updateBreadcrumb() {
  const bar = document.getElementById("breadcrumb");
  if (!bar) return;

  bar.innerHTML = "";

  const span = document.createElement("span");
  span.className = "crumb current";

  if (IS_SEARCH_MODE) {
    span.textContent = "Search results";
  } else if (VIEW_MODE === "tags") {
    span.textContent = "Tag view";
  } else {
    span.textContent = "All bookmarks";
  }

  bar.appendChild(span);
}

// =========================
// Tag view and filters
// =========================

function renderTagView(items) {
  const wrapper = document.createElement("div");
  wrapper.className = "tagView";

  const groups = {};

  items.forEach(item => {
    const tags = getAllTagsForBookmark(item);
    tags.forEach(t => {
      const key = String(t);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
  });

  const sortedTags = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let tagsToRender = sortedTags;
  if (SELECTED_TAGS.size > 0) {
    tagsToRender = sortedTags.filter(t => SELECTED_TAGS.has(t));
  }

  tagsToRender.forEach(tag => {
    const section = document.createElement("div");
    section.className = "tagGroup";

    const header = document.createElement("div");
    header.className = "tagHeader";
    header.textContent = `${tag} (${groups[tag].length})`;

    const list = document.createElement("ul");

    let itemsInGroup = groups[tag];
    if (CURRENT_SORT !== "none") {
      itemsInGroup = applySort(itemsInGroup);
    }

    itemsInGroup.forEach(item => {
      const li = createBookmarkItem(item);
      list.appendChild(li);
    });

    section.appendChild(header);
    section.appendChild(list);
    wrapper.appendChild(section);
  });

  return wrapper;
}

function renderTagFilters(items) {
  const tagFilterBar = document.getElementById("tagFilterBar");
  if (!tagFilterBar) return;

  tagFilterBar.innerHTML = "";

  const allTags = new Set();
  items.forEach(item => {
    const tags = getAllTagsForBookmark(item);
    tags.forEach(t => allTags.add(t));
  });

  const sorted = Array.from(allTags).sort((a, b) => String(a).localeCompare(String(b)));

  sorted.forEach(tag => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tagFilterButton";
    btn.textContent = tag;

    if (SELECTED_TAGS.has(tag)) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => {
      if (SELECTED_TAGS.has(tag)) {
        SELECTED_TAGS.delete(tag);
      } else {
        SELECTED_TAGS.add(tag);
      }
      renderList(ALL_BOOKMARKS);
    });

    tagFilterBar.appendChild(btn);
  });
}

// =========================
// Folder tree render
// =========================

function renderFolderTree(root) {
  const ul = document.createElement("ul");

  const folders = Array.from(root.folders.values());
  const pinned = folders.filter(f => PINNED_FOLDERS.has(f.path));
  const normal = folders.filter(f => !PINNED_FOLDERS.has(f.path));
  const finalList = [...pinned, ...normal];

  finalList.forEach(folderNode => {
    ul.appendChild(renderFolderNode(folderNode));
  });

  root.bookmarks.forEach(b => {
    ul.appendChild(createBookmarkItem(b));
  });

  return ul;
}

function renderFolderNode(node) {
  const li = document.createElement("li");
  li.className = "folder";
  li.dataset.path = node.path;

  const header = document.createElement("div");
  header.className = "folderHeader";

  const expanded = FOLDER_STATE[node.path] !== false;

  const toggle = document.createElement("span");
  toggle.className = "folderToggle";
  toggle.textContent = expanded ? "▾" : "▸";
  header.appendChild(toggle);

  if (SETTINGS.showFolderIcons) {
    const icon = document.createElement("span");
    icon.className = "folderIcon";
    header.appendChild(icon);
  }

  const title = document.createElement("span");
  title.className = "folderTitle";
  title.textContent = node.name;
  header.appendChild(title);

  const pinBtn = document.createElement("span");
  pinBtn.className = "folderPinBtn";
  pinBtn.textContent = PINNED_FOLDERS.has(node.path) ? "📌" : "📍";

  pinBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (PINNED_FOLDERS.has(node.path)) {
      PINNED_FOLDERS.delete(node.path);
    } else {
      PINNED_FOLDERS.add(node.path);
    }
    chrome.storage.local.set({ PINNED_FOLDERS: Array.from(PINNED_FOLDERS) });
    renderList(ALL_BOOKMARKS);
  });

  header.appendChild(pinBtn);

  if (SETTINGS.showCount) {
    const count = document.createElement("span");
    count.className = "folderCount";
    count.textContent = `(${node.totalCount})`;
    header.appendChild(count);
  }

  li.appendChild(header);

  const childrenUl = document.createElement("ul");
  childrenUl.className = "folderChildren";

  const folders = Array.from(node.folders.values());
  const pinned = folders.filter(f => PINNED_FOLDERS.has(f.path));
  const normal = folders.filter(f => !PINNED_FOLDERS.has(f.path));
  const finalList = [...pinned, ...normal];

  finalList.forEach(childFolder => {
    childrenUl.appendChild(renderFolderNode(childFolder));
  });

  node.bookmarks.forEach(b => {
    childrenUl.appendChild(createBookmarkItem(b));
  });

  li.appendChild(childrenUl);

  if (!expanded) {
    li.classList.add("collapsed");
  }

  header.addEventListener("click", () => {
    const nowExpanded = !li.classList.contains("collapsed");
    li.classList.toggle("collapsed", nowExpanded);
    const newState = !nowExpanded;
    FOLDER_STATE[node.path] = newState;
    toggle.textContent = newState ? "▾" : "▸";
  });

  return li;
}

// =========================
// Bookmark item rendering
// =========================

function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + "/favicon.ico";
  } catch (e) {
    return "";
  }
}

function createBookmarkItem(item) {
  const li = document.createElement("li");
  li.className = "bookmark";

  const row = document.createElement("div");
  row.className = "bookmarkRow";

  if (SETTINGS.showFavicons) {
    const img = document.createElement("img");
    img.className = "favicon";
    const fav = getFaviconUrl(item.url);
    if (fav) img.src = fav;
    img.onerror = () => (img.style.display = "none");
    row.appendChild(img);
  }

  const a = document.createElement("a");
  a.href = item.url;
  a.textContent = item.title;
  a.target = "_blank";
  row.appendChild(a);

  if (SETTINGS.enableManualTags) {
    const tagBtn = document.createElement("span");
    tagBtn.className = "tagEditBtn";
    tagBtn.textContent = "#";
    tagBtn.title = "Edit tags";
    tagBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openTagEditor(item.id, li);
    });
    row.appendChild(tagBtn);
  }

  li.appendChild(row);

  const showVisit = typeof item.visitCount === "number";
  const showDate = SETTINGS.showDateAdded && item.dateAdded;

  if ((SETTINGS.showVisitCount && showVisit) || showDate) {
  const infoRow = document.createElement("div");
  infoRow.className = "bookmarkInfoRow";

  if (SETTINGS.showVisitCount && showVisit) {
    const vc = document.createElement("span");
    vc.className = "visitCountInline";
    vc.textContent = `Visits: ${item.visitCount}`;
    infoRow.appendChild(vc);
  }

  if (showDate) {
    const date = document.createElement("span");
    date.className = "dateAddedInline";
    date.textContent = new Date(item.dateAdded).toLocaleDateString();
    infoRow.appendChild(date);
  }

  li.appendChild(infoRow);
}

  return li;
}

// =========================
// Search and highlight
// =========================

function wireSearch() {
  const input = document.getElementById("searchInput");
  if (!input) return;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    IS_SEARCH_MODE = q.length > 0;

    const filtered = q
      ? ALL_BOOKMARKS.filter(b => {
          const title = (b.title || "").toLowerCase();
          const url = (b.url || "").toLowerCase();
          const tags = getAllTagsForBookmark(b).join(" ").toLowerCase();
          return (
            title.includes(q) ||
            url.includes(q) ||
            tags.includes(q)
          );
        })
      : ALL_BOOKMARKS;

    renderList(filtered);
    highlight(q);
  });
}

function highlight(q) {
  if (!q) return;
  const links = document.querySelectorAll("li.bookmark a");
  const re = new RegExp(`(${escapeReg(q)})`, "gi");

  links.forEach(a => {
    const txt = a.textContent;
    a.innerHTML = txt.replace(re, "<mark>$1</mark>");
  });
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =========================
// Controls: view mode, sort, dedup
// =========================

function wireControls() {
  const btnFolders = document.getElementById("viewFoldersBtn");
  const btnTags = document.getElementById("viewTagsBtn");
  const sortSelect = document.getElementById("sortSelect");
  const dedupBtn = document.getElementById("dedupBtn");

  if (btnFolders && btnTags) {
    const syncViewButtons = () => {
      if (VIEW_MODE === "folders") {
        btnFolders.classList.add("active");
        btnTags.classList.remove("active");
      } else {
        btnTags.classList.add("active");
        btnFolders.classList.remove("active");
      }
    };

    btnFolders.addEventListener("click", () => {
      VIEW_MODE = "folders";
      SELECTED_TAGS.clear();
      IS_SEARCH_MODE = false;
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
      syncViewButtons();
      renderList(ALL_BOOKMARKS);
    });

    btnTags.addEventListener("click", () => {
      VIEW_MODE = "tags";
      IS_SEARCH_MODE = false;
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
      syncViewButtons();
      renderList(ALL_BOOKMARKS);
    });

    syncViewButtons();
  }

  // legacy select sort (kept for now)
  if (sortSelect) {
    sortSelect.value = CURRENT_SORT;
    sortSelect.style.display = SETTINGS.enableSorting ? "inline-block" : "none";

    sortSelect.addEventListener("change", () => {
      setSortMode(sortSelect.value);
    });
  }

  if (dedupBtn) {
    dedupBtn.style.display = SETTINGS.enableDedup ? "inline-block" : "none";

    dedupBtn.addEventListener("click", () => {
      const seen = new Set();
      const unique = [];
      let removed = 0;

      ALL_BOOKMARKS.forEach(b => {
        const key = b.url;
        if (seen.has(key)) {
          removed++;
        } else {
          seen.add(key);
          unique.push(b);
        }
      });

      ALL_BOOKMARKS = unique;
      renderList(ALL_BOOKMARKS);

      alert(removed === 0 ? "No duplicates found." : `Removed ${removed} duplicates.`);
    });
  }

  // custom dropdown sort (Discord/Notion style)
  const sortDropdownToggle = document.getElementById("sortDropdownToggle");
  const sortDropdownMenu = document.getElementById("sortDropdownMenu");
  const sortDropdownLabel = document.getElementById("sortDropdownLabel");

  if (sortDropdownToggle && sortDropdownMenu && sortDropdownLabel) {
    let open = false;

    // init label based on CURRENT_SORT
    sortDropdownLabel.textContent = SORT_LABELS[CURRENT_SORT] || "Sort";

    sortDropdownToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      open = !open;
      updateDropdownState();
    });

    sortDropdownMenu.addEventListener("click", (e) => {
      const btn = e.target.closest(".sortOption");
      if (!btn) return;

      const mode = btn.dataset.value;
      setSortMode(mode);
      open = false;
      updateDropdownState();
    });

    document.addEventListener("click", () => {
      if (!open) return;
      open = false;
      updateDropdownState();
    });

    function updateDropdownState() {
      sortDropdownMenu.classList.toggle("open", open);
      sortDropdownToggle.classList.toggle("open", open);
    }
  }
}
