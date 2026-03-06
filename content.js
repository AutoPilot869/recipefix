// RecipeFix - content.js v3.0
// Inline ingredient measurement pills injected into recipe directions.
// Pill = empty outline. Tap = fills green with checkmark. Tap again = undone.
// No sidebar. No settings. No activation button. It just works.

(function () {
  "use strict";

  if (window.__recipeFixRan) return;
  window.__recipeFixRan = true;

  const DONE = new Set();

  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));

  const UNICODE_FRACTIONS = {
    "½":"1/2","⅓":"1/3","⅔":"2/3","¼":"1/4","¾":"3/4",
    "⅛":"1/8","⅜":"3/8","⅝":"5/8","⅞":"7/8","⅙":"1/6","⅚":"5/6",
  };
  function normalizeText(t) {
    return t.replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅙⅚]/g, m => UNICODE_FRACTIONS[m] || m);
  }

  const SITE_CONFIGS = {
    "foodnetwork.com": {
      ingredientSelectors: [
        ".o-Ingredients__a-ListItem",
        ".o-Ingredients__a-Ingredient",
        '[class*="IngredientList"] li',
        ".ingredient-list li",
        '[class*="ingredient"] li',
      ],
      stepSelectors: [
        ".o-Method__m-Step p",
        ".o-Method__m-Step",
        '[class*="Direction"] li',
        '[class*="direction"] li',
        '[class*="Method"] p',
        ".recipe-directions li",
      ],
    },
    "allrecipes.com": {
      ingredientSelectors: [
        ".mm-recipes-structured-ingredients__list-item",
        "[data-ingredient-name]",
        ".ingredients-item",
        'li[class*="ingredient"]',
        ".ingredient-item",
      ],
      stepSelectors: [
        ".mm-recipes-steps__content p",
        ".recipe-directions__list--item",
        '[class*="instructions"] li',
        '[class*="step"] p',
        ".step p",
      ],
    },
    "seriouseats.com": {
      ingredientSelectors: [
        ".structured-ingredients__list-item",
        '[class*="ingredient"] li',
        ".ingredient-list li",
        '[data-ingredient]',
        ".ingredients-section li",
      ],
      stepSelectors: [
        ".structured-project__steps li",
        ".recipe-procedure-text p",
        '[class*="step"] p',
        '[class*="direction"] li',
        ".directions li",
      ],
    },
    "cooking.nytimes.com": {
      ingredientSelectors: [
        '[class*="ingredient_ingredient"]',
        ".pantry--ui li",
        '[class*="Ingredient"] li',
        'li[class*="ingredient"]',
        ".recipe-ingredients li",
      ],
      stepSelectors: [
        '[class*="preparation_step"]',
        '[class*="step_content"] p',
        ".recipe-steps li",
        '[class*="direction"] p',
        ".preparation li",
      ],
    },
    "bbcgoodfood.com": {
      ingredientSelectors: [
        ".ingredients-list__item",
        '[class*="ingredient"] li',
        ".recipe__ingredients li",
        ".ingredients li",
      ],
      stepSelectors: [
        ".recipe__method-steps li",
        ".method-steps__list-item p",
        '[class*="method"] li',
        ".directions li",
        ".steps li",
      ],
    },
  };

  const SCHEMA_CONFIG = {
    ingredientSelectors: [
      '[class*="wprm-recipe-ingredient"]',
      '[itemprop="recipeIngredient"]',
      '[itemtype*="Recipe"] [itemprop="ingredients"]',
    ],
    stepSelectors: [
      '[class*="wprm-recipe-instruction"]',
      '[itemprop="recipeInstructions"] p',
      '[itemprop="recipeInstructions"] li',
      '[itemprop="recipeInstructions"]',
      '[class*="instruction"] li',
      '[class*="direction"] li',
      '[class*="step"] p',
    ],
  };

  const AGGRESSIVE_CONFIG = {
    ingredientSelectors: [
      '[class*="wprm-recipe-ingredient"]',
      '[class*="ingredient"]',
      '[id*="ingredient"]',
      ".ingredient",
      "ul li",
    ],
    stepSelectors: [
      '[class*="wprm-recipe-instruction"]',
      '[class*="instruction"]',
      '[class*="direction"]',
      '[class*="step"]',
      '[class*="method"]',
      "ol li",
    ],
  };

  function getSiteConfig() {
    const hostname = window.location.hostname.replace(/^www\./, "");
    for (const [site, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(site)) return config;
    }
    return null;
  }

  const UNITS_STR = [
    "tablespoons?","tbsp?","teaspoons?","tsp?","cups?",
    "fluid\\s+ounces?","fl\\.?\\s*oz","ounces?","oz",
    "pounds?","lbs?","grams?","(?<![a-zA-Z])g(?![a-zA-Z])",
    "kilograms?","kg","milliliters?","ml",
    "liters?","(?<![a-zA-Z])l(?![a-zA-Z])","quarts?","qt",
    "pints?","pt","gallons?","gal","cloves?","slices?",
    "pieces?","cans?","packages?","pkgs?","bunches?","stalks?",
    "sprigs?","pinch(?:es)?","dash(?:es)?","handfuls?",
    "inches?","strips?","heads?","links?","fillets?","sheets?","blocks?",
  ].join("|");

  function makeAmountRe() {
    return new RegExp(
      `((?:\\d+\\s+)?\\d+\\/\\d+|\\d+\\.?\\d*)\\s*(${UNITS_STR})` +
      `|\\(((?:\\d+\\s+)?\\d+\\/\\d+|\\d+\\.?\\d*)\\s*(${UNITS_STR})\\)`,
      "gi"
    );
  }

  const NAME_STRIP_RE = new RegExp(
    `^\\s*(?:(?:\\d+\\s+)?\\d+\\/\\d+|\\d+\\.?\\d*)\\s*(?:${UNITS_STR})\\.?\\s*`, "i"
  );
  const DESCRIPTOR_RE  = /,.*$/;
  const PREP_SUFFIX_RE = /\s+(?:sauce|powder|extract|flakes|leaves|trimmed|minced|chopped|sliced|diced|grated|peeled|pitted|halved|quartered|separated|divided|softened|melted|at\s+room\s+temperature|room\s+temperature)$/i;

  function makeModifierRe() {
    return /^(?:low[\s-]sodium|reduced[\s-]sodium|freshly\s+(?:grated|ground|squeezed)|extra[\s-]virgin|finely\s+chopped|roughly\s+chopped|thinly\s+sliced|lightly\s+beaten|firmly\s+packed|fresh|dried|frozen|ground|whole|large|medium|small|mini|raw|cooked|unsalted|salted|boneless|skinless|lean|fat[\s-]free|skim|reduced[\s-]fat|organic|pure|plain|packed)\s+/gi;
  }

  function queryAll(selectors) {
    for (const sel of selectors) {
      try {
        const els = [...document.querySelectorAll(sel)];
        if (els.length) return els;
      } catch (_) {}
    }
    return [];
  }

  function parseJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data    = JSON.parse(script.textContent);
        const recipes = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
        for (const item of recipes) {
          const types = Array.isArray(item["@type"]) ? item["@type"] : [item["@type"]];
          if (types.includes("Recipe")) {
            const ings = item.recipeIngredient || item.ingredients || [];
            if (ings.length) return ings.map(s => {
              const el = document.createElement("span");
              el.textContent = s;
              return el;
            });
          }
        }
      } catch (_) {}
    }
    return [];
  }

  function parseIngredients(elements) {
    const seen        = new Set();
    const ingredients = [];
    elements.forEach((el) => {
      const raw  = el.textContent.trim();
      if (!raw)  return;
      const text = normalizeText(raw);
      const amountRe     = makeAmountRe();
      const measurements = [];
      let m;
      while ((m = amountRe.exec(text)) !== null) {
        const amount = m[1] || m[3];
        const unit   = m[2] || m[4];
        if (amount && unit) measurements.push(`${amount} ${unit}`);
      }
      let measurement = measurements.join(" + ");
      if (!measurement) {
        const bare = text.match(/^((?:\d+\s+)?\d+\/\d+|\d+\.?\d+|\d+)\s+[a-zA-Z]/);
        if (bare) measurement = bare[1];
      }
      if (!measurement && /to\s+taste|as\s+needed|as\s+desired/i.test(raw)) {
        measurement = "to taste";
      }
      if (!measurement) return;
      let name = text
        .replace(NAME_STRIP_RE, "")
        .replace(/^\d+\s+/, "")
        .replace(/\(.*?\)/g, "")
        .replace(DESCRIPTOR_RE, "")
        .replace(PREP_SUFFIX_RE, "")
        .trim();
      name = name.replace(makeModifierRe(), "").trim();
      if (name.length < 2) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      ingredients.push({ name: key, displayName: name, measurement, isTaste: measurement === "to taste" });
    });
    return ingredients;
  }

  function buildMatcher(ingredients) {
    const expanded      = [...ingredients];
    const existingNames = new Set(ingredients.map(i => i.name));
    const aliasAdded    = new Set();
    for (const ing of ingredients) {
      const words = ing.name.split(/\s+/);
      if (words.length > 1) {
        const lastWord = words[words.length - 1];
        if (!existingNames.has(lastWord) && !aliasAdded.has(lastWord)) {
          aliasAdded.add(lastWord);
          expanded.push({ ...ing, name: lastWord });
        }
      }
    }
    const sorted = [...expanded].sort((a, b) => b.name.length - a.name.length);
    function isWordBoundary(str, pos, len) {
      const before = pos === 0               ? true : !/[a-zA-Z0-9\u00C0-\u024F]/.test(str[pos - 1]);
      const after  = pos + len >= str.length ? true : !/[a-zA-Z0-9\u00C0-\u024F]/.test(str[pos + len]);
      return before && after;
    }
    return function findMatches(text) {
      const lower    = text.toLowerCase();
      const matches  = [];
      const occupied = new Uint8Array(text.length);
      for (const ing of sorted) {
        let pos = 0;
        while ((pos = lower.indexOf(ing.name, pos)) !== -1) {
          const end  = pos + ing.name.length;
          const free = !occupied.slice(pos, end).some(Boolean);
          if (isWordBoundary(lower, pos, ing.name.length) && free) {
            matches.push({ index: pos, length: ing.name.length, ingredient: ing });
            for (let i = pos; i < end; i++) occupied[i] = 1;
          }
          pos = end;
        }
      }
      return matches.sort((a, b) => a.index - b.index);
    };
  }

  function applyBadgeStyle(span, done, isTaste) {
    Object.assign(span.style, {
      fontFamily:    "'DM Mono', 'Courier New', monospace",
      fontSize:      IS_MOBILE ? "0.82em" : "0.72em",
      fontWeight:    "600",
      verticalAlign: "middle",
      margin:        "0 3px",
      cursor:        "pointer",
      whiteSpace:    "nowrap",
      lineHeight:    "1",
      display:       "inline-flex",
      alignItems:    "center",
      userSelect:    "none",
      transition:    "all 0.2s ease",
      touchAction:   "manipulation",
      borderRadius:  "999px",
      padding:       IS_MOBILE ? "4px 10px" : "2px 7px",
    });
    if (done) {
      Object.assign(span.style, { background: "#2ecc71", color: "#ffffff", border: "2px solid #2ecc71", opacity: "0.65" });
    } else if (isTaste) {
      Object.assign(span.style, { background: "transparent", color: "#aaaaaa", border: "2px dashed #aaaaaa", opacity: "1" });
    } else {
      Object.assign(span.style, { background: "transparent", color: "#555555", border: "2px solid #aaaaaa", opacity: "1" });
    }
  }

  function setBadgeContent(span, ingredient, done) {
    span.textContent = done ? `✓ ${ingredient.measurement}` : ingredient.measurement;
    span.title = done
      ? `${ingredient.displayName}: ${ingredient.measurement} — tap to undo`
      : `${ingredient.displayName}: ${ingredient.measurement} — tap to mark done`;
  }

  function injectIntoTextNode(textNode, matches) {
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const { index, length, ingredient } of matches) {
      if (index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, index)));
      frag.appendChild(document.createTextNode(text.slice(index, index + length)));
      const badge = document.createElement("span");
      badge.dataset.rfBadge      = "1";
      badge.dataset.rfIngredient = ingredient.name;
      const done = DONE.has(ingredient.name);
      setBadgeContent(badge, ingredient, done);
      applyBadgeStyle(badge, done, ingredient.isTaste);
      function handleToggle(e) {
        e.stopPropagation();
        e.preventDefault();
        if (DONE.has(ingredient.name)) { DONE.delete(ingredient.name); } else { DONE.add(ingredient.name); }
        const nowDone = DONE.has(ingredient.name);
        document.querySelectorAll(`[data-rf-ingredient="${ingredient.name}"]`).forEach(b => {
          setBadgeContent(b, ingredient, nowDone);
          applyBadgeStyle(b, nowDone, ingredient.isTaste);
        });
      }
      badge.addEventListener("click",    handleToggle);
      badge.addEventListener("touchend", handleToggle, { passive: false });
      frag.appendChild(badge);
      cursor = index + length;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function processStep(el, findMatches) {
    const textNodes = [];
    const walker    = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.dataset?.rfBadge ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    let injected = false;
    for (const tn of textNodes) {
      const matches = findMatches(tn.nodeValue);
      if (matches.length) { injectIntoTextNode(tn, matches); injected = true; }
    }
    return injected;
  }

  function removeBadges() {
    document.querySelectorAll("[data-rf-badge]").forEach(b => b.remove());
  }

  function showToast(msg, duration = 3500) {
    let t = document.getElementById("rf-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "rf-toast";
      Object.assign(t.style, {
        position: "fixed", bottom: "max(24px, calc(env(safe-area-inset-bottom) + 16px))",
        left: "50%", transform: "translateX(-50%) translateY(12px)",
        background: "#1a1a24", color: "#f0f0f5",
        fontFamily: "'Courier New', monospace",
        fontSize: IS_MOBILE ? "12px" : "11px", fontWeight: "700",
        letterSpacing: "0.05em", padding: IS_MOBILE ? "11px 20px" : "9px 18px",
        borderRadius: "8px", border: "1px solid #2a2a3a", borderLeft: "3px solid #2ecc71",
        boxShadow: "0 4px 24px rgba(0,0,0,0.45)", zIndex: "2147483647",
        opacity: "0", transition: "opacity 0.22s, transform 0.22s",
        whiteSpace: "nowrap", pointerEvents: "none", maxWidth: "90vw",
      });
      document.body.appendChild(t);
    }
    t.textContent     = msg;
    t.style.opacity   = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.style.opacity   = "0";
      t.style.transform = "translateX(-50%) translateY(12px)";
    }, duration);
  }

  // --- FIXED: smarter content detection that checks for actual text content,
  // not just element presence. WPRM and lazy-loaded sites render empty
  // elements first, then populate them — this waits for real content.
  function waitForContent(config, callback) {
    const ingredientSelectors = [
      ...(config?.ingredientSelectors || []),
      ...SCHEMA_CONFIG.ingredientSelectors,
      ...AGGRESSIVE_CONFIG.ingredientSelectors,
    ];
    const stepSelectors = [
      ...(config?.stepSelectors || []),
      ...SCHEMA_CONFIG.stepSelectors,
      ...AGGRESSIVE_CONFIG.stepSelectors,
    ];

    function hasRealContent() {
      // Check JSON-LD first — always reliable and instant
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        try {
          const d     = JSON.parse(s.textContent);
          const items = Array.isArray(d) ? d : [d, ...(d["@graph"] || [])];
          if (items.some(i => {
            const t = Array.isArray(i["@type"]) ? i["@type"] : [i["@type"]];
            return t.includes("Recipe") && (i.recipeIngredient || i.ingredients || []).length > 0;
          })) return true;
        } catch (_) {}
      }
      // Check DOM — must have BOTH ingredients AND steps with actual text
      let hasIngs  = false;
      let hasSteps = false;
      for (const sel of ingredientSelectors) {
        try {
          const els = [...document.querySelectorAll(sel)];
          if (els.some(el => el.textContent.trim().length > 2)) { hasIngs = true; break; }
        } catch (_) {}
      }
      for (const sel of stepSelectors) {
        try {
          const els = [...document.querySelectorAll(sel)];
          if (els.some(el => el.textContent.trim().length > 10)) { hasSteps = true; break; }
        } catch (_) {}
      }
      return hasIngs && hasSteps;
    }

    // Retry schedule: fast at first, then patient. Total wait up to ~12 seconds.
    const delays  = [300, 600, 1000, 1500, 2000, 3000, 4000];
    let   attempt = 0;
    (function attempt_() {
      if (hasRealContent()) { setTimeout(callback, 100); return; }
      if (attempt >= delays.length) { callback(); return; }
      setTimeout(attempt_, delays[attempt++]);
    })();
  }

  function watchForSPANavigation() {
    let lastUrl  = location.href;
    let debounce = null;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.__recipeFixRan = false;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          window.__recipeFixRan = true;
          removeBadges();
          DONE.clear();
          run();
        }, 1000);
        return;
      }
      if (!document.querySelector("[data-rf-badge]")) {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          if (!document.querySelector("[data-rf-badge]")) run();
        }, 1500);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function run() {
    removeBadges();
    const config = getSiteConfig();
    let ingredientEls = config ? queryAll(config.ingredientSelectors) : [];
    let stepEls       = config ? queryAll(config.stepSelectors)       : [];
    if (!ingredientEls.length) {
      ingredientEls = queryAll(SCHEMA_CONFIG.ingredientSelectors);
      if (!ingredientEls.length) ingredientEls = parseJsonLd();
    }
    if (!stepEls.length) stepEls = queryAll(SCHEMA_CONFIG.stepSelectors);
    let usedFallback = false;
    if (!ingredientEls.length || !stepEls.length) {
      if (!ingredientEls.length) ingredientEls = queryAll(AGGRESSIVE_CONFIG.ingredientSelectors);
      if (!stepEls.length)       stepEls       = queryAll(AGGRESSIVE_CONFIG.stepSelectors);
      usedFallback = true;
    }
    if (!ingredientEls.length || !stepEls.length) return;
    const ingredients = parseIngredients(ingredientEls);
    if (!ingredients.length) return;
    const findMatches = buildMatcher(ingredients);
    let   badgeCount  = 0;
    stepEls.forEach(el => {
      const before = el.querySelectorAll("[data-rf-badge]").length;
      processStep(el, findMatches);
      badgeCount += el.querySelectorAll("[data-rf-badge]").length - before;
    });
    if (!badgeCount) return;
    showToast(usedFallback
      ? `✓ RecipeFix · ${badgeCount} badges (fallback) · tap to mark done`
      : `✓ RecipeFix · ${badgeCount} badges · tap to mark done`
    );
  }

  const config = getSiteConfig();
  waitForContent(config, run);
  if (document.body) {
    watchForSPANavigation();
  } else {
    document.addEventListener("DOMContentLoaded", watchForSPANavigation);
  }

})();