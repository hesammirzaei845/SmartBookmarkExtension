document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('bookmark-list');

  // تابع بازگشتی برای نمایش بوکمارک‌ها
  function renderBookmarks(bookmarks) {
    const ul = document.createElement('ul');
    bookmarks.forEach(bookmark => {
      const li = document.createElement('li');
      if (bookmark.url) {
        // اگر بوکمارک لینک داشته باشه
        const a = document.createElement('a');
        a.href = bookmark.url;
        a.textContent = bookmark.title || bookmark.url;
        a.target = '_blank';
        li.appendChild(a);
      } else {
        // اگر پوشه باشه
        li.textContent = bookmark.title || 'پوشه بدون نام';
        if (bookmark.children) {
          li.appendChild(renderBookmarks(bookmark.children));
        }
      }
      ul.appendChild(li);
    });
    return ul;
  }

  // گرفتن بوکمارک‌ها از API کروم
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    listContainer.innerHTML = ''; // پاک کردن متن "در حال بارگذاری..."
    listContainer.appendChild(renderBookmarks(bookmarkTreeNodes));
  });
});