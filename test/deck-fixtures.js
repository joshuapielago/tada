export function sectionDeck({ count = 3, includeScripts = true } = {}) {
  const slides = Array.from({ length: count }, (_value, index) => {
    const slideNumber = index + 1;
    return `<section><h1>Section slide ${slideNumber}</h1><p>Payload ${slideNumber}</p></section>`;
  }).join("\n");
  const script = includeScripts
    ? `<script>
        window.sectionDeckBooted = true;
        document.documentElement.dataset.fixtureBooted = "yes";
      </script>`
    : "";

  return `<!doctype html>
    <html>
      <head><title>Section Fixture</title></head>
      <body>
        <main>${slides}</main>
        ${script}
      </body>
    </html>`;
}

export function customClassDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <div class="client-slide"><h1>Custom one</h1></div>
          <div class="client-slide"><h1>Custom two</h1></div>
          <div class="client-slide"><h1>Custom three</h1></div>
        </main>
      </body>
    </html>`;
}

export function existingActiveDeck() {
  return `<!doctype html>
    <html>
      <head>
        <title>Generated Active Fixture</title>
        <style>.slide{display:none}.slide.active{display:block}</style>
      </head>
      <body>
        <div class="deck">
          <section class="slide active" data-notes="Opening note"><h1>Generated one</h1></section>
          <section class="slide" data-notes="Second note"><h1>Generated two</h1></section>
          <section class="slide" data-notes="Third note"><h1>Generated three</h1></section>
        </div>
        <script>
          window.generatedBooted = true;
        </script>
      </body>
    </html>`;
}

export function revealDeck() {
  return `<!doctype html>
    <html>
      <body>
        <div class="reveal">
          <div class="slides">
            <section><h1>Reveal one</h1></section>
            <section><h1>Reveal two</h1></section>
          </div>
        </div>
      </body>
    </html>`;
}

export function remarkDeck() {
  return `<!doctype html>
    <html>
      <body>
        <div class="remark-slide"><h1>Remark one</h1></div>
        <div class="remark-slide"><h1>Remark two</h1></div>
      </body>
    </html>`;
}

export function swiperDeck() {
  return `<!doctype html>
    <html>
      <body>
        <div class="swiper">
          <div class="swiper-slide"><h1>Swiper one</h1></div>
          <div class="swiper-slide"><h1>Swiper two</h1></div>
        </div>
      </body>
    </html>`;
}

export function dataSlideDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <section data-slide="intro" data-notes="Intro note"><h1>Data one</h1></section>
          <section data-slide="proof" data-notes="Proof note"><h1>Data two</h1></section>
        </main>
      </body>
    </html>`;
}

export function markerCopyDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <section>
            <h1>Structure-aware ingest</h1>
            <p>TaDa! can recognize <code>data-slide</code>, <code>data-notes</code>, <code>.deck</code>, and <code>.slide.active</code> when they are real HTML structure.</p>
          </section>
          <section><h1>Normal section two</h1></section>
        </main>
      </body>
    </html>`;
}

export function articleDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <article><h1>Article one</h1></article>
          <article><h1>Article two</h1></article>
        </main>
      </body>
    </html>`;
}

export function headingDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <h1>Heading one</h1>
          <p>First heading payload</p>
          <h2>Heading two</h2>
          <p>Second heading payload</p>
          <h1>Heading three</h1>
          <p>Third heading payload</p>
        </main>
      </body>
    </html>`;
}

export function commentDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <h1>Comment one</h1>
          <p>First comment payload</p>
          <!-- slide -->
          <h1>Comment two</h1>
          <p>Second comment payload</p>
        </main>
      </body>
    </html>`;
}

export function horizontalRuleDeck() {
  return `<!doctype html>
    <html>
      <body>
        <main>
          <h1>Rule one</h1>
          <p>First rule payload</p>
          <hr>
          <h1>Rule two</h1>
          <p>Second rule payload</p>
        </main>
      </body>
    </html>`;
}
