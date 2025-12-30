document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(null, data => {
    document.getElementById("enableDedup").checked = data.enableDedup ?? true;
    document.getElementById("enableSorting").checked = data.enableSorting ?? true;
    document.getElementById("showFavicons").checked = data.showFavicons ?? true;
    document.getElementById("showFolderIcons").checked = data.showFolderIcons ?? true;
    document.getElementById("showDateAdded").checked = data.showDateAdded ?? false;
    document.getElementById("showCount").checked = data.showCount ?? true;
    document.getElementById("compactMode").checked = data.compactMode ?? false;
    document.getElementById("enableShortcuts").checked = data.enableShortcuts ?? true;
    document.getElementById("enableManualTags").checked = data.enableManualTags ?? true;
    document.getElementById("showVisitCount").checked = data.showVisitCount ?? true;

    document.getElementById("fontSize").value = data.fontSize ?? "medium";
    document.getElementById("theme").value = data.theme ?? "light";
  });
});

function save() {
  chrome.storage.local.set({
    enableDedup: enableDedup.checked,
    enableSorting: enableSorting.checked,
    showFavicons: showFavicons.checked,
    showFolderIcons: showFolderIcons.checked,
    showDateAdded: showDateAdded.checked,
    showCount: showCount.checked,
    compactMode: compactMode.checked,
    enableShortcuts: enableShortcuts.checked,
    enableManualTags: enableManualTags.checked,
    showVisitCount: showVisitCount.checked,
    fontSize: fontSize.value,
    theme: theme.value
  });
}

document.querySelectorAll("input, select").forEach(el => {
  el.addEventListener("change", save);
});

async function buildExportObject() {
  const localData = await new Promise(resolve => chrome.storage.local.get(null, resolve));
  const syncData = await new Promise(resolve => chrome.storage.sync.get(null, resolve));
  const tree = await new Promise(resolve => chrome.bookmarks.getTree(resolve));

  const flat = [];
  function walk(nodes, path = []) {
    nodes.forEach(n => {
      const p = n.title ? [...path, n.title] : path;
      if (n.url) {
        flat.push({
          id: n.id,
          title: n.title || n.url,
          url: n.url,
          path: p.join(" / ")
        });
      } else if (n.children) {
        walk(n.children, p);
      }
    });
  }
  walk(tree[0].children);

  const tagData = syncData.TAG_DATA || { tagsByBookmarkId: {}, allTags: [] };

  const bookmarks = flat.map(b => ({
    ...b,
    manualTags: tagData.tagsByBookmarkId[b.id] || []
  }));

  return {
    version: 1,
    generatedAt: Date.now(),
    bookmarks,
    tagData,
    learningModel: localData.tagLearningModel || {},
    settings: {
      enableDedup: localData.enableDedup,
      enableSorting: localData.enableSorting,
      showFavicons: localData.showFavicons,
      showFolderIcons: localData.showFolderIcons,
      showDateAdded: localData.showDateAdded,
      showCount: localData.showCount,
      compactMode: localData.compactMode,
      enableShortcuts: localData.enableShortcuts,
      enableManualTags: localData.enableManualTags,
      showVisitCount: localData.showVisitCount,
      fontSize: localData.fontSize,
      theme: localData.theme
    },
    pinnedFolders: localData.PINNED_FOLDERS || [],
    folderState: localData.FOLDER_STATE || {}
  };
}

document.getElementById("exportBtn").addEventListener("click", async () => {
  const data = await buildExportObject();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "smart-bookmarks-backup.json";
  a.click();
});

document.getElementById("importBtn").addEventListener("click", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const data = JSON.parse(reader.result);

    const localUpdates = {};
    const syncUpdates = {};

    if (data.settings) {
      Object.assign(localUpdates, data.settings);
    }

    if (data.learningModel) {
      localUpdates.tagLearningModel = data.learningModel;
    }

    if (data.pinnedFolders) {
      localUpdates.PINNED_FOLDERS = data.pinnedFolders;
    }

    if (data.folderState) {
      localUpdates.FOLDER_STATE = data.folderState;
    }

    if (data.tagData) {
      syncUpdates.TAG_DATA = data.tagData;
    }

    chrome.storage.local.set(localUpdates, () => {
      chrome.storage.sync.set(syncUpdates, () => {
        alert("Import completed!");
        location.reload();
      });
    });
  };
  reader.readAsText(file);
});
