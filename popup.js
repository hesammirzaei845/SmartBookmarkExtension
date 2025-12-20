let SETTINGS = {
  enableDedup: true,
  enableSorting: true,
  showFavicons: true,
  showFolderIcons: true,
  showDateAdded: false,
  showCount: true,
  compactMode: false,
  enableShortcuts: true,
  fontSize: "medium",
  theme: "light"
};

let ALL_BOOKMARKS = [];
let CURRENT_SORT = "none";
let IS_SEARCH_MODE = false;
let FOLDER_STATE = {};

// load bookmarks and settings
chrome.bookmarks.getTree(tree => {
  ALL_BOOKMARKS = flatten(tree[0].children);

  chrome.storage.local.get(Object.keys(SETTINGS), data => {
    SETTINGS = { ...SETTINGS, ...data };
    applySettings();
    renderList(ALL_BOOKMARKS);
    wireSearch();
    wireSort();
    wireDedup();
    wireShortcuts();
  });
});

// flatten bookmark tree to flat list
function flatten(nodes, acc = [], path = []) {
  nodes.forEach(n => {
    const currentPath = n.title ? [...path, n.title] : path;

    if (n.url) {
      acc.push({
        title: n.title || n.url,
        url: n.url,
        path: currentPath.join(" / "),
        dateAdded: n.dateAdded || 0
      });
    } else if (n.children) {
      flatten(n.children, acc, currentPath);
    }
  });
  return acc;
}

// apply settings to popup UI
function applySettings() {
  const body = document.body;

  body.classList.toggle("dark", SETTINGS.theme === "dark");

  body.style.fontSize =
    SETTINGS.fontSize === "small" ? "12px" :
    SETTINGS.fontSize === "large" ? "16px" : "14px";

  body.classList.toggle("compact", SETTINGS.compactMode);

  document.getElementById("controls").style.display =
    SETTINGS.enableSorting ? "flex" : "none";

  document.getElementById("dedupBtn").style.display =
    SETTINGS.enableDedup ? "inline-block" : "none";
}

// build folder tree structure from flat list
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
    let currentPath = "";

    parts.forEach(part => {
      currentPath = currentPath ? currentPath + " / " + part : part;
      if (!node.folders.has(part)) {
        node.folders.set(part, {
          name: part,
          path: currentPath,
          folders: new Map(),
          bookmarks: [],
          totalCount: 0
        });
      }
      node = node.folders.get(part);
    });

    node.bookmarks.push(item);

    let bubble = node;
    while (bubble) {
      bubble.totalCount += 1;
      const parentPath = bubble.path.includes(" / ")
        ? bubble.path.slice(0, bubble.path.lastIndexOf(" / "))
        : "";
      if (!parentPath) {
        if (bubble !== root && bubble !== node) root.totalCount += 1;
        break;
      }
      bubble = findFolderByPath(root, parentPath);
      if (!bubble) break;
    }
    root.totalCount += 1;
  });

  return root;
}

function pruneSingleItemFolders(node) {
  if (!node || !node.folders) return;

  // اول زیرپوشه‌ها رو پاکسازی کن (بازگشتی)
  node.folders.forEach((child, name) => {
    pruneSingleItemFolders(child);
  });

  // حالا پوشه‌های یک‌موردی رو حذف کن
  const toDelete = [];

  node.folders.forEach((child, name) => {
    const hasSubfolders = child.folders.size > 0;
    const hasOneBookmark = child.bookmarks.length === 1;

    if (!hasSubfolders && hasOneBookmark) {
      // انتقال بوکمارک به والد
      node.bookmarks.push(child.bookmarks[0]);
      toDelete.push(name);
    }
  });

  // حذف پوشه‌های یک‌موردی
  toDelete.forEach(name => {
    node.folders.delete(name);
  });
}

function findFolderByPath(root, path) {
  if (!path) return root;
  const parts = path.split(" / ");
  let node = root;
  for (const part of parts) {
    const next = node.folders.get(part);
    if (!next) return null;
    node = next;
  }
  return node;
}

