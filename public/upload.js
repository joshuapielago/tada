const state = {
  mode: "paste",
  selectedFile: null,
};

const elements = {
  form: document.querySelector("#uploadForm"),
  tabs: [...document.querySelectorAll(".mode-tab")],
  pastePanel: document.querySelector("#pastePanel"),
  filePanel: document.querySelector("#filePanel"),
  urlPanel: document.querySelector("#urlPanel"),
  titleInput: document.querySelector("#titleInput"),
  htmlInput: document.querySelector("#htmlInput"),
  fileInput: document.querySelector("#fileInput"),
  urlInput: document.querySelector("#urlInput"),
  certifyInput: document.querySelector("#certifyInput"),
  uploadButton: document.querySelector("#uploadButton"),
  uploadStatus: document.querySelector("#uploadStatus"),
  result: document.querySelector("#result"),
  shareUrl: document.querySelector("#shareUrl"),
  copyButton: document.querySelector("#copyButton"),
  openDeckLink: document.querySelector("#openDeckLink"),
  noticeList: document.querySelector("#noticeList"),
  toast: document.querySelector("#toast"),
};

for (const tab of elements.tabs) {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
}

elements.fileInput.addEventListener("change", () => {
  state.selectedFile = elements.fileInput.files?.[0] ?? null;
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await uploadCurrentInput();
});

elements.copyButton.addEventListener("click", async () => {
  const value = elements.shareUrl.textContent.trim();
  if (!value) {
    return;
  }
  await navigator.clipboard.writeText(value);
  showToast("Copied.");
});

function setMode(mode) {
  state.mode = mode;
  for (const tab of elements.tabs) {
    tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
  }
  elements.pastePanel.hidden = mode !== "paste";
  elements.filePanel.hidden = mode !== "file";
  elements.urlPanel.hidden = mode !== "url";
}

async function uploadCurrentInput() {
  if (!elements.certifyInput.checked) {
    showToast("Confirm Upload Certification first.");
    return;
  }

  const body = {
    certifyRights: true,
    title: elements.titleInput.value.trim() || undefined,
    uploadSurface: "web",
  };

  try {
    if (state.mode === "paste") {
      body.html = elements.htmlInput.value;
      if (!body.html.trim()) {
        throw new Error("Paste HTML before uploading.");
      }
    } else if (state.mode === "file") {
      const file = state.selectedFile;
      if (!file) {
        throw new Error("Choose an HTML file.");
      }
      body.html = await file.text();
      body.sourceLabel = file.name;
    } else {
      body.sourceUrl = elements.urlInput.value.trim();
      if (!body.sourceUrl) {
        throw new Error("Enter a public URL.");
      }
    }

    setBusy(true);
    const response = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Upload failed.");
    }
    renderResult(payload);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function renderResult(deck) {
  elements.result.hidden = false;
  elements.shareUrl.textContent = deck.viewUrl;
  elements.openDeckLink.href = deck.viewUrl;
  elements.noticeList.replaceChildren(
    ...[...(deck.warnings ?? []), ...(deck.notices ?? [])].map((item) => {
      const li = document.createElement("li");
      li.dataset.kind = deck.warnings?.includes(item) ? "warning" : "notice";
      li.textContent = item.message;
      return li;
    }),
  );
}

function setBusy(isBusy) {
  elements.uploadButton.disabled = isBusy;
  elements.uploadStatus.textContent = isBusy ? "Uploading..." : "";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}
