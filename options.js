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
    fontSize: fontSize.value,
    theme: theme.value
  });
}

document.querySelectorAll("input, select").forEach(el => {
  el.addEventListener("change", save);
});

document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get(null, data => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smart-bookmarks-backup.json";
    a.click();
  });
});

document.getElementById("importBtn").addEventListener("click", () => {
  const file = importFile.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.set(JSON.parse(reader.result), () => {
      alert("Settings restored!");
      location.reload();
    });
  };
  reader.readAsText(file);
});