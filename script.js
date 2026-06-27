import { num, num0 } from "https://cdn.jsdelivr.net/npm/@gramex/ui@0.3/dist/format.js";
import { marked } from "https://cdn.jsdelivr.net/npm/marked@12/+esm";
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { default as fuzzysort } from "https://cdn.jsdelivr.net/npm/fuzzysort@3/+esm";

// Load and display README content
const content = await fetch("README.md").then((r) => r.text());
document.querySelector("#README").innerHTML = marked.parse(content);

let quality = new URLSearchParams(window.location.search).get("quality") || "overall";
document.querySelector("#quality").textContent = quality.charAt(0).toUpperCase() + quality.slice(1);

// Load and process model data
const data = await d3.csv("elo.csv");
const hasEloScore = (row, field) => row[field]?.trim() !== "" && Number.isFinite(+row[field]);
const models = data
  .filter((d) => Number.isFinite(+d.cpmi) && +d.cpmi > 0 && hasEloScore(d, quality))
  .map((d) => ({ ...d, cost: +d.cpmi, elo: +d[quality] }));

// ─── Provider derivation & filter ────────────────────────────────────────────
// A model's provider comes from its source URL (OpenRouter org slug or a known
// doc host); when there's no usable source we fall back to the model-name prefix.
const PROVIDER_HOSTS = {
  "ai.google.dev": "google",
  "docs.anthropic.com": "anthropic",
  "platform.claude.com": "anthropic",
  "claude.com": "anthropic",
  "openai.com": "openai",
  "platform.openai.com": "openai",
  "docs.mistral.ai": "mistralai",
  "docs.x.ai": "x-ai",
  "x.ai": "x-ai",
  "open.bigmodel.cn": "z-ai",
  "docs.together.ai": "together",
  "developers.cloudflare.com": "cloudflare",
  "learn.microsoft.com": "microsoft",
};
const PROVIDER_NAME_RULES = [
  [/^(claude|anthropic)/, "anthropic"],
  [/^(gpt|o[1-4]\b|chatgpt|codex)/, "openai"],
  [/^(gemini|gemma|palm)/, "google"],
  [/^grok/, "x-ai"],
  [/^deepseek/, "deepseek"],
  [/^(qwen|qwq)/, "qwen"],
  [/^glm/, "z-ai"],
  [/^kimi/, "moonshotai"],
  [/^(llama|meta)/, "meta-llama"],
  [/^(mistral|mixtral|devstral|magistral|codestral|ministral|pixtral)/, "mistralai"],
  [/^mimo/, "xiaomi"],
  [/^minimax/, "minimax"],
  [/^ernie/, "baidu"],
  [/^(hunyuan|hy\d)/, "tencent"],
  [/^(command|cohere|aya)/, "cohere"],
  [/^phi/, "microsoft"],
  [/^granite/, "ibm-granite"],
  [/^(nemotron|nvidia)/, "nvidia"],
  [/^yi/, "01-ai"],
  [/^trinity/, "arcee-ai"],
  [/^(olmo|tulu|molmo)/, "allenai"],
  [/^(amazon|nova|titan)/, "amazon"],
  [/^pplx/, "perplexity"],
];
const PROVIDER_LABELS = {
  openai: "OpenAI", google: "Google", anthropic: "Anthropic", qwen: "Qwen",
  deepseek: "DeepSeek", "x-ai": "xAI", mistralai: "Mistral", "z-ai": "Z.AI",
  "meta-llama": "Meta", nvidia: "NVIDIA", moonshotai: "Moonshot", minimax: "MiniMax",
  xiaomi: "Xiaomi", cohere: "Cohere", allenai: "Ai2", baidu: "Baidu", "01-ai": "01.AI",
  amazon: "Amazon", microsoft: "Microsoft", tencent: "Tencent", "arcee-ai": "Arcee",
  "ibm-granite": "IBM", together: "Together", cloudflare: "Cloudflare", perplexity: "Perplexity",
};
const titleCase = (s) => s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const providerLabel = (slug) => PROVIDER_LABELS[slug] || (slug && slug !== "other" ? titleCase(slug) : "Other");