// sorting flat list
function applySort(items) {
  const sorted = [...items];

  if (CURRENT_SORT === "title-asc") {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (CURRENT_SORT === "title-desc") {
    sorted.sort((a, b) => b.title.localeCompare(a.title));
  } else if (CURRENT_SORT === "date-desc") {
    sorted.sort((a, b) => b.dateAdded - a.dateAdded);
  } else if (CURRENT_SORT === "date-asc") {
    sorted.sort((a, b) => a.dateAdded - b.dateAdded);
  }

  return sorted;
}

// main render
function renderList(items) {
  const container = document.getElementById("listContainer");
  container.innerHTML = "";

  if (SETTINGS.showCount) {
    const count = document.createElement("div");
    count.className = "countBar";
    count.textContent = `Showing ${items.length} bookmarks`;
    container.appendChild(count);
  }

  let content;

  const isSortedMode = CURRENT_SORT !== "none";

  if (IS_SEARCH_MODE || isSortedMode) {
    const base = isSortedMode ? applySort(items) : items;
    content = renderFlatList(base);
  } else {
    const tree = buildFolderTree(items);
    pruneSingleItemFolders(tree);
    content = renderFolderTree(tree);
  }

  container.appendChild(content);
}

// flat list render (for search/sort)
function renderFlatList(items) {
  const ul = document.createElement("ul");
  items.forEach(item => {
    ul.appendChild(createBookmarkItem(item));
  });
  return ul;
}

// render folder tree
function renderFolderTree(root) {
  const ul = document.createElement("ul");
  root.folders.forEach(folderNode => {
    ul.appendChild(renderFolderNode(folderNode));
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
    icon.textContent = "📁";
    header.appendChild(icon);
  }

  const title = document.createElement("span");
  title.className = "folderTitle";
  title.textContent = node.name;
  header.appendChild(title);

  if (SETTINGS.showCount) {
    const count = document.createElement("span");
    count.className = "folderCount";
    count.textContent = `(${node.totalCount})`;
    header.appendChild(count);
  }

  li.appendChild(header);

  const childrenUl = document.createElement("ul");
  childrenUl.className = "folderChildren";

  node.folders.forEach(childFolder => {
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

// favicon url without chrome://
function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + "/favicon.ico";
  } catch (e) {
    return "";
  }
}

// bookmark item
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

// search
function wireSearch() {
  const input = document.getElementById("searchInput");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    IS_SEARCH_MODE = q.length > 0;

    const filtered = q
      ? ALL_BOOKMARKS.filter(b =>
          b.title.toLowerCase().includes(q) ||
          b.url.toLowerCase().includes(q)
        )
      : ALL_BOOKMARKS;

    renderList(filtered);
    highlight(q);
  });
}

function highlight(q) {
  if (!q) return;
  document.querySelectorAll("li.bookmark a").forEach(a => {
    const txt = a.textContent;
    const re = new RegExp(`(${escapeReg(q)})`, "gi");
    a.innerHTML = txt.replace(re, "<mark>$1</mark>");
  });
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// sort dropdown
function wireSort() {
  const select = document.getElementById("sortSelect");

  select.addEventListener("change", () => {
    CURRENT_SORT = select.value;
    renderList(ALL_BOOKMARKS);
  });
}

// dedup
function wireDedup() {
  const btn = document.getElementById("dedupBtn");

  btn.addEventListener("click", () => {
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

// keyboard shortcuts
function wireShortcuts() {
  if (!SETTINGS.enableShortcuts) return;

  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "f") {
      document.getElementById("searchInput").focus();
      e.preventDefault();
    }

    if (e.ctrlKey && e.key === "d") {
      const btn = document.getElementById("dedupBtn");
      if (btn.style.display !== "none") btn.click();
      e.preventDefault();
    }
  });
}
