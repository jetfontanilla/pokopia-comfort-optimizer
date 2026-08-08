(function () {
  "use strict";

  var els = {
    q: document.getElementById("q"),
    suggestions: document.getElementById("suggestions"),
    profile: document.getElementById("profile"),
    controls: document.getElementById("controls"),
    category: document.getElementById("category"),
    use: document.getElementById("use"),
    minhits: document.getElementById("minhits"),
    matchedonly: document.getElementById("matchedonly"),
    count: document.getElementById("count"),
    results: document.getElementById("results"),
    empty: document.getElementById("empty")
  };

  // sentinel value for the "Not listed" option of the Use filter
  var NO_USE = "__none__";

  var db = { items: [], pokemon: [], tags: [], tagById: {} };
  var current = null;
  var activeIndex = -1;
  var matches = [];

  // ------------------------------------------------------------- loading

  function fillOptions(select, field) {
    var seen = {};
    db.items.forEach(function (i) {
      if (i[field]) seen[i[field]] = true;
    });
    Object.keys(seen)
      .sort()
      .forEach(function (value) {
        var opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      });
  }

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ": " + r.status);
      return r.json();
    });
  }

  Promise.all([
    loadJSON("data/items.json"),
    loadJSON("data/pokemon.json"),
    loadJSON("data/tags.json")
  ])
    .then(function (res) {
      db.items = res[0];
      db.pokemon = res[1];
      db.tags = res[2];
      db.tags.forEach(function (t) {
        db.tagById[t.id] = t;
      });

      fillOptions(els.category, "category");
      fillOptions(els.use, "use");
      var none = document.createElement("option");
      none.value = NO_USE;
      none.textContent = "Not listed";
      els.use.appendChild(none);

      els.q.disabled = false;
      applyHash();
    })
    .catch(function (err) {
      els.empty.textContent = "Could not load data: " + err.message;
    });

  // ------------------------------------------------------------ matching

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function searchPokemon(query) {
    var q = normalize(query);
    if (!q) return [];
    var starts = [];
    var contains = [];
    db.pokemon.forEach(function (p) {
      var n = normalize(p.name);
      if (n.indexOf(q) === 0) starts.push(p);
      else if (n.indexOf(q) !== -1) contains.push(p);
    });
    return starts.concat(contains).slice(0, 10);
  }

  function rank(pokemon) {
    var favs = pokemon.favorites || [];
    var want = {};
    favs.forEach(function (f) {
      want[f] = true;
    });

    var scored = [];
    db.items.forEach(function (item) {
      var hits = item.tags.filter(function (t) {
        return want[t];
      });
      if (hits.length) scored.push({ item: item, hits: hits });
    });

    scored.sort(function (a, b) {
      if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
      // more focused items first, then alphabetical
      if (a.item.tags.length !== b.item.tags.length) {
        return a.item.tags.length - b.item.tags.length;
      }
      return a.item.name.localeCompare(b.item.name);
    });
    return scored;
  }

  // ------------------------------------------------------------ rendering

  function tagName(id) {
    return db.tagById[id] ? db.tagById[id].name : id;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderProfile(p) {
    els.profile.hidden = false;
    els.profile.innerHTML = "";

    var head = el("div", "profile-head");
    if (p.sprite) {
      var img = el("img", "sprite");
      img.src = p.sprite;
      img.alt = p.name;
      img.loading = "lazy";
      img.onerror = function () {
        img.remove();
      };
      head.appendChild(img);
    }

    var meta = el("div", "profile-meta");
    meta.appendChild(el("h2", null, p.name));
    var sub = [];
    if (p.number) sub.push("#" + String(p.number).padStart(3, "0"));
    if (p.idealHabitat) sub.push("Ideal habitat: " + p.idealHabitat);
    if (sub.length) meta.appendChild(el("p", "sub", sub.join("  ·  ")));

    var favWrap = el("div", "taglist");
    (p.favorites || []).forEach(function (f) {
      favWrap.appendChild(el("span", "tag tag-fav", tagName(f)));
    });
    if (!(p.favorites || []).length) {
      favWrap.appendChild(el("span", "tag tag-none", "No favorites recorded"));
    }
    meta.appendChild(favWrap);

    head.appendChild(meta);
    els.profile.appendChild(head);
  }

  function renderResults() {
    var minHits = parseInt(els.minhits.value, 10);
    var category = els.category.value;
    var use = els.use.value;
    var matchedOnly = els.matchedonly.checked;

    var rows = matches.filter(function (m) {
      if (m.hits.length < minHits) return false;
      if (category && m.item.category !== category) return false;
      if (use === NO_USE && m.item.use) return false;
      if (use && use !== NO_USE && m.item.use !== use) return false;
      return true;
    });

    els.count.textContent =
      rows.length + " of " + matches.length + " matching items shown";

    els.results.innerHTML = "";
    if (!rows.length) {
      els.results.appendChild(el("p", "empty", "No items match those filters."));
      return;
    }

    var frag = document.createDocumentFragment();
    rows.forEach(function (m) {
      var card = el("article", "card hits-" + Math.min(m.hits.length, 6));

      var icon = el("img", "icon");
      icon.src = m.item.iconUrl;
      icon.alt = "";
      icon.loading = "lazy";
      icon.onerror = function () {
        icon.replaceWith(el("div", "icon icon-missing", "?"));
      };
      card.appendChild(icon);

      var body = el("div", "card-body");
      var title = el("div", "card-title");
      title.appendChild(el("span", "name", m.item.name));
      title.appendChild(el("span", "score", m.hits.length + " hit" + (m.hits.length > 1 ? "s" : "")));
      body.appendChild(title);

      var catRow = el("div", "card-cat");
      catRow.appendChild(el("span", "cat", m.item.category));
      if (m.item.use) {
        catRow.appendChild(
          el("span", "cat cat-use use-" + m.item.use.toLowerCase(), m.item.use)
        );
      }
      if (m.item.dlc) catRow.appendChild(el("span", "cat cat-dlc", "Expansion"));
      body.appendChild(catRow);

      var tags = el("div", "taglist");
      var shown = matchedOnly ? m.hits : m.item.tags;
      shown.forEach(function (t) {
        var hit = m.hits.indexOf(t) !== -1;
        tags.appendChild(el("span", "tag" + (hit ? " tag-hit" : ""), tagName(t)));
      });
      body.appendChild(tags);

      card.appendChild(body);
      frag.appendChild(card);
    });
    els.results.appendChild(frag);
  }

  function select(pokemon) {
    current = pokemon;
    els.q.value = pokemon.name;
    closeSuggestions();
    renderProfile(pokemon);
    matches = rank(pokemon);
    els.controls.hidden = false;
    els.empty.hidden = true;
    renderResults();
    if (location.hash.slice(1) !== encodeURIComponent(pokemon.name)) {
      history.replaceState(null, "", "#" + encodeURIComponent(pokemon.name));
    }
  }

  // --------------------------------------------------------- autocomplete

  function closeSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.innerHTML = "";
    els.q.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function openSuggestions(list) {
    els.suggestions.innerHTML = "";
    if (!list.length) {
      closeSuggestions();
      return;
    }
    list.forEach(function (p, i) {
      var li = el("li", "suggestion");
      li.setAttribute("role", "option");
      li.dataset.index = String(i);
      if (p.sprite) {
        var img = el("img", "suggestion-sprite");
        img.src = p.sprite;
        img.alt = "";
        img.loading = "lazy";
        img.onerror = function () {
          img.remove();
        };
        li.appendChild(img);
      }
      li.appendChild(el("span", null, p.name));
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        select(p);
      });
      els.suggestions.appendChild(li);
    });
    els.suggestions.hidden = false;
    els.q.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  }

  function highlight(delta) {
    var opts = els.suggestions.querySelectorAll(".suggestion");
    if (!opts.length) return;
    activeIndex = (activeIndex + delta + opts.length) % opts.length;
    opts.forEach(function (o, i) {
      o.classList.toggle("active", i === activeIndex);
    });
  }

  els.q.addEventListener("input", function () {
    openSuggestions(searchPokemon(els.q.value));
  });

  els.q.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(-1);
    } else if (e.key === "Enter") {
      var list = searchPokemon(els.q.value);
      if (!list.length) return;
      select(list[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  els.q.addEventListener("blur", function () {
    setTimeout(closeSuggestions, 120);
  });

  [els.category, els.use, els.minhits, els.matchedonly].forEach(function (control) {
    control.addEventListener("change", function () {
      if (current) renderResults();
    });
  });

  function applyHash() {
    var name = decodeURIComponent(location.hash.slice(1));
    if (!name) return;
    var found = db.pokemon.filter(function (p) {
      return normalize(p.name) === normalize(name);
    })[0];
    if (found) select(found);
  }

  window.addEventListener("hashchange", applyHash);
})();
