const exportButton = document.getElementById("export-data");
const deleteButton = document.getElementById("delete-data");

const exportData = async () => {
  const res = await fetch("http://127.0.0.1:8000/export");
  if (!res.ok) return;
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aic_export.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const deleteAllData = async () => {
  await fetch("http://127.0.0.1:8000/delete_all", { method: "POST" });
  if (window.aic && window.aic.sendDataDeleted) {
    window.aic.sendDataDeleted();
  }
};

exportButton.addEventListener("click", exportData);
deleteButton.addEventListener("click", deleteAllData);