const providerSlugOf = (model, source) => {
  const src = (source || "").trim();
  const or = src.match(/openrouter\.ai\/(?:models\/)?([^/]+)\//);
  if (or) return or[1];
  const host = src.match(/^https?:\/\/([^/]+)/);
  if (host && PROVIDER_HOSTS[host[1]]) return PROVIDER_HOSTS[host[1]];
  const name = model.toLowerCase();
  for (const [re, slug] of PROVIDER_NAME_RULES) if (re.test(name)) return slug;
  return "other";
};
models.forEach((m) => (m.providerSlug = providerSlugOf(m.model, m.source)));

// Major providers (by model count) get their own button; the long tail folds into "Other".
const TOP_PROVIDERS = 9;
const providerCounts = d3.rollup(models, (v) => v.length, (d) => d.providerSlug);
const sortedSlugs = [...providerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
const majorSlugs = new Set(sortedSlugs.filter((s) => s !== "other").slice(0, TOP_PROVIDERS));
const providerButtons = [...majorSlugs];
if (models.some((m) => !majorSlugs.has(m.providerSlug))) providerButtons.push("other");

let selectedProviders = new Set(); // empty ⇒ show all providers
const providerKey = (d) => (majorSlugs.has(d.providerSlug) ? d.providerSlug : "other");
const matchesProvider = (d) => selectedProviders.size === 0 || selectedProviders.has(providerKey(d));

const $providerFilter = document.querySelector("#provider-filter");
const refreshProviderButtons = () => {
  $providerFilter.querySelectorAll("button[data-provider]").forEach((b) => {
    const on = selectedProviders.has(b.dataset.provider);
    b.classList.toggle("btn-primary", on);
    b.classList.toggle("btn-outline-secondary", !on);
  });
  const all = document.querySelector("#provider-all");
  all.classList.toggle("btn-primary", selectedProviders.size === 0);
  all.classList.toggle("btn-outline-primary", selectedProviders.size !== 0);
};
const buildProviderButtons = () => {
  const frag = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "text-nowrap small text-secondary me-1";
  label.textContent = "Provider:";
  frag.appendChild(label);

  const all = document.createElement("button");
  all.type = "button";
  all.id = "provider-all";
  all.className = "btn btn-sm rounded-pill btn-primary";
  all.textContent = "All";
  all.addEventListener("click", () => {
    selectedProviders.clear();
    refreshProviderButtons();
    update();
  });
  frag.appendChild(all);

  providerButtons.forEach((slug) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.provider = slug;
    btn.className = "btn btn-sm rounded-pill btn-outline-secondary";
    btn.textContent = providerLabel(slug);
    btn.addEventListener("click", () => {
      if (selectedProviders.has(slug)) selectedProviders.delete(slug);
      else selectedProviders.add(slug);
      refreshProviderButtons();
      update();
    });
    frag.appendChild(btn);
  });
  $providerFilter.replaceChildren(frag);
};
buildProviderButtons();

// Scrollytelling state
let scrollyHighlights = new Set();
let scrollyActive = false;

// Filter / zoom state
let hidden = new Set();        // categories the user has hidden: "best" | "worst" | "others"
let zoomDomain = null;         // { x: [min, max], y: [min, max] } in data units, or null for full extent
let zoomSelectMode = false;    // true while the user is dragging out a region to zoom into
let currentPlot = null;        // the most recently rendered Plot node (exposes .scale())

const dates = Array.from(new Set(models.map((d) => d.launch))).sort();
const $date = document.querySelector("#date");
$date.setAttribute("max", dates.length - 1);
$date.value = dates.length - 1;

const xScale = d3
  .scaleLog()
  .domain(d3.extent(models, (d) => d.cost))
  .range([0, 1000]);
const yScale = d3
  .scaleLinear()
  .domain(d3.extent(models, (d) => d.elo))
  .range([500, 0]);

// LMArena Elo mapped to academic milestones (Framework A)
const eloAnnotations = [
  { elo: 1000, label: "🧒 Middle schooler" },
  { elo: 1100, label: "🎒 HS freshman" },
  { elo: 1200, label: "🎓 HS graduate" },
  { elo: 1300, label: "📚 College junior" },
  { elo: 1350, label: "🏫 College grad" },
  { elo: 1400, label: "🎓 Master's student" },
  { elo: 1450, label: "🔬 PhD candidate" },
  { elo: 1480, label: "🏛 Tenured professor" },
];

const updateOptimalStatus = (filteredModels) => {
  filteredModels.forEach((model) => {
    model.optimal = filteredModels.every((other) => other === model || other.elo < model.elo || other.cost > model.cost)
      ? "best"
      : filteredModels.every((other) => other === model || other.elo >= model.elo || other.cost <= model.cost)
      ? "worst"
      : "";
  });
};

// Which colour bucket a model falls into (matches the dot fill logic below)
const categoryOf = (d) => (d.optimal === "best" ? "best" : d.optimal === "worst" ? "worst" : "others");

// Reflect filter/zoom state into the control buttons
const syncControls = () => {
  const select = document.querySelector("#zoom-select");
  select.classList.toggle("btn-primary", zoomSelectMode);
  select.classList.toggle("btn-outline-primary", !zoomSelectMode);
  select.classList.toggle("active", zoomSelectMode);
  select.textContent = zoomSelectMode ? "✏️ Drag a region…" : "🔍 Select & zoom";
  document.querySelector("#zoom-reset").disabled = !zoomDomain;
};

// Overlay a d3 brush on the current plot so the user can drag out a region to zoom into.
// Plot draws marks in the SVG's own pixel space, so the plot's scales convert pixels ↔ data.
const attachBrush = () => {
  const svg = document.querySelector("#llm-cost svg");
  if (!svg || !currentPlot) return;
  const xs = currentPlot.scale("x");
  const ys = currentPlot.scale("y");
  const xr = typeof xs.range === "function" ? xs.range() : xs.range;
  const yr = typeof ys.range === "function" ? ys.range() : ys.range;
  const [left, right] = [Math.min(xr[0], xr[1]), Math.max(xr[0], xr[1])];
  const [top, bottom] = [Math.min(yr[0], yr[1]), Math.max(yr[0], yr[1])];

  const brush = d3
    .brush()
    .extent([[left, top], [right, bottom]])
    .on("end", ({ selection }) => {
      if (!selection) return;
      const [[bx0, by0], [bx1, by1]] = selection;
      zoomDomain = {
        x: [xs.invert(bx0), xs.invert(bx1)], // left → lower cost, right → higher cost
        y: [ys.invert(by1), ys.invert(by0)], // bottom px → lower ELO, top px → higher ELO
      };
      zoomSelectMode = false;
      update();
      syncControls();
    });

  d3.select(svg).append("g").attr("class", "zoom-brush").call(brush);
};

const renderPlot = (filteredModels) => {
  const visible = filteredModels.filter(
    (d) => scrollyHighlights.has(d.model) || !hidden.has(categoryOf(d))
  );
  const plot = Plot.plot({
    marginLeft: 50,
    x: { type: "log", grid: true, domain: zoomDomain ? zoomDomain.x : xScale.domain() },
    y: { grid: true, domain: zoomDomain ? zoomDomain.y : yScale.domain() },
    width: 1000,
    height: 500,
    marks: [
      Plot.ruleY(eloAnnotations, {
        y: "elo",
        stroke: "#888",
        strokeOpacity: 0.3,
        strokeDasharray: "4,4",
        clip: true,
      }),
      Plot.text(eloAnnotations, {
        y: "elo",
        text: "label",
        frameAnchor: "right",
        textAnchor: "end",
        fontSize: 10,
        fill: "#888",
        dx: -4,
        dy: -5,
        clip: true,
      }),
      Plot.dot(visible, {
        x: "cost",
        y: "elo",
        r: 8,
        clip: true,
        fill: (d) => {
          if (scrollyHighlights.has(d.model)) return "#06b6d4";
          if (d.optimal === "best") return "lime";
          if (d.optimal === "worst") return "red";
          return "rgba(var(--bs-body-color-rgb), 0.1)";
        },
        fillOpacity: (d) =>
          scrollyActive && scrollyHighlights.size > 0 && !scrollyHighlights.has(d.model) ? 0.3 : 1,
        stroke: (d) => (scrollyHighlights.has(d.model) ? "#fff" : "black"),
        strokeWidth: (d) => (scrollyHighlights.has(d.model) ? 1.5 : 0.5),
        strokeOpacity: (d) =>
          scrollyActive && scrollyHighlights.size > 0 && !scrollyHighlights.has(d.model) ? 0.2 : 1,
        channels: { model: "model" },
        tip: {
          fill: "var(--bs-body-bg)",
          format: {
            fill: false,
            fillOpacity: false,
            strokeOpacity: false,
            strokeWidth: false,
            x: (d) => `$${num(d)} / MTok`,
            y: (d) => num0(d),
          },
        },
      }),
      Plot.text(
        visible.filter((d) => d.optimal || scrollyHighlights.has(d.model)),
        {
          x: "cost",
          y: "elo",
          text: (d) => d.model,
          fillOpacity: (d) =>
            scrollyActive && scrollyHighlights.size > 0 && !scrollyHighlights.has(d.model) ? 0.25 : 1,
          dy: -10,
          lineAnchor: "bottom",
          clip: true,
        }
      ),
      Plot.axisX({ label: "Cost per million input tokens" }),
      Plot.axisY({ label: "ELO score", tickSpacing: 100 }),
    ],
  });
  document.querySelector("#llm-cost").replaceChildren(plot);
  currentPlot = plot;

  // Add nodes to models for search functionality
  const circles = document.querySelectorAll("#llm-cost circle");
  visible.forEach((model, i) => (model.node = circles[i]));

  // Re-attach the zoom brush if the user is in select mode
  if (zoomSelectMode) attachBrush();
};

const update = () => {
  const date = dates[$date.value];
  document.querySelector("#date-label").textContent = d3.timeFormat("%b %Y")(d3.timeParse("%Y-%m")(date));

  const search = document.querySelector("#model").value.trim();
  const results = fuzzysort.go(
    search,
    models.map((m) => m.model),
    { threshold: -20 }
  );
  const matches = new Set(results.map((r) => r.target));

  const filteredModels = models.filter(
    (d) =>
      d.launch <= date &&
      (d.end ? d.end > date : true) &&
      (search ? matches.has(d.model) : true) &&
      matchesProvider(d)
  );
  updateOptimalStatus(filteredModels);
  renderPlot(filteredModels);
};

$date.addEventListener("input", update);
document.querySelector("#model").addEventListener("input", update);

// ─── Category visibility toggles (hide all green / red / gray) ───────────────
const categoryToggles = { "show-best": "best", "show-worst": "worst", "show-others": "others" };
Object.entries(categoryToggles).forEach(([id, category]) => {
  document.querySelector("#" + id).addEventListener("change", (e) => {
    if (e.target.checked) hidden.delete(category);
    else hidden.add(category);
    update();
  });
});

// ─── Select-a-region-and-zoom controls ──────────────────────────────────────
document.querySelector("#zoom-select").addEventListener("click", () => {
  zoomSelectMode = !zoomSelectMode;
  if (zoomSelectMode) attachBrush();
  else document.querySelector("#llm-cost .zoom-brush")?.remove();
  syncControls();
});

document.querySelector("#zoom-reset").addEventListener("click", () => {
  zoomDomain = null;
  zoomSelectMode = false;
  update();
  syncControls();
});

update();
syncControls();

// ─── Scrollytelling ────────────────────────────────────────────────────────

const narrative = await fetch("narrative.json").then((r) => r.json());

// Build scrolly steps — each contains a sticky glassmorphism card
const scrollySection = document.querySelector("#scrolly-section");
const cardEls = [];

narrative.cards.forEach((card, i) => {
  const linksHtml = card.links.length
    ? `<div class="card-links">${card.links
        .map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.text}</a>`)
        .join("")}</div>`
    : "";

  const cardEl = document.createElement("div");
  cardEl.className = `scrolly-card pos-${card.position}${card.vertical === "top" ? " vert-top" : ""}`;
  cardEl.innerHTML = `<h6>${card.title}</h6>${card.body}${linksHtml}`;

  const step = document.createElement("div");
  step.className = "scrolly-step";
  step.dataset.step = i;
  step.appendChild(cardEl);
  scrollySection.appendChild(step);
  cardEls.push(cardEl);

  if (i < narrative.cards.length - 1) {
    const gap = document.createElement("div");
    gap.className = "scrolly-gap";
    scrollySection.appendChild(gap);
  }
});

// Trailing spacer — large enough for the last card to scroll well past the top
const trailing = document.createElement("div");
trailing.style.height = "140vh";
scrollySection.appendChild(trailing);

// Sentinel at the start of the trailing space: when it enters the viewport,
// the last card has already scrolled above the top — restore the chart fully
const endSentinel = document.createElement("div");
trailing.prepend(endSentinel);

const endObserver = new IntersectionObserver(
  ([entry]) => { if (entry.isIntersecting) deactivateScrolly(); },
  { threshold: 0 }
);
endObserver.observe(endSentinel);

// Smooth month animation
let monthAnimFrame = null;
const animateToMonth = (targetIdx) => {
  if (monthAnimFrame) cancelAnimationFrame(monthAnimFrame);
  const startIdx = +$date.value;
  if (startIdx === targetIdx) return;
  const duration = 700;
  const startTime = performance.now();
  const tick = (now) => {
    const t = Math.min((now - startTime) / duration, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const cur = Math.round(startIdx + (targetIdx - startIdx) * eased);
    if (+$date.value !== cur) { $date.value = cur; update(); }
    if (t < 1) monthAnimFrame = requestAnimationFrame(tick);
  };
  monthAnimFrame = requestAnimationFrame(tick);
};

const activateCard = (cardData) => {
  scrollyActive = true;
  scrollyHighlights = new Set(cardData.highlight);
  if (cardData.month) animateToMonth(dates.indexOf(cardData.month));
  else update();
};

const deactivateScrolly = () => {
  if (!scrollyActive && scrollyHighlights.size === 0) return;
  scrollyActive = false;
  scrollyHighlights = new Set();
  update();
};

// Fade cards in/out as they enter/leave viewport
const cardObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.target.classList.toggle("is-active", e.isIntersecting)),
  { threshold: 0.15 }
);
cardEls.forEach((el) => cardObserver.observe(el));

// Update chart state when a step becomes active
const stepObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) activateCard(narrative.cards[+entry.target.dataset.step]);
    }
  },
  { threshold: 0.35, rootMargin: "-10% 0px -10% 0px" }
);
document.querySelectorAll(".scrolly-step").forEach((el) => stepObserver.observe(el));

// Deactivate when scrolling back above the section (scroll-up case)
let sectionEverEntered = false;
const sectionObserver = new IntersectionObserver(
  ([entry]) => {
    if (entry.isIntersecting) { sectionEverEntered = true; }
    else if (sectionEverEntered) { deactivateScrolly(); }
  },
  { threshold: 0 }
);
sectionObserver.observe(scrollySection);
