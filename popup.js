let SETTINGS = {
  enableDedup: true,
  enableSorting: true,
  showFavicons: true,
  showFolderIcons: true,
  showDateAdded: false,
  showCount: true,
  compactMode: false,
  fontSize: "medium", // "small" | "medium" | "large"
  theme: "light"      // "light" | "dark"
};

let ALL_BOOKMARKS = [];
let CURRENT_SORT = "none";       
let IS_SEARCH_MODE = false;
let VIEW_MODE = "folders";       // "folders" | "tags"
let SELECTED_TAGS = new Set();   // active tag filters
let FOLDER_STATE = {};           // { "Folder / Sub": true/false } expanded (true) / collapsed (false)
let PINNED_FOLDERS = new Set();  // Set of folder.path strings
let CURRENT_FOLDER_PATH = ""; // مسیر فولدر فعال
let TAG_DATA = {
  tagsByBookmarkId: {}, // { [bookmarkId]: string[] }
  allTags: []           // string[]
};

// Initialization

chrome.bookmarks.getTree(tree => {
  ALL_BOOKMARKS = flatten(tree[0].children);

  chrome.storage.local.get(Object.keys(SETTINGS), data => {
    SETTINGS = { ...SETTINGS, ...data };
    applySettings();

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
        let tags = storedTagsById[b.id];

        if (!Array.isArray(tags) || tags.length === 0) {
          tags = autoDetectTags(b);
        }

        tags.forEach(t => initialAllTags.add(t));

        return {
          ...b,
          tags
        };
      });

      TAG_DATA = {
        tagsByBookmarkId: Object.fromEntries(
          ALL_BOOKMARKS.map(b => [b.id, b.tags])
        ),
        allTags: Array.from(initialAllTags)
      };

      chrome.storage.local.get(["PINNED_FOLDERS"], data2 => {
        if (Array.isArray(data2.PINNED_FOLDERS)) {
          PINNED_FOLDERS = new Set(data2.PINNED_FOLDERS);
        }

        wireControls();
        wireSearch();
        renderList(ALL_BOOKMARKS);
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

  // controls visibility (sorting/dedup)
  const sortSelect = document.getElementById("sortSelect");
  if (sortSelect) {
    sortSelect.style.display = SETTINGS.enableSorting ? "inline-block" : "none";
  }

  const dedupBtn = document.getElementById("dedupBtn");
  if (dedupBtn) {
    dedupBtn.style.display = SETTINGS.enableDedup ? "inline-block" : "none";
  }
}

// =========================
// Tag rules and auto-tagging
// =========================

const TAG_RULES = {
  Email: {
    hostname: ["mail", "gmail", "outlook", "yahoo"],
    path: ["inbox", "mail"],
    title: ["inbox", "email"]
  },
  Video: {
    hostname: ["video", "media", "tv", "film", "aparat", "namasha", "youtube", "vimeo"],
    path: ["watch", "video", "v/"],
    title: ["video", "watch", "تماشا", "فیلم"]
  },
  Gaming: {
    hostname: ["steam", "epic", "rockstar", "cdprojekt", "game"],
    path: ["game", "play"],
    title: ["game", "gaming"]
  },
  Wallpapers: {
    hostname: ["wallpaper", "unsplash", "wallhaven"],
    path: ["wallpaper", "image", "photo"],
    title: ["wallpaper", "background"]
  },
  Software: {
    hostname: ["soft98", "filehippo"],
    path: ["download"],
    title: ["download", "software"]
  },
  Shopping: {
    hostname: ["shop", "store", "market", "buy", "sheypoor", "divar", "digikala"],
    path: ["shop", "store"],
    title: ["buy", "shopping"]
  },
  AI: {
    hostname: ["openai", "chatgpt", "bard"],
    path: ["chat"],
    title: ["ai", "chatgpt"]
  },
  Programming: {
    hostname: ["github", "stackoverflow", "gitlab"],
    path: ["code"],
    title: ["code", "programming"]
  }
};

function autoDetectTags(bookmark) {
  const tags = new Set();

  try {
    const url = new URL(bookmark.url);
    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const title = (bookmark.title || "").toLowerCase();

    for (const [tag, rules] of Object.entries(TAG_RULES)) {
      let matched = false;

      if (rules.hostname && rules.hostname.some(key => hostname.includes(key))) matched = true;
      else if (rules.path && rules.path.some(key => path.includes(key))) matched = true;
      else if (rules.title && rules.title.some(key => title.includes(key))) matched = true;

      if (matched) tags.add(tag);
    }
  } catch (e) {
    // ignore invalid URLs
  }

  if (tags.size === 0) {
    tags.add("Other");
  }

  return Array.from(tags);
}

// =========================
// Tag data helpers (storage + sync with ALL_BOOKMARKS)
// =========================

function saveTagData() {
  chrome.storage.sync.set({ TAG_DATA });
}

function getTagsForBookmark(id) {
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
      ? { ...b, tags: cleanTags }
      : b
  );

  const tagSet = new Set();
  Object.values(TAG_DATA.tagsByBookmarkId).forEach(arr => {
    (arr || []).forEach(t => tagSet.add(t));
  });
  TAG_DATA.allTags = Array.from(tagSet);

  saveTagData();
}

// Small popup for editing tags
function openTagEditor(bookmarkId, parentLi) {
  // Remove old editor if exists
  const old = parentLi.querySelector(".tagEditor");
  if (old) old.remove();

  const editor = document.createElement("div");
  editor.className = "tagEditor";

  const currentTags = getTagsForBookmark(bookmarkId);

  // Input for new tag
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Add tag...";
  input.className = "tagEditorInput";

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const newTag = input.value.trim();
      if (newTag.length > 0) {
        const updated = [...currentTags, newTag];
        setTagsForBookmark(bookmarkId, updated);
        renderList(ALL_BOOKMARKS);
      }
    }
  });

  editor.appendChild(input);

  // Existing tags list
  const list = document.createElement("div");
  list.className = "tagEditorList";

  currentTags.forEach(t => {
    const chip = document.createElement("span");
    chip.className = "tagChip";
    chip.textContent = t;

    const x = document.createElement("span");
    x.className = "tagChipRemove";
    x.textContent = "×";
    x.addEventListener("click", () => {
      const updated = currentTags.filter(ct => ct !== t);
      setTagsForBookmark(bookmarkId, updated);
      renderList(ALL_BOOKMARKS);
    });

    chip.appendChild(x);
    list.appendChild(chip);
  });

  editor.appendChild(list);
  parentLi.appendChild(editor);

  input.focus();
}

