(function () {
  "use strict";

  var els = {
    q: document.getElementById("q"),
    suggestions: document.getElementById("suggestions"),
    profile: document.getElementById("profile"),
    controls: document.getElementById("controls"),
    category: document.getElementById("category"),
    use: document.getElementById("use"),
    pleases: document.getElementById("pleases"),
    pleasesField: document.getElementById("pleasesfield"),
    minhits: document.getElementById("minhits"),
    matchedonly: document.getElementById("matchedonly"),
    count: document.getElementById("count"),
    results: document.getElementById("results"),
    empty: document.getElementById("empty")
  };

  // sentinel value for the "Not listed" option of the Use filter
  var NO_USE = "__none__";
  var MAX_HOUSE = 4;

  var db = { items: [], pokemon: [], tags: [], tagById: {} };
  var house = [];
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

  function inHouse(pokemon) {
    return house.some(function (p) {
      return p.name === pokemon.name;
    });
  }

  function searchPokemon(query) {
    var q = normalize(query);
    if (!q) return [];
    var starts = [];
    var contains = [];
    db.pokemon.forEach(function (p) {
      if (inHouse(p)) return;
      var n = normalize(p.name);
      if (n.indexOf(q) === 0) starts.push(p);
      else if (n.indexOf(q) !== -1) contains.push(p);
    });
    return starts.concat(contains).slice(0, 10);
  }

  /**
   * Score every item against the household.
   *
   * `suits` is how many residents the item pleases at all; `total` is the sum
   * of tag hits across them. An item everyone likes a little beats one that
   * only the first resident loves, so `suits` sorts first.
   */
  function rank() {
    var wants = house.map(function (p) {
      var want = {};
      (p.favorites || []).forEach(function (f) {
        want[f] = true;
      });
      return want;
    });

    var scored = [];
    db.items.forEach(function (item) {
      var per = wants.map(function (want) {
        return item.tags.filter(function (t) {
          return want[t];
        });
      });
      var total = 0;
      var suits = 0;
      var union = {};
      per.forEach(function (hits) {
        total += hits.length;
        if (hits.length) suits++;
        hits.forEach(function (t) {
          union[t] = true;
        });
      });
      if (!total) return;
      scored.push({
        item: item,
        per: per,
        total: total,
        suits: suits,
        hits: Object.keys(union)
      });
    });

    scored.sort(function (a, b) {
      if (b.suits !== a.suits) return b.suits - a.suits;
      if (b.total !== a.total) return b.total - a.total;
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

  function sprite(p, className) {
    if (!p.sprite) return null;
    var img = el("img", className);
    img.src = p.sprite;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = function () {
      img.remove();
    };
    return img;
  }

  function renderHouse() {
    els.profile.hidden = !house.length;
    els.profile.innerHTML = "";
    if (!house.length) return;

    house.forEach(function (p, index) {
      var card = el("div", "resident");

      var img = sprite(p, "sprite");
      if (img) card.appendChild(img);

      var meta = el("div", "profile-meta");
      var head = el("div", "resident-head");
      head.appendChild(el("h2", null, p.name));

      var remove = el("button", "remove", "×");
      remove.type = "button";
      remove.title = "Remove " + p.name;
      remove.setAttribute("aria-label", "Remove " + p.name);
      remove.addEventListener("click", function () {
        house.splice(index, 1);
        refresh();
      });
      head.appendChild(remove);
      meta.appendChild(head);

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

      card.appendChild(meta);
      els.profile.appendChild(card);
    });
  }

  function renderResults() {
    var minHits = parseInt(els.minhits.value, 10);
    var minSuits = house.length > 1 ? parseInt(els.pleases.value, 10) : 1;
    var category = els.category.value;
    var use = els.use.value;
    var matchedOnly = els.matchedonly.checked;

    var rows = matches.filter(function (m) {
      if (m.total < minHits) return false;
      if (m.suits < minSuits) return false;
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
      var card = el(
        "article",
        "card hits-" + Math.min(house.length > 1 ? m.suits * 2 : m.total, 6)
      );

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
      title.appendChild(
        el(
          "span",
          "score",
          house.length > 1
            ? m.suits + "/" + house.length + "  ·  " + m.total + " hits"
            : m.total + " hit" + (m.total > 1 ? "s" : "")
        )
      );
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

      if (house.length > 1) {
        var who = el("div", "who");
        house.forEach(function (p, i) {
          var n = m.per[i].length;
          var chip = el("span", "who-chip" + (n ? "" : " who-miss"));
          var img = sprite(p, "who-sprite");
          if (img) chip.appendChild(img);
          chip.appendChild(el("span", null, p.name + (n ? " ×" + n : "")));
          chip.title = n
            ? p.name +
              " likes: " +
              m.per[i]
                .map(tagName)
                .join(", ")
            : p.name + " doesn't care about this";
          who.appendChild(chip);
        });
        body.appendChild(who);
      }

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

  // ------------------------------------------------------------- house ops

  function refresh() {
    renderHouse();

    els.pleasesField.hidden = house.length < 2;
    if (parseInt(els.pleases.value, 10) > house.length) {
      els.pleases.value = String(house.length);
    }
    Array.prototype.forEach.call(els.pleases.options, function (opt) {
      opt.hidden = parseInt(opt.value, 10) > house.length;
    });

    if (!house.length) {
      els.controls.hidden = true;
      els.results.innerHTML = "";
      els.empty.hidden = false;
      els.empty.textContent = "Start typing a Pokemon name above.";
    } else {
      matches = rank();
      els.controls.hidden = false;
      els.empty.hidden = true;
      renderResults();
    }

    els.q.value = "";
    els.q.placeholder =
      house.length >= MAX_HOUSE
        ? "House is full — remove someone to add another"
        : house.length
        ? "Add a roommate (" + house.length + "/" + MAX_HOUSE + ")"
        : "Add a Pokemon, e.g. Bulbasaur";
    els.q.disabled = house.length >= MAX_HOUSE;

    var hash = house
      .map(function (p) {
        return encodeURIComponent(p.name);
      })
      .join("+");
    if (location.hash.slice(1) !== hash) {
      history.replaceState(null, "", hash ? "#" + hash : location.pathname);
    }
  }

  function add(pokemon) {
    if (house.length >= MAX_HOUSE || inHouse(pokemon)) return;
    house.push(pokemon);
    closeSuggestions();
    refresh();
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
      var img = sprite(p, "suggestion-sprite");
      if (img) li.appendChild(img);
      li.appendChild(el("span", null, p.name));
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        add(p);
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
    Array.prototype.forEach.call(opts, function (o, i) {
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
      add(list[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === "Escape") {
      closeSuggestions();
    } else if (e.key === "Backspace" && !els.q.value && house.length) {
      house.pop();
      refresh();
    }
  });

  els.q.addEventListener("blur", function () {
    setTimeout(closeSuggestions, 120);
  });

  [els.category, els.use, els.pleases, els.minhits, els.matchedonly].forEach(
    function (control) {
      control.addEventListener("change", function () {
        if (house.length) renderResults();
      });
    }
  );

  function applyHash() {
    var raw = location.hash.slice(1);
    if (!raw) return;
    var names = raw.split("+").filter(Boolean);
    house = [];
    names.slice(0, MAX_HOUSE).forEach(function (name) {
      var found = db.pokemon.filter(function (p) {
        return normalize(p.name) === normalize(decodeURIComponent(name));
      })[0];
      if (found && !inHouse(found)) house.push(found);
    });
    refresh();
  }

  window.addEventListener("hashchange", applyHash);
})();
