const elements = {
  statsGrid: document.querySelector("#statsGrid"),
  deckRows: document.querySelector("#deckRows"),
  reportRows: document.querySelector("#reportRows"),
  toast: document.querySelector("#toast"),
};

loadStats();

async function loadStats() {
  try {
    const response = await fetch("/api/admin/stats");
    const stats = await response.json();
    if (!response.ok) {
      throw new Error(stats.error?.message ?? "Could not load stats.");
    }
    renderStats(stats);
  } catch (error) {
    showToast(error.message);
  }
}

function renderStats(stats) {
  elements.statsGrid.replaceChildren(
    statCard("Decks", stats.deckCount),
    statCard("Stored bytes", stats.storedBytes),
    statCard("Pending thumbs", stats.thumbnail?.pending ?? 0),
    statCard("Reports", stats.reports?.length ?? 0),
  );

  elements.deckRows.replaceChildren(
    ...(stats.recentDecks ?? []).map((deck) =>
      row([
        link(deck.title, deck.viewUrl),
        deck.uploadSurface ?? "unknown",
        String(deck.warnings?.length ?? 0),
        deck.thumbnailStatus,
        formatDate(deck.createdAt),
      ]),
    ),
  );

  if (!elements.deckRows.children.length) {
    elements.deckRows.append(row(["No decks yet", "", "", "", ""]));
  }

  elements.reportRows.replaceChildren(
    ...(stats.reports ?? []).map((report) =>
      row([
        link(report.deckId, report.viewUrl),
        report.reason,
        report.reporterEmail || "—",
        formatDate(report.createdAt),
      ]),
    ),
  );

  if (!elements.reportRows.children.length) {
    elements.reportRows.append(row(["No reports yet", "", "", ""]));
  }
}

function statCard(label, value) {
  const div = document.createElement("div");
  div.className = "stat";
  div.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong>`;
  return div;
}

function row(values) {
  const tr = document.createElement("tr");
  for (const value of values) {
    const td = document.createElement("td");
    if (value instanceof Node) {
      td.append(value);
    } else {
      td.textContent = value;
    }
    tr.append(td);
  }
  return tr;
}

function link(label, href) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = label;
  return anchor;
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
