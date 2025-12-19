// Render bookmarks recursively (folder or link)
function renderBookmarks(bookmarks) {
  const ul = document.createElement('ul');

  bookmarks.forEach(bookmark => {
    const li = document.createElement('li');

    if (bookmark.url) {
      li.className = 'bookmark';
      const a = document.createElement('a');
      a.href = bookmark.url;
      const title = bookmark.title || bookmark.url;
      a.textContent = title;
      a.title = title;
      a.target = '_blank';
      li.appendChild(a);
    } else {
      li.className = 'folder';
      li.textContent = bookmark.title || 'Untitled folder';

      if (bookmark.children) {
        li.appendChild(renderBookmarks(bookmark.children));
      }
    }

    ul.appendChild(li);
  });

  return ul;
}

// Global state for all bookmarks + current sort mode
let ALL_BOOKMARKS = [];
let CURRENT_SORT = 'none'; // default sort

// Flatten Chrome bookmark tree for search & sorting
function flattenBookmarks(nodes, acc = [], path = []) {
  nodes.forEach(n => {
    const currentPath = n.title ? [...path, n.title] : path;

    if (n.url) {
      acc.push({
        title: n.title || n.url,
        url: n.url,
        path: currentPath.join(' / '),
        dateAdded: n.dateAdded || 0
      });
    } else if (n.children) {
      flattenBookmarks(n.children, acc, currentPath);
    }
  });

  return acc;
}

// Group bookmarks by top-level folder (Normal View)
function groupByFolders(items) {
  const map = new Map();

  items.forEach(it => {
    const top = (it.path.split(' / ')[0] || 'Bookmarks bar').trim();
    if (!map.has(top)) map.set(top, []);
    map.get(top).push(it);
  });

  return Array.from(map.entries()).map(([folder, links]) => ({
    title: folder,
    children: links.map(l => ({ title: l.title, url: l.url }))
  }));
}

// Sort bookmarks (used only in Sorted View)
function applySort(items) {
  const sorted = [...items];

  if (CURRENT_SORT === 'title-asc') {
    sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (CURRENT_SORT === 'title-desc') {
    sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  } else if (CURRENT_SORT === 'date-desc') {
    sorted.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  } else if (CURRENT_SORT === 'date-asc') {
    sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
  }

  return sorted;
}

// Normalize URL for smarter duplicate detection
function normalizeUrl(rawUrl) {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);

    // 1) Host: lowercase + remove leading www.
    let host = url.hostname.toLowerCase();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }

    // 2) Path: remove trailing slash (except root "/")
    let path = url.pathname || '';
    if (path.endsWith('/') && path !== '/') {
      path = path.slice(0, -1);
    }

    // 3) Remove hash completely
    // (we just ignore url.hash on purpose)

    // 4) Keep only non-tracking query parameters
    const trackingParams = new Set([
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'igshid',
      'mc_cid',
      'mc_eid',
      'ref'
    ]);

    const params = [];
    url.searchParams.forEach((value, key) => {
      if (!trackingParams.has(key)) {
        params.push(`${key}=${value}`);
      }
    });

    const query = params.length ? `?${params.join('&')}` : '';

    // We intentionally drop protocol (http/https)
    return `${host}${path}${query}`;
  } catch (e) {
    // If URL constructor fails, fallback to raw
    return rawUrl;
  }
}

// Remove duplicate bookmarks using normalized URL
function dedupBookmarks(items) {
  const seen = new Set();
  const unique = [];
  let removedCount = 0;

  items.forEach(b => {
    const normalized = normalizeUrl(b.url);

    if (seen.has(normalized)) {
      removedCount++;
    } else {
      seen.add(normalized);
      unique.push(b);
    }
  });

  return { unique, removedCount };
}

// Render list depending on sort mode
// Normal View → folder structure
// Sorted View → flat list
function renderList(items) {
  const container = document.getElementById('listContainer');
  container.innerHTML = '';

  // If sorting is active → show flat list
  if (CURRENT_SORT !== 'none') {
    const sorted = applySort(items);
    const flat = sorted.map(l => ({ title: l.title, url: l.url }));
    container.appendChild(renderBookmarks(flat));
    return;
  }

  // Otherwise → show folder structure
  container.appendChild(renderBookmarks(groupByFolders(items)));
}

// Wire up search input (always flat search like Chrome)
function wireSearch() {
  const input = document.getElementById('searchInput');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();

    const filtered = q
      ? ALL_BOOKMARKS.filter(b =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.url || '').toLowerCase().includes(q)
        )
      : ALL_BOOKMARKS;

    renderList(filtered);
    highlightQuery(q);
  });
}

// Highlight matched query inside links
function highlightQuery(q) {
  if (!q) return;

  const anchors = document.querySelectorAll('li.bookmark a');
  anchors.forEach(a => {
    const txt = a.textContent;
    const re = new RegExp(`(${escapeReg(q)})`, 'gi');
    a.innerHTML = txt.replace(re, '<mark>$1</mark>');
  });
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wire up sort dropdown
function wireSort() {
  const select = document.getElementById('sortSelect');
  if (!select) return;

  select.addEventListener('change', () => {
    CURRENT_SORT = select.value;
    const q = document.getElementById('searchInput').value.trim().toLowerCase();

    const filtered = q
      ? ALL_BOOKMARKS.filter(b =>
          (b.title || '').toLowerCase().includes(q) ||
          (b.url || '').toLowerCase().includes(q)
        )
      : ALL_BOOKMARKS;

    renderList(filtered);
    highlightQuery(q);
  });
}

// Initialize UI after loading Chrome bookmarks
function initUI(bookmarksTree) {
  ALL_BOOKMARKS = flattenBookmarks(bookmarksTree);
  renderList(ALL_BOOKMARKS);
  wireSearch();
  wireSort();
  wireDedup();
}

function wireDedup() {
  const btn = document.getElementById('dedupBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const { unique, removedCount } = dedupBookmarks(ALL_BOOKMARKS);

    ALL_BOOKMARKS = unique;

    // بعد از حذف، دوباره رندر کن
    renderList(ALL_BOOKMARKS);

    // پیام نتیجه
    alert(
      removedCount === 0
        ? "No duplicates found."
        : `Removed ${removedCount} duplicate bookmarks.`
    );
  });
}

// Entry point: load Chrome bookmarks
chrome.bookmarks.getTree(tree => {
  initUI(tree[0].children);
});