// Folder tree building

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

    // increase totalCount for this node and all its ancestors including root
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
/* Sorting */
// =========================

function applySort(items) {
  if (CURRENT_SORT === "none") return items;

  const sorted = [...items];

  switch (CURRENT_SORT) {
    case "title-asc":
      sorted.sort((a, b) =>
        (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" })
      );
      break;

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
    // clear tag filter bar unless we are in tag view
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
        const tags = item.tags && item.tags.length ? item.tags : ["Other"];
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
// Flat list render (search/sort)
// =========================

function renderFlatList(items) {
  const ul = document.createElement("ul");
  items.forEach(item => {
    ul.appendChild(createBookmarkItem(item));
  });
  return ul;
}

// =========================
// Breadcrumb (simple, mode-based)
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
    const tags = item.tags && item.tags.length ? item.tags : ["Other"];
    tags.forEach(t => {
      if (!groups[t]) groups[t] = [];
      groups[t].push(item);
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
    const tags = item.tags && item.tags.length ? item.tags : ["Other"];
    tags.forEach(t => allTags.add(t));
  });

  const sorted = Array.from(allTags).sort((a, b) => a.localeCompare(b));

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
// Folder tree render (with pin)
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

  // root-level bookmarks
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
    img.onerror = () => {
      img.style.display = "none";
    };
    row.appendChild(img);
  }

  const a = document.createElement("a");
  a.href = item.url;
  a.textContent = item.title;
  a.target = "_blank";
  row.appendChild(a);
// Tag edit button
const tagBtn = document.createElement("span");
tagBtn.className = "tagEditBtn";
tagBtn.textContent = "#";
tagBtn.title = "Edit tags";
tagBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  openTagEditor(item.id, li);
});
row.appendChild(tagBtn);
  li.appendChild(row);

  if (SETTINGS.showDateAdded) {
    const date = document.createElement("div");
    date.className = "dateAdded";
    date.textContent = item.dateAdded
      ? new Date(item.dateAdded).toLocaleDateString()
      : "";
    li.appendChild(date);
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
          const tags = (b.tags || []).join(" ").toLowerCase();
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

  if (sortSelect) {
    sortSelect.value = CURRENT_SORT;
    sortSelect.style.display = SETTINGS.enableSorting ? "inline-block" : "none";

    sortSelect.addEventListener("change", () => {
      CURRENT_SORT = sortSelect.value;
      renderList(ALL_BOOKMARKS);
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
}
