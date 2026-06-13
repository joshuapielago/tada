/* TaDa! homepage prototypes — shared deck gallery data + renderer.
 * Every "deck" is drawn as a real 16:9 HTML slide so the wall looks like
 * an actual gallery of beautiful decks. Sizing uses container-query units
 * (cqw) so a thumbnail stays crisp at any size. No build step, no deps. */
(function (global) {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* Confetti dots scattered for the playful, human feel. */
  function dots(colors, n) {
    var out = "";
    for (var i = 0; i < n; i++) {
      var c = colors[i % colors.length];
      var top = (7 + ((i * 37) % 80)).toFixed(1);
      var left = (6 + ((i * 53) % 86)).toFixed(1);
      var size = (1.4 + ((i * 7) % 22) / 10).toFixed(1);
      out +=
        '<span class="ds-dot" style="top:' + top + "%;left:" + left +
        "%;width:" + size + "cqw;height:" + size + "cqw;background:" + c + '"></span>';
    }
    return out;
  }

  function bars(values, accent, accent2) {
    var out = '<div class="ds-bars">';
    for (var i = 0; i < values.length; i++) {
      var col = i === values.length - 1 ? accent : accent2;
      out +=
        '<span style="height:' + values[i] + "%;background:" + col + '"></span>';
    }
    return out + "</div>";
  }

  /* ---- slide templates, keyed by deck.kind ---------------------------- */
  var templates = {
    cover: function (d) {
      var t = d.theme;
      return (
        dots([t.accent, t.accent2, t.accent3], 7) +
        '<div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<div class="ds-grow"></div>' +
        '<h3 class="ds-title">' + esc(d.title) + "</h3>" +
        (d.sub ? '<p class="ds-sub">' + esc(d.sub) + "</p>" : "") +
        '<div class="ds-foot"><span class="ds-by">' + esc(d.author) + "</span><span class=\"ds-pg\">01</span></div>"
      );
    },
    stat: function (d) {
      var t = d.theme;
      return (
        '<div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<div class="ds-statwrap"><div class="ds-stat" style="color:' + t.accent + '">' + esc(d.stat) + "</div>" +
        '<div class="ds-statlabel">' + esc(d.statLabel) + "</div></div>" +
        bars(d.bars || [40, 60, 52, 78, 100], t.accent, t.accent2) +
        '<div class="ds-foot"><span class="ds-by">' + esc(d.author) + "</span><span class=\"ds-pg\">04</span></div>"
      );
    },
    chart: function (d) {
      var t = d.theme;
      return (
        '<div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<h3 class="ds-title sm">' + esc(d.title) + "</h3>" +
        bars(d.bars || [34, 52, 44, 70, 58, 92], t.accent, t.accent2) +
        '<div class="ds-legend"><span style="background:' + t.accent2 + '"></span>' + esc(d.legend || "Last year") +
        '<span style="background:' + t.accent + '"></span>' + esc(d.legend2 || "This year") + "</div>"
      );
    },
    quote: function (d) {
      var t = d.theme;
      return (
        '<div class="ds-mark" style="color:' + t.accent + '">&ldquo;</div>' +
        '<p class="ds-quote">' + esc(d.title) + "</p>" +
        '<div class="ds-foot"><span class="ds-by">' + esc(d.author) + "</span></div>"
      );
    },
    grid: function (d) {
      var t = d.theme;
      var cells = (d.cells || ["Aa", "Bb", "01", "→"]);
      var inner = "";
      for (var i = 0; i < cells.length; i++) {
        var bg = [t.accent, t.accent2, t.accent3, "transparent"][i % 4];
        inner += '<span style="background:' + bg + '">' + esc(cells[i]) + "</span>";
      }
      return (
        '<div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<h3 class="ds-title sm">' + esc(d.title) + "</h3>" +
        '<div class="ds-grid">' + inner + "</div>"
      );
    },
    agenda: function (d) {
      var t = d.theme;
      var items = d.items || ["Encoding", "Storage", "Retrieval", "Forgetting"];
      var inner = "";
      for (var i = 0; i < items.length; i++) {
        inner +=
          '<li><b style="color:' + t.accent + '">' + (i + 1) +
          "</b>" + esc(items[i]) + "</li>";
      }
      return (
        '<div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<h3 class="ds-title sm">' + esc(d.title) + "</h3>" +
        '<ol class="ds-agenda">' + inner + "</ol>"
      );
    },
    photo: function (d) {
      var t = d.theme;
      return (
        '<div class="ds-photo" style="background:' + (d.photo || t.bg) + '">' +
        dots([t.accent, t.accent2, t.accent3], 5) +
        '<div class="ds-shape" style="background:' + t.accent2 + '"></div>' +
        "</div>" +
        '<div class="ds-cap"><div class="ds-eyebrow" style="color:' + t.accent + '">' + esc(d.eyebrow || d.category) + "</div>" +
        '<h3 class="ds-title xs">' + esc(d.title) + "</h3></div>"
      );
    },
  };

  function renderDeck(d) {
    var t = d.theme;
    var body = (templates[d.kind] || templates.cover)(d);
    return (
      '<div class="ds ' + (t.mode === "dark" ? "ds-dark" : "ds-light") +
      ' ds-' + d.kind + '" style="background:' + t.bg + ";color:" + t.ink +
      ';--accent:' + t.accent + ";--accent2:" + t.accent2 +
      ';--soft:' + (t.soft || "rgba(0,0,0,.5)") + '">' + body + "</div>"
    );
  }

  /* Full gallery card = slide + meta row (author, category, likes). */
  function renderCard(d, extraClass) {
    return (
      '<a class="deck-card ' + (extraClass || "") + '" href="#" data-deck="' + esc(d.id) +
      '" aria-label="' + esc(d.title) + ' by ' + esc(d.author) + '">' +
      '<div class="deck-slide">' + renderDeck(d) + "</div>" +
      '<div class="deck-meta">' +
      '<span class="deck-avatar" style="background:' + d.avatarColor + '">' + esc(d.initials) + "</span>" +
      '<span class="deck-info"><b>' + esc(d.title) + "</b><i>" + esc(d.author) + "</i></span>" +
      '<span class="deck-likes">♥ ' + d.likes + "</span>" +
      "</div></a>"
    );
  }

  /* ---- the gallery: a curated set of "the best decks globally" -------- */
  var P = {
    night: "#170d24", plum: "#23162e", paper: "#fffdfd", cream: "#fff7df",
    coral: "#ff4f68", coralDeep: "#df3651", mint: "#32c6b1", yellow: "#ffd24f",
    violet: "#7c4dff", sky: "#3867e8", ink: "#23162e", soft: "#766b7c",
  };

  var decks = [
    {
      id: "calm", title: "The Future of Calm Technology", author: "Maya Okonkwo",
      initials: "MO", avatarColor: P.mint, category: "Keynote", likes: "2.4k",
      featured: true, kind: "cover", eyebrow: "Keynote · SXSW",
      sub: "Designing software that respects your attention.",
      theme: { mode: "dark", bg: "linear-gradient(135deg,#1b1030,#2b1b46)", ink: "#fffdfd",
        soft: "rgba(255,253,253,.7)", accent: P.yellow, accent2: P.mint, accent3: P.coral },
    },
    {
      id: "seed", title: "$4.2M", author: "Loop — Seed Round 2026",
      initials: "LP", avatarColor: P.coral, category: "Pitch", likes: "5.1k",
      featured: true, kind: "stat", eyebrow: "Pitch deck",
      stat: "$4.2M", statLabel: "raised to reinvent local logistics", bars: [38, 55, 49, 72, 100],
      theme: { mode: "light", bg: "linear-gradient(135deg,#fff,#fff1f3)", ink: P.ink,
        soft: P.soft, accent: P.coralDeep, accent2: "#ffd9df", accent3: P.yellow },
    },
    {
      id: "climate", title: "State of the Climate 2026", author: "Terra Institute",
      initials: "TI", avatarColor: P.mint, category: "Report", likes: "3.8k",
      kind: "chart", eyebrow: "Annual report", legend: "2015", legend2: "2026",
      bars: [30, 44, 40, 63, 55, 88],
      theme: { mode: "light", bg: "linear-gradient(135deg,#f4fffb,#eafaf5)", ink: "#10362d",
        soft: "#4f6b63", accent: "#0e9e84", accent2: "#bdeee2", accent3: P.yellow },
    },
    {
      id: "mono", title: "Mono — Brand Guidelines", author: "Studio Mono",
      initials: "SM", avatarColor: P.ink, category: "Brand", likes: "6.7k",
      featured: true, kind: "grid", eyebrow: "Identity system",
      cells: ["Aa", "M", "01", "®"],
      theme: { mode: "light", bg: "linear-gradient(135deg,#fbfbf9,#f1efe9)", ink: "#16140f",
        soft: "#6b665c", accent: "#16140f", accent2: P.cream, accent3: P.coral },
    },
    {
      id: "aria", title: "Aria — Portfolio 2026", author: "Aria Belmonte",
      initials: "AB", avatarColor: P.violet, category: "Portfolio", likes: "4.5k",
      kind: "photo", eyebrow: "Selected work",
      photo: "linear-gradient(135deg,#7c4dff,#ff4f68 70%,#ffd24f)",
      theme: { mode: "light", bg: "#fff", ink: P.ink, soft: P.soft,
        accent: P.violet, accent2: "#fff", accent3: P.yellow },
    },
    {
      id: "growth", title: "+312%", author: "Q2 Growth Review",
      initials: "Q2", avatarColor: P.yellow, category: "Business", likes: "1.9k",
      kind: "stat", eyebrow: "Quarterly review",
      stat: "+312%", statLabel: "year-over-year revenue growth", bars: [42, 50, 61, 70, 100],
      theme: { mode: "dark", bg: "linear-gradient(135deg,#0e0b12,#241833)", ink: "#fffdfd",
        soft: "rgba(255,253,253,.66)", accent: P.yellow, accent2: "rgba(255,210,79,.28)", accent3: P.mint },
    },
    {
      id: "kinfolk", title: "Slowness is a kind of attention you give the world.",
      author: "Kinfolk · No. 7", initials: "K7", avatarColor: P.coralDeep,
      category: "Editorial", likes: "8.2k", featured: true, kind: "quote",
      theme: { mode: "light", bg: "linear-gradient(135deg,#fff9ef,#fff3df)", ink: "#3a2f23",
        soft: "#8a7a63", accent: P.coralDeep, accent2: P.yellow, accent3: P.mint },
    },
    {
      id: "north", title: "Northbound — A Travel Diary", author: "Ravi & June",
      initials: "RJ", avatarColor: P.mint, category: "Travel", likes: "3.3k",
      kind: "photo", eyebrow: "Iceland, week one",
      photo: "linear-gradient(135deg,#2bb6c6,#1f7a9e 60%,#0e3a52)",
      theme: { mode: "light", bg: "#fff", ink: P.ink, soft: P.soft,
        accent: P.yellow, accent2: "#ffe9a8", accent3: P.coral },
    },
    {
      id: "memory", title: "How Memory Works", author: "Dr. Lena Park",
      initials: "LP", avatarColor: P.violet, category: "Education", likes: "2.1k",
      kind: "agenda", eyebrow: "Lecture 04",
      items: ["Encoding", "Consolidation", "Retrieval", "Forgetting"],
      theme: { mode: "light", bg: "linear-gradient(135deg,#f7f4ff,#efeaff)", ink: "#2a1c4a",
        soft: "#6a5f86", accent: P.violet, accent2: "#dcd2ff", accent3: P.coral },
    },
    {
      id: "lunar", title: "Lunar — Product Launch", author: "Lunar Labs",
      initials: "LL", avatarColor: P.sky, category: "Product", likes: "5.9k",
      featured: true, kind: "grid", eyebrow: "Spring release",
      cells: ["◐", "✶", "v2", "→"],
      theme: { mode: "dark", bg: "linear-gradient(135deg,#0c1226,#13235a)", ink: "#fffdfd",
        soft: "rgba(255,253,253,.66)", accent: "#7aa2ff", accent2: "rgba(122,162,255,.25)", accent3: P.mint },
    },
    {
      id: "bloom", title: "Bloom", author: "Sofia & Daniel",
      initials: "SD", avatarColor: P.coral, category: "Event", likes: "1.4k",
      kind: "cover", eyebrow: "We're getting married", sub: "June 21 · Tuscany",
      theme: { mode: "light", bg: "linear-gradient(135deg,#fff5f6,#ffe9ef)", ink: "#7a2740",
        soft: "#b07487", accent: P.coralDeep, accent2: P.yellow, accent3: P.mint },
    },
    {
      id: "signal", title: "Signal — Frontier AI Research", author: "Signal Lab",
      initials: "SL", avatarColor: P.mint, category: "Research", likes: "7.1k",
      kind: "chart", eyebrow: "2026 findings", legend: "Baseline", legend2: "Signal",
      bars: [28, 41, 38, 60, 74, 96],
      theme: { mode: "dark", bg: "linear-gradient(135deg,#0a1413,#0f2a26)", ink: "#eafff9",
        soft: "rgba(234,255,249,.6)", accent: P.mint, accent2: "rgba(50,198,177,.25)", accent3: P.yellow },
    },
    {
      id: "tempo", title: "Tempo", author: "Tempo Music",
      initials: "TM", avatarColor: P.violet, category: "Music", likes: "4.0k",
      kind: "cover", eyebrow: "Brand world", sub: "Sound, in living color.",
      theme: { mode: "dark", bg: "linear-gradient(135deg,#3a0d6e,#7c4dff 70%,#ff4f68)", ink: "#fffdfd",
        soft: "rgba(255,253,253,.74)", accent: P.yellow, accent2: P.mint, accent3: "#fff" },
    },
    {
      id: "harvest", title: "Harvest — Autumn Menu", author: "Harvest Kitchen",
      initials: "HK", avatarColor: P.coralDeep, category: "Food", likes: "2.7k",
      kind: "photo", eyebrow: "Seasonal tasting",
      photo: "linear-gradient(135deg,#e8893f,#c2452f 65%,#5e1f1c)",
      theme: { mode: "light", bg: "#fff", ink: P.ink, soft: P.soft,
        accent: P.yellow, accent2: "#ffdca0", accent3: P.mint },
    },
  ];

  global.TADA = {
    palette: P,
    decks: decks,
    featured: decks.filter(function (d) { return d.featured; }),
    byId: function (id) { return decks.filter(function (d) { return d.id === id; })[0]; },
    categories: ["All", "Pitch", "Product", "Report", "Brand", "Portfolio",
      "Editorial", "Keynote", "Travel", "Event"],
    renderDeck: renderDeck,
    renderCard: renderCard,
  };
})(window);
