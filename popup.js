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
let VIEW_MODE = "folders"; // "folders" | "tags"
let SELECTED_TAGS = new Set();

// load bookmarks and settings
chrome.bookmarks.getTree(tree => {
  ALL_BOOKMARKS = flatten(tree[0].children);

  chrome.storage.local.get(Object.keys(SETTINGS), data => {
    SETTINGS = { ...SETTINGS, ...data };
    applySettings();
    // assign tags after settings are loaded and rules are defined
    ALL_BOOKMARKS = ALL_BOOKMARKS.map(b => ({
      ...b,
      tags: autoDetectTags(b)
    }));
    renderList(ALL_BOOKMARKS);
    wireSearch();
    wireSort();
    wireDedup();
    wireShortcuts();
    wireViewMode();
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

// settings
function applySettings() {
  const body = document.body;

  body.classList.toggle("dark", SETTINGS.theme === "dark");

  body.style.fontSize =
    SETTINGS.fontSize === "small" ? "12px" :
    SETTINGS.fontSize === "large" ? "16px" : "14px";

  body.classList.toggle("compact", SETTINGS.compactMode);

  const controls = document.getElementById("controls");
  controls.style.display = SETTINGS.enableSorting ? "flex" : "none";

  document.getElementById("dedupBtn").style.display =
    SETTINGS.enableDedup ? "inline-block" : "none";
}

// tag rules
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

      if (rules.hostname.some(key => hostname.includes(key))) matched = true;
      else if (rules.path.some(key => path.includes(key))) matched = true;
      else if (rules.title.some(key => title.includes(key))) matched = true;

      if (matched) {
        tags.add(tag);
      }
    }
  } catch (e) {
    // ignore invalid URLs
  }

  if (tags.size === 0) {
    tags.add("Other");
  }

  return Array.from(tags);
}

// folder tree
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

// sorting
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
  } else if (VIEW_MODE === "tags") {

    // filter items by selected tags
    let filtered = items;
    if (SELECTED_TAGS.size > 0) {
      filtered = items.filter(item => {
        const tags = item.tags && item.tags.length ? item.tags : ["Other"];
        return tags.some(t => SELECTED_TAGS.has(t));
      });
    }

    content = renderTagView(filtered);
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

// tag view render
function renderTagView(items) {
  const ul = document.createElement("ul");
  ul.className = "tagView";

  const tagMap = new Map();

  items.forEach(item => {
    const tags = item.tags && item.tags.length ? item.tags : ["Other"];
    tags.forEach(tag => {
      if (SELECTED_TAGS.size > 0 && !SELECTED_TAGS.has(tag)) return;

      if (!tagMap.has(tag)) {
        tagMap.set(tag, []);
      }
      tagMap.get(tag).push(item);
    });
  });

  const sortedTags = Array.from(tagMap.keys()).sort((a, b) =>
    a.localeCompare(b)
  );

  sortedTags.forEach(tag => {
    const tagLi = document.createElement("li");
    tagLi.className = "tagGroup";

    const header = document.createElement("div");
    header.className = "tagHeader";
    header.textContent = `${tag} (${tagMap.get(tag).length})`;
    tagLi.appendChild(header);

    const list = document.createElement("ul");
    tagMap.get(tag).forEach(item => {
      list.appendChild(createBookmarkItem(item));
    });

    tagLi.appendChild(list);
    ul.appendChild(tagLi);
  });

  renderTagFilters(items);

  return ul;
}

function renderTagFilters(items) {
  // If not in tag mode, clear and exit
  if (VIEW_MODE !== "tags") {
    const bar = document.getElementById("tagFilterBar");
    if (bar) bar.innerHTML = "";
    return;
  }

  const controls = document.getElementById("controls");
  let tagFilterBar = document.getElementById("tagFilterBar");

  if (!tagFilterBar) {
    tagFilterBar = document.createElement("div");
    tagFilterBar.id = "tagFilterBar";
    tagFilterBar.className = "tagFilterBar";
    controls.appendChild(tagFilterBar);
  }

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

// folder tree render
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

// favicon
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

// view mode toggle
function wireViewMode() {
  const controls = document.getElementById("controls");

  // clear old content
  controls.innerHTML = "";

  // create left + right containers
  const left = document.createElement("div");
  left.id = "controlsLeft";

  const right = document.createElement("div");
  right.id = "controlsRight";

  // ----- VIEW TOGGLE (Folders / Tags) -----
  const toggle = document.createElement("div");
  toggle.className = "viewToggle";

  const btnFolders = document.createElement("button");
  btnFolders.textContent = "Folders";
  const btnTags = document.createElement("button");
  btnTags.textContent = "Tags";

  const sync = () => {
    if (VIEW_MODE === "folders") {
      const tagBar = document.getElementById("tagFilterBar");
if (tagBar) tagBar.innerHTML = "";
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
    sync();
    renderList(ALL_BOOKMARKS);
  });

  btnTags.addEventListener("click", () => {
    VIEW_MODE = "tags";
    sync();
    renderList(ALL_BOOKMARKS);
  });

  toggle.appendChild(btnFolders);
  toggle.appendChild(btnTags);
  sync();

  left.appendChild(toggle);

  // ----- SORT SELECT -----
  const sortSelect = document.createElement("select");
  sortSelect.id = "sortSelect";
  sortSelect.innerHTML = `
    <option value="none">No sorting</option>
    <option value="title-asc">Title A–Z</option>
    <option value="title-desc">Title Z–A</option>
    <option value="date-desc">Newest first</option>
    <option value="date-asc">Oldest first</option>
  `;
  sortSelect.addEventListener("change", () => {
    CURRENT_SORT = sortSelect.value;
    renderList(ALL_BOOKMARKS);
  });

  // ----- DEDUP BUTTON -----
  const dedupBtn = document.createElement("button");
  dedupBtn.id = "dedupBtn";
  dedupBtn.textContent = "Remove duplicates";
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

  right.appendChild(sortSelect);
  right.appendChild(dedupBtn);

  // attach both sides
  controls.appendChild(left);
  controls.appendChild(right);
}
