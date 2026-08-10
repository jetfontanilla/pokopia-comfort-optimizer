(function () {
  "use strict";

  var els = {
    tabPokemon: document.getElementById("tab-pokemon"),
    tabItem: document.getElementById("tab-item"),
    panelPokemon: document.getElementById("panel-pokemon"),
    panelItem: document.getElementById("panel-item"),

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
    empty: document.getElementById("empty"),

    iq: document.getElementById("iq"),
    isuggestions: document.getElementById("isuggestions"),
    itemProfile: document.getElementById("itemprofile"),
    icontrols: document.getElementById("icontrols"),
    habitat: document.getElementById("habitat"),
    iminhits: document.getElementById("iminhits"),
    icount: document.getElementById("icount"),
    iresults: document.getElementById("iresults"),
    iempty: document.getElementById("iempty")
  };

  // sentinel value for the "Not listed" option of the Use filter
  var NO_USE = "__none__";
  var MAX_HOUSE = 4;

  var db = { items: [], pokemon: [], tags: [], tagById: {} };
  var house = [];
  var matches = [];
  var currentItem = null;
  var itemMatches = [];

  // ------------------------------------------------------------- loading

  function fillOptions(select, rows, field) {
    var seen = {};
    rows.forEach(function (r) {
      if (r[field]) seen[r[field]] = true;
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

      fillOptions(els.category, db.items, "category");
      fillOptions(els.use, db.items, "use");
      var none = document.createElement("option");
      none.value = NO_USE;
      none.textContent = "Not listed";
      els.use.appendChild(none);
      fillOptions(els.habitat, db.pokemon, "idealHabitat");

      els.q.disabled = false;
      els.iq.disabled = false;
      applyHash();
    })
    .catch(function (err) {
      els.empty.textContent = "Could not load data: " + err.message;
    });

  // ------------------------------------------------------------- helpers

  function normalize(s) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /** Prefix matches first, then substring matches. */
  function search(rows, query, exclude) {
    var q = normalize(query);
    if (!q) return [];
    var starts = [];
    var contains = [];
    rows.forEach(function (r) {
      if (exclude && exclude(r)) return;
      var n = normalize(r.name);
      if (n.indexOf(q) === 0) starts.push(r);
      else if (n.indexOf(q) !== -1) contains.push(r);
    });
    return starts.concat(contains).slice(0, 10);
  }

  function tagName(id) {
    return db.tagById[id] ? db.tagById[id].name : id;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function image(src, className) {
    if (!src) return null;
    var img = el("img", className);
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.onerror = function () {
      img.remove();
    };
    return img;
  }

  function habitatBadge(pokemon) {
    if (!pokemon.idealHabitat) return null;
    return el(
      "span",
      "habitat habitat-" + pokemon.idealHabitat.toLowerCase(),
      pokemon.idealHabitat
    );
  }

  function categoryRow(item) {
    var row = el("div", "card-cat");
    row.appendChild(el("span", "cat", item.category));
    (item.alsoIn || []).forEach(function (c) {
      row.appendChild(el("span", "cat", c));
    });
    if (item.use) {
      row.appendChild(el("span", "cat cat-use use-" + item.use.toLowerCase(), item.use));
    }
    if (item.dlc) row.appendChild(el("span", "cat cat-dlc", "Expansion"));
    return row;
  }

  /**
   * Wire an input + listbox as a combobox. `onPick` receives the chosen row.
   */
  function combobox(input, list, getRows, renderRow, onPick) {
    var activeIndex = -1;

    function close() {
      list.hidden = true;
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
    }

    function open(rows) {
      list.innerHTML = "";
      if (!rows.length) return close();
      rows.forEach(function (row) {
        var li = el("li", "suggestion");
        li.setAttribute("role", "option");
        renderRow(li, row);
        li.addEventListener("mousedown", function (e) {
          e.preventDefault();
          close();
          onPick(row);
        });
        list.appendChild(li);
      });
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      activeIndex = -1;
    }

    function highlight(delta) {
      var opts = list.querySelectorAll(".suggestion");
      if (!opts.length) return;
      activeIndex = (activeIndex + delta + opts.length) % opts.length;
      Array.prototype.forEach.call(opts, function (o, i) {
        o.classList.toggle("active", i === activeIndex);
      });
    }

    input.addEventListener("input", function () {
      open(getRows(input.value));
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(-1);
      } else if (e.key === "Enter") {
        var rows = getRows(input.value);
        if (!rows.length) return;
        close();
        onPick(rows[activeIndex >= 0 ? activeIndex : 0]);
      } else if (e.key === "Escape") {
        close();
      } else if (e.key === "Backspace" && !input.value) {
        input.dispatchEvent(new CustomEvent("emptybackspace"));
      }
    });
    input.addEventListener("blur", function () {
      setTimeout(close, 120);
    });

    return { close: close };
  }

  // ================================================== mode: Pokemon -> items

  function inHouse(pokemon) {
    return house.some(function (p) {
      return p.name === pokemon.name;
    });
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

  function renderHouse() {
    els.profile.hidden = !house.length;
    els.profile.innerHTML = "";
    if (!house.length) return;

    house.forEach(function (p, index) {
      var card = el("div", "entity resident");
      var img = image(p.sprite, "sprite");
      if (img) card.appendChild(img);

      var meta = el("div", "profile-meta");
      var head = el("div", "entity-head");
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

      var sub = el("div", "sub");
      if (p.number) sub.appendChild(el("span", null, "#" + String(p.number).padStart(3, "0")));
      var badge = habitatBadge(p);
      if (badge) sub.appendChild(badge);
      else sub.appendChild(el("span", null, "Habitat unknown"));
      meta.appendChild(sub);

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

      var icon = image(m.item.iconUrl, "icon");
      if (icon) {
        icon.onerror = function () {
          icon.replaceWith(el("div", "icon icon-missing", "?"));
        };
        card.appendChild(icon);
      }

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
      body.appendChild(categoryRow(m.item));

      if (house.length > 1) {
        var who = el("div", "who");
        house.forEach(function (p, i) {
          var n = m.per[i].length;
          var chip = el("span", "who-chip" + (n ? "" : " who-miss"));
          var img = image(p.sprite, "who-sprite");
          if (img) chip.appendChild(img);
          chip.appendChild(el("span", null, p.name + (n ? " ×" + n : "")));
          chip.title = n
            ? p.name + " likes: " + m.per[i].map(tagName).join(", ")
            : p.name + " doesn't care about this";
          who.appendChild(chip);
        });
        body.appendChild(who);
      }

      var tags = el("div", "taglist");
      (matchedOnly ? m.hits : m.item.tags).forEach(function (t) {
        var hit = m.hits.indexOf(t) !== -1;
        tags.appendChild(el("span", "tag" + (hit ? " tag-hit" : ""), tagName(t)));
      });
      body.appendChild(tags);

      card.appendChild(body);
      frag.appendChild(card);
    });
    els.results.appendChild(frag);
  }

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
        ? "House is full. Remove someone to add another"
        : house.length
        ? "Add a roommate (" + house.length + "/" + MAX_HOUSE + ")"
        : "Add a Pokemon, e.g. Bulbasaur";
    els.q.disabled = house.length >= MAX_HOUSE;

    writeHash();
  }

  function add(pokemon) {
    if (house.length >= MAX_HOUSE || inHouse(pokemon)) return;
    house.push(pokemon);
    refresh();
  }

  combobox(
    els.q,
    els.suggestions,
    function (value) {
      return search(db.pokemon, value, inHouse);
    },
    function (li, p) {
      var img = image(p.sprite, "suggestion-sprite");
      if (img) li.appendChild(img);
      li.appendChild(el("span", null, p.name));
      var badge = habitatBadge(p);
      if (badge) li.appendChild(badge);
    },
    add
  );

  els.q.addEventListener("emptybackspace", function () {
    if (house.length) {
      house.pop();
      refresh();
    }
  });

  [els.category, els.use, els.pleases, els.minhits, els.matchedonly].forEach(
    function (control) {
      control.addEventListener("change", function () {
        if (house.length) renderResults();
      });
    }
  );

  // ================================================== mode: item -> Pokemon

  /** Rank every Pokemon by how many of its favorites this item covers. */
  function rankPokemon(item) {
    var has = {};
    item.tags.forEach(function (t) {
      has[t] = true;
    });

    var scored = [];
    db.pokemon.forEach(function (p) {
      var hits = (p.favorites || []).filter(function (f) {
        return has[f];
      });
      if (!hits.length) return;
      scored.push({ pokemon: p, hits: hits, total: (p.favorites || []).length });
    });

    scored.sort(function (a, b) {
      if (b.hits.length !== a.hits.length) return b.hits.length - a.hits.length;
      return a.pokemon.name.localeCompare(b.pokemon.name);
    });
    return scored;
  }

  function renderItemProfile(item) {
    els.itemProfile.hidden = false;
    els.itemProfile.innerHTML = "";

    var card = el("div", "entity");
    var icon = image(item.iconUrl, "sprite");
    if (icon) {
      icon.onerror = function () {
        icon.replaceWith(el("div", "sprite icon-missing", "?"));
      };
      card.appendChild(icon);
    }

    var meta = el("div", "profile-meta");
    meta.appendChild(el("h2", null, item.name));
    meta.appendChild(categoryRow(item));
    if (item.description) meta.appendChild(el("p", "sub", item.description));

    var tags = el("div", "taglist");
    item.tags.forEach(function (t) {
      tags.appendChild(el("span", "tag tag-fav", tagName(t)));
    });
    if (!item.tags.length) {
      tags.appendChild(el("span", "tag tag-none", "No favorite tags, so no Pokemon prefers it"));
    }
    meta.appendChild(tags);

    card.appendChild(meta);
    els.itemProfile.appendChild(card);
  }

  function renderItemResults() {
    var minHits = parseInt(els.iminhits.value, 10);
    var habitat = els.habitat.value;

    var rows = itemMatches.filter(function (m) {
      if (m.hits.length < minHits) return false;
      if (habitat && m.pokemon.idealHabitat !== habitat) return false;
      return true;
    });

    els.icount.textContent =
      rows.length + " of " + itemMatches.length + " matching Pokemon shown";

    els.iresults.innerHTML = "";
    if (!rows.length) {
      els.iresults.appendChild(
        el(
          "p",
          "empty",
          itemMatches.length
            ? "No Pokemon match those filters."
            : "No Pokemon lists any of this item's tags as a favorite."
        )
      );
      return;
    }

    var frag = document.createDocumentFragment();
    rows.forEach(function (m) {
      var card = el("article", "card hits-" + Math.min(m.hits.length, 6));
      var img = image(m.pokemon.sprite, "icon");
      if (img) card.appendChild(img);

      var body = el("div", "card-body");
      var title = el("div", "card-title");
      title.appendChild(el("span", "name", m.pokemon.name));
      title.appendChild(
        el("span", "score", m.hits.length + "/" + m.total + " favorites")
      );
      body.appendChild(title);

      var sub = el("div", "sub");
      if (m.pokemon.number) {
        sub.appendChild(el("span", null, "#" + String(m.pokemon.number).padStart(3, "0")));
      }
      var badge = habitatBadge(m.pokemon);
      if (badge) sub.appendChild(badge);
      body.appendChild(sub);

      var tags = el("div", "taglist");
      (m.pokemon.favorites || []).forEach(function (f) {
        var hit = m.hits.indexOf(f) !== -1;
        tags.appendChild(el("span", "tag" + (hit ? " tag-hit" : ""), tagName(f)));
      });
      body.appendChild(tags);

      card.appendChild(body);
      frag.appendChild(card);
    });
    els.iresults.appendChild(frag);
  }

  function selectItem(item) {
    currentItem = item;
    els.iq.value = item.name;
    renderItemProfile(item);
    itemMatches = rankPokemon(item);
    els.icontrols.hidden = false;
    els.iempty.hidden = true;
    renderItemResults();
    writeHash();
  }

  combobox(
    els.iq,
    els.isuggestions,
    function (value) {
      return search(db.items, value);
    },
    function (li, item) {
      var img = image(item.iconUrl, "suggestion-sprite");
      if (img) li.appendChild(img);
      li.appendChild(el("span", null, item.name));
      li.appendChild(el("span", "cat", item.category));
    },
    selectItem
  );

  [els.habitat, els.iminhits].forEach(function (control) {
    control.addEventListener("change", function () {
      if (currentItem) renderItemResults();
    });
  });

  // ----------------------------------------------------------------- tabs

  var mode = "pokemon";

  function setMode(next) {
    mode = next;
    var isPokemon = mode === "pokemon";
    els.panelPokemon.hidden = !isPokemon;
    els.panelItem.hidden = isPokemon;
    els.tabPokemon.classList.toggle("active", isPokemon);
    els.tabItem.classList.toggle("active", !isPokemon);
    els.tabPokemon.setAttribute("aria-selected", String(isPokemon));
    els.tabItem.setAttribute("aria-selected", String(!isPokemon));
    writeHash();
  }

  els.tabPokemon.addEventListener("click", function () {
    setMode("pokemon");
  });
  els.tabItem.addEventListener("click", function () {
    setMode("item");
  });

  // ----------------------------------------------------------------- hash

  var applyingHash = false;

  function writeHash() {
    if (applyingHash) return;
    var hash =
      mode === "item"
        ? currentItem
          ? "item/" + encodeURIComponent(currentItem.id)
          : "item"
        : house
            .map(function (p) {
              return encodeURIComponent(p.name);
            })
            .join("+");
    if (location.hash.slice(1) !== hash) {
      history.replaceState(null, "", hash ? "#" + hash : location.pathname);
    }
  }

  function applyHash() {
    applyingHash = true;
    var raw = location.hash.slice(1);

    if (raw.indexOf("item") === 0) {
      setMode("item");
      var id = decodeURIComponent(raw.slice("item/".length));
      var found = db.items.filter(function (i) {
        return i.id === id;
      })[0];
      if (found) selectItem(found);
      applyingHash = false;
      writeHash();
      return;
    }

    setMode("pokemon");
    house = [];
    raw
      .split("+")
      .filter(Boolean)
      .slice(0, MAX_HOUSE)
      .forEach(function (name) {
        var found = db.pokemon.filter(function (p) {
          return normalize(p.name) === normalize(decodeURIComponent(name));
        })[0];
        if (found && !inHouse(found)) house.push(found);
      });
    applyingHash = false;
    refresh();
  }

  window.addEventListener("hashchange", applyHash);
})();
