(function () {
    "use strict";

    try {
        if (window.top !== window.self) {
            window.top.location = window.self.location.href;
        }
    } catch (_) { }

    var DEFAULT_XOR_KEY = [
        83, 97, 107, 101, 114, 110, 97, 115, 65, 114, 115, 105, 112, 84, 105, 100,
        97, 107, 82, 101, 115, 109, 105, 50, 48, 50, 54, 88, 79, 82, 33,
    ];

    var CATEGORY_META = {
        kuesioner: {
            className: "b-kuesioner",
            shortLabel: "KUESIONER",
            buttonLabel: "Filter kategori kuesioner",
        },
        klasifikasi: {
            className: "b-klasifikasi",
            shortLabel: "KLASIFIKASI",
            buttonLabel: "Filter kategori klasifikasi",
        },
        pedoman: {
            className: "b-pedoman",
            shortLabel: "PEDOMAN",
            buttonLabel: "Filter kategori pedoman",
        },
        publikasi: {
            className: "b-publikasi",
            shortLabel: "PUBLIKASI",
            buttonLabel: "Filter kategori publikasi",
        },
        sejarah: {
            className: "b-sejarah",
            shortLabel: "SEJARAH",
            buttonLabel: "Filter kategori sejarah",
        },
        sintaks: {
            className: "b-sintaks",
            shortLabel: "SINTAKS",
            buttonLabel: "Filter kategori sintaks",
        },
        "contoh mikrodata": {
            className: "b-mikrodata",
            shortLabel: "MIKRODATA",
            buttonLabel: "Filter kategori contoh mikrodata",
        },
    };

    var CATEGORY_ORDER = [
        "kuesioner",
        "klasifikasi",
        "pedoman",
        "publikasi",
        "sejarah",
        "sintaks",
        "contoh mikrodata",
    ];

    var monthWeight = {
        januari: 1,
        january: 1,
        februari: 2,
        february: 2,
        maret: 3,
        march: 3,
        april: 4,
        mei: 5,
        may: 5,
        juni: 6,
        june: 6,
        juli: 7,
        july: 7,
        agustus: 8,
        august: 8,
        september: 9,
        oktober: 10,
        october: 10,
        november: 11,
        desember: 12,
        december: 12,
    };

    var ALLOWED_HOST_SUFFIXES = [
        "drive.google.com",
        "bps.go.id",
        "dsbb.imf.org",
        "rand.org",
    ];

    var meta = {};
    var data = [];

    var curYear = "all";
    var curMonth = "all";
    var curCat = "all";
    var curIndicator = "all";
    var viewMode = "list";
    var stickyRAF = null;

    var els = {
        grid: document.getElementById("mainGrid"),
        header: document.getElementById("mainHeader"),
        yearFilter: document.getElementById("yearFilter"),
        monthFilter: document.getElementById("monthFilter"),
        indicatorFilter: document.getElementById("indicatorFilter"),
        catFilters: document.getElementById("catFilters"),
        resetBtn: document.getElementById("resetBtn"),
        viewToggle: document.getElementById("viewToggle"),
        themeToggle: document.getElementById("themeToggle"),
        statsCount: document.getElementById("statsCount"),
        dbVer: document.getElementById("dbVer"),
    };

    if (!els.grid || !els.catFilters || !els.yearFilter || !els.monthFilter) {
        return;
    }

    function elementMatches(el, selector) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        var fn =
            el.matches ||
            el.webkitMatchesSelector ||
            el.mozMatchesSelector ||
            el.msMatchesSelector;
        return fn ? fn.call(el, selector) : false;
    }

    function closestElement(node, selector) {
        if (!node) {
            return null;
        }
        if (node.closest) {
            return node.closest(selector);
        }
        var cur = node;
        while (cur && cur.nodeType === 1) {
            if (elementMatches(cur, selector)) {
                return cur;
            }
            cur = cur.parentElement;
        }
        return null;
    }

    function base64ToBytes(input) {
        var binary = atob(input);
        var out = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) {
            out[i] = binary.charCodeAt(i);
        }
        return out;
    }

    function bytesToUtf8(bytes) {
        if (typeof TextDecoder !== "undefined") {
            try {
                return new TextDecoder("utf-8").decode(bytes);
            } catch (_) { }
        }

        var binary = "";
        for (var i = 0; i < bytes.length; i += 1) {
            binary += String.fromCharCode(bytes[i]);
        }

        try {
            return decodeURIComponent(escape(binary));
        } catch (_) {
            return binary;
        }
    }

    function xorDecodePayload(payload, xorKey) {
        var key = xorKey && xorKey.length ? xorKey : DEFAULT_XOR_KEY;
        var encrypted = base64ToBytes(payload);
        var output = new Uint8Array(encrypted.length);

        for (var i = 0; i < encrypted.length; i += 1) {
            output[i] = encrypted[i] ^ key[i % key.length];
        }

        return bytesToUtf8(output);
    }

    var scriptLoadCache = {};

    function loadScript(src) {
        if (scriptLoadCache[src]) {
            return scriptLoadCache[src];
        }

        scriptLoadCache[src] = new Promise(function (resolve, reject) {
            var script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = function () {
                resolve();
            };
            script.onerror = function () {
                reject(new Error("Gagal memuat script: " + src));
            };
            document.head.appendChild(script);
        });

        return scriptLoadCache[src];
    }

    function expandRawRow(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }

        return {
            year: raw.year != null ? raw.year : raw.y,
            period: raw.period != null ? raw.period : raw.p,
            category: raw.category != null ? raw.category : raw.c,
            link: raw.link != null ? raw.link : raw.l,
            title: raw.title != null ? raw.title : raw.t,
            lang: raw.lang != null ? raw.lang : raw.g,
            note: raw.note != null ? raw.note : raw.n,
            syntax: raw.syntax != null ? raw.syntax : raw.s,
            indicator: raw.indicator != null ? raw.indicator : raw.i,
        };
    }

    function normalizeEntry(item) {
        var yearNum = Number(item && item.year);
        if (!Number.isFinite(yearNum)) {
            return null;
        }

        var rawPeriod = String((item && item.period) || "").trim();
        var period = rawPeriod && rawPeriod !== "-" ? rawPeriod : "Tanpa Periode";

        var rawCategory = String((item && item.category) || "").trim().toLowerCase();
        var category = CATEGORY_META[rawCategory] ? rawCategory : "sejarah";

        var link = String((item && item.link) || "").trim();
        var title = String((item && item.title) || "").trim() || "Dokumen tanpa judul";
        var lang = String((item && item.lang) || "").trim().toLowerCase();
        var note = String((item && item.note) || "").trim();
        var syntax = String((item && item.syntax) || "").trim();
        var indicator = String((item && item.indicator) || "").trim();

        return {
            year: yearNum,
            period: period,
            periodNorm: period.toLowerCase(),
            category: category,
            link: link,
            title: title,
            lang: lang,
            note: note,
            syntax: syntax,
            indicator: indicator,
        };
    }

    function loadRowsFromManifest() {
        var manifest = window.SAKERNAS_MANIFEST;
        if (!manifest || !Array.isArray(manifest.shards) || !manifest.shards.length) {
            return Promise.resolve({ rows: [], meta: {} });
        }

        window.SAKERNAS_SHARDS = window.SAKERNAS_SHARDS || {};

        var fileSeen = {};
        var files = [];
        manifest.shards.forEach(function (shard) {
            if (shard && shard.file && !fileSeen[shard.file]) {
                fileSeen[shard.file] = true;
                files.push(shard.file);
            }
        });

        return Promise.all(
            files.map(function (src) {
                return loadScript(src);
            }),
        ).then(function () {
            var rows = [];
            var key = Array.isArray(manifest.key) && manifest.key.length ? manifest.key : DEFAULT_XOR_KEY;

            manifest.shards.forEach(function (shard) {
                if (!shard || !shard.id) {
                    return;
                }

                var payload = window.SAKERNAS_SHARDS[shard.id];
                if (typeof payload !== "string") {
                    return;
                }

                try {
                    var parsed = JSON.parse(xorDecodePayload(payload, key));
                    if (!Array.isArray(parsed)) {
                        return;
                    }

                    parsed.forEach(function (row) {
                        var expanded = expandRawRow(row);
                        if (expanded) {
                            rows.push(expanded);
                        }
                    });
                } catch (err) {
                    console.error("Gagal decode shard", shard.id, err);
                }
            });

            return {
                rows: rows,
                meta: {
                    dbBuiltAt: manifest.dbBuiltAt || "",
                    siteBuiltAt: manifest.siteBuiltAt || "",
                },
            };
        });
    }

    function loadDataSource() {
        if (Array.isArray(window.SAKERNAS_DATA) && window.SAKERNAS_DATA.length) {
            return Promise.resolve({
                rows: window.SAKERNAS_DATA,
                meta: window.SAKERNAS_META || {},
            });
        }

        return loadRowsFromManifest();
    }

    function isSafeUrl(rawUrl) {
        if (!rawUrl) {
            return false;
        }

        try {
            var parsed = new URL(rawUrl);
            if (parsed.protocol !== "https:") {
                return false;
            }

            var hostname = parsed.hostname.toLowerCase();
            return ALLOWED_HOST_SUFFIXES.some(function (suffix) {
                return hostname === suffix || hostname.endsWith("." + suffix);
            });
        } catch (_) {
            return false;
        }
    }

    function sortMonthDescending(a, b) {
        return (monthWeight[b.toLowerCase()] || 0) - (monthWeight[a.toLowerCase()] || 0);
    }

    function formatDbUpdatedLabel(dbBuiltAt) {
        if (!dbBuiltAt) {
            return "Data diperbarui di -";
        }

        var datePart = String(dbBuiltAt).split("T")[0];
        var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
        if (!match) {
            return "Data diperbarui di -";
        }

        var year = match[1];
        var monthNum = Number(match[2]);
        var day = String(Number(match[3]));
        var monthNames = [
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember",
        ];
        var monthName = monthNames[monthNum - 1];
        if (!monthName) {
            return "Data diperbarui di -";
        }

        return "Data diperbarui di " + day + " " + monthName + " " + year;
    }

    function setTheme(nextTheme) {
        var safeTheme = nextTheme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", safeTheme);
        if (els.themeToggle) {
            els.themeToggle.setAttribute("aria-pressed", safeTheme === "dark" ? "true" : "false");
        }
        try {
            localStorage.setItem("arsip-theme", safeTheme);
        } catch (_) { }
        scheduleStickyOffsetUpdate();
    }

    function initTheme() {
        var stored = null;
        try {
            stored = localStorage.getItem("arsip-theme");
        } catch (_) { }

        if (stored === "dark" || stored === "light") {
            setTheme(stored);
            return;
        }

        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            setTheme("dark");
            return;
        }

        setTheme("light");
    }

    function updateStickyOffsets() {
        stickyRAF = null;
        if (!els.header) {
            return;
        }
        var headerHeight = Math.ceil(els.header.getBoundingClientRect().height);
        document.documentElement.style.setProperty("--header-h", headerHeight + "px");
    }

    function scheduleStickyOffsetUpdate() {
        if (stickyRAF !== null) {
            cancelAnimationFrame(stickyRAF);
        }
        stickyRAF = requestAnimationFrame(updateStickyOffsets);
    }

    function updateCategoryButtons() {
        var buttons = els.catFilters.querySelectorAll(".btn[data-cat]");
        Array.prototype.forEach.call(buttons, function (btn) {
            var active = btn.dataset.cat === curCat;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (els.indicatorFilter) {
            if (curCat === "sintaks") {
                els.indicatorFilter.style.display = "inline-block";
            } else {
                els.indicatorFilter.style.display = "none";
                curIndicator = "all";
                els.indicatorFilter.value = "all";
            }
        }
    }

    function updateViewToggleText() {
        if (!els.viewToggle) {
            return;
        }
        var isCard = viewMode === "card";
        els.viewToggle.setAttribute(
            "aria-label",
            isCard ? "Ganti ke tampilan daftar" : "Ganti ke tampilan kartu",
        );
    }

    function createFileItem(file) {
        var row = document.createElement("div");
        row.className = "file-item";

        var badge = document.createElement("button");
        badge.type = "button";
        badge.className = "badge " + CATEGORY_META[file.category].className;
        badge.dataset.tag = file.category;
        badge.setAttribute("aria-label", CATEGORY_META[file.category].buttonLabel);
        badge.textContent = CATEGORY_META[file.category].shortLabel;

        var content = document.createElement("div");
        content.className = "file-content";

        if (isSafeUrl(file.link)) {
            var link = document.createElement("a");
            link.className = "file-link";
            link.href = file.link;
            link.target = "_blank";
            link.rel = "noopener noreferrer nofollow";
            if (file.lang === "en") {
                link.lang = "en";
            }
            link.textContent = file.title;
            content.appendChild(link);
        } else if (!file.syntax) {
            var noLink = document.createElement("span");
            noLink.className = "no-link";
            noLink.textContent = file.title + " (tidak tersedia/belum diunggah)";
            content.appendChild(noLink);
        } else {
            var syntaxTitle = document.createElement("a");
            syntaxTitle.className = "syntax-title-link";
            if (file.indicator) {
                syntaxTitle.dataset.indicator = file.indicator;
            }
            syntaxTitle.setAttribute("role", "button");
            syntaxTitle.setAttribute("tabindex", "0");
            syntaxTitle.textContent = file.title;
            content.appendChild(syntaxTitle);
        }

        if (file.note) {
            var note = document.createElement("span");
            note.className = "file-note";
            note.textContent = ">> " + file.note;
            content.appendChild(note);
        }

        if (file.syntax) {
            var syntaxContainer = document.createElement("details");
            syntaxContainer.className = "syntax-container";

            var summary = document.createElement("summary");
            summary.className = "syntax-summary";
            summary.textContent = file.indicator ? file.indicator : "Lihat Sintaks SPSS";

            var syntaxContent = document.createElement("div");
            syntaxContent.className = "syntax-content";

            var copyBtn = document.createElement("button");
            copyBtn.type = "button";
            copyBtn.className = "copy-btn js-copy-btn";
            copyBtn.textContent = "Salin";
            copyBtn.setAttribute("aria-label", "Salin sintaks");

            var pre = document.createElement("pre");
            pre.className = "syntax-pre";

            var code = document.createElement("code");
            code.textContent = file.syntax;

            pre.appendChild(code);
            syntaxContent.appendChild(copyBtn);
            syntaxContent.appendChild(pre);

            syntaxContainer.appendChild(summary);
            syntaxContainer.appendChild(syntaxContent);

            content.appendChild(syntaxContainer);
        }

        row.appendChild(badge);
        row.appendChild(content);
        return row;
    }

    function render() {
        els.grid.className = "grid view-" + viewMode;

        var filtered = data.filter(function (item) {
            var yearMatch = curYear === "all" || String(item.year) === curYear;
            var monthMatch = curMonth === "all" || item.periodNorm === curMonth;
            var categoryMatch = curCat === "all" || item.category === curCat;
            var indicatorMatch = curIndicator === "all" || item.indicator === curIndicator;
            return yearMatch && monthMatch && categoryMatch && indicatorMatch;
        });

        if (els.statsCount) {
            els.statsCount.textContent = filtered.length + " Berkas";
        }

        var grouped = new Map();

        filtered.forEach(function (item) {
            if (!grouped.has(item.year)) {
                grouped.set(item.year, new Map());
            }

            var perYear = grouped.get(item.year);
            var monthKey = item.period.toUpperCase();

            if (!perYear.has(monthKey)) {
                perYear.set(monthKey, []);
            }

            perYear.get(monthKey).push(item);
        });

        var years = Array.from(grouped.keys()).sort(function (a, b) {
            return b - a;
        });

        var rootFrag = document.createDocumentFragment();

        years.forEach(function (yearValue) {
            var card = document.createElement("article");
            card.className = "card";

            var cardHeader = document.createElement("header");
            cardHeader.className = "card-year-header";

            var yearHeading = document.createElement("h2");
            yearHeading.textContent = String(yearValue);
            cardHeader.appendChild(yearHeading);

            var cardBody = document.createElement("div");
            cardBody.className = "card-body";

            var months = Array.from(grouped.get(yearValue).keys()).sort(sortMonthDescending);

            months.forEach(function (monthName) {
                var section = document.createElement("section");
                section.className = "month-section";

                var monthHeader = document.createElement("div");
                monthHeader.className = "month-header";

                var monthTitle = document.createElement("h3");
                monthTitle.className = "month-title";
                monthTitle.textContent = monthName;

                monthHeader.appendChild(monthTitle);

                var fileList = document.createElement("div");
                fileList.className = "file-list";

                grouped
                    .get(yearValue)
                    .get(monthName)
                    .slice()
                    .sort(function (a, b) {
                        return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
                    })
                    .forEach(function (entry) {
                        fileList.appendChild(createFileItem(entry));
                    });

                section.appendChild(monthHeader);
                section.appendChild(fileList);
                cardBody.appendChild(section);
            });

            card.appendChild(cardHeader);
            card.appendChild(cardBody);
            rootFrag.appendChild(card);
        });

        if (typeof els.grid.replaceChildren === "function") {
            els.grid.replaceChildren(rootFrag);
        } else {
            while (els.grid.firstChild) {
                els.grid.removeChild(els.grid.firstChild);
            }
            els.grid.appendChild(rootFrag);
        }

        if (els.resetBtn) {
            var showReset = curYear !== "all" || curMonth !== "all" || curCat !== "all";
            els.resetBtn.style.display = showReset ? "inline-flex" : "none";
        }

        scheduleStickyOffsetUpdate();
    }

    function setupFilters() {
        while (els.yearFilter.options.length > 1) {
            els.yearFilter.remove(1);
        }
        while (els.monthFilter.options.length > 1) {
            els.monthFilter.remove(1);
        }
        if (els.indicatorFilter) {
            while (els.indicatorFilter.options.length > 1) {
                els.indicatorFilter.remove(1);
            }
        }

        var years = Array.from(
            new Set(
                data.map(function (item) {
                    return item.year;
                }),
            ),
        ).sort(function (a, b) {
            return b - a;
        });

        years.forEach(function (yearValue) {
            var option = document.createElement("option");
            option.value = String(yearValue);
            option.textContent = String(yearValue);
            els.yearFilter.appendChild(option);
        });

        var periods = Array.from(
            new Set(
                data.map(function (item) {
                    return item.period;
                }),
            ),
        ).sort(function (a, b) {
            return (monthWeight[a.toLowerCase()] || 0) - (monthWeight[b.toLowerCase()] || 0);
        });

        periods.forEach(function (period) {
            var option = document.createElement("option");
            option.value = period.toLowerCase();
            option.textContent = period.toUpperCase();
            els.monthFilter.appendChild(option);
        });

        if (els.indicatorFilter) {
            var indicators = Array.from(
                new Set(
                    data
                        .filter(function (item) { return item.category === "sintaks" && item.indicator; })
                        .map(function (item) { return item.indicator; })
                )
            ).sort();

            indicators.forEach(function (indicator) {
                var option = document.createElement("option");
                option.value = indicator;
                option.textContent = indicator;
                els.indicatorFilter.appendChild(option);
            });
        }

        if (els.dbVer) {
            els.dbVer.textContent = formatDbUpdatedLabel(meta.dbBuiltAt || "");
        }
    }

    function bindEvents() {
        els.grid.addEventListener("click", function (event) {
            var badge = closestElement(event.target, ".badge[data-tag]");
            if (badge) {
                curCat = badge.dataset.tag || "all";
                updateCategoryButtons();
                render();
                return;
            }

            var syntaxTitleLink = closestElement(event.target, ".syntax-title-link");
            if (syntaxTitleLink && syntaxTitleLink.dataset.indicator) {
                curCat = "sintaks";
                curIndicator = syntaxTitleLink.dataset.indicator;
                if (els.indicatorFilter) {
                    els.indicatorFilter.value = curIndicator;
                }
                updateCategoryButtons();
                render();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            var copyBtn = closestElement(event.target, ".js-copy-btn");
            if (copyBtn) {
                var pre = copyBtn.nextElementSibling;
                if (pre && pre.tagName === 'PRE') {
                    var text = pre.textContent;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(function () {
                            var originalText = copyBtn.textContent;
                            copyBtn.textContent = "Tersalin!";
                            copyBtn.classList.add("copied");
                            setTimeout(function () {
                                copyBtn.textContent = originalText;
                                copyBtn.classList.remove("copied");
                            }, 2000);
                        }).catch(function (err) {
                            console.error("Gagal menyalin", err);
                        });
                    }
                }
                return;
            }
        });

        els.yearFilter.addEventListener("change", function (event) {
            curYear = event.target.value;
            render();
        });

        els.monthFilter.addEventListener("change", function (event) {
            curMonth = event.target.value;
            render();
        });

        if (els.indicatorFilter) {
            els.indicatorFilter.addEventListener("change", function (event) {
                curIndicator = event.target.value;
                render();
            });
        }

        els.catFilters.addEventListener("click", function (event) {
            var button = closestElement(event.target, ".btn[data-cat]");
            if (!button) {
                return;
            }
            curCat = button.dataset.cat;
            updateCategoryButtons();
            render();
        });

        if (els.viewToggle) {
            els.viewToggle.addEventListener("click", function () {
                viewMode = viewMode === "list" ? "card" : "list";
                updateViewToggleText();
                render();
            });
        }

        if (els.resetBtn) {
            els.resetBtn.addEventListener("click", function () {
                curYear = "all";
                curMonth = "all";
                curCat = "all";
                curIndicator = "all";
                els.yearFilter.value = "all";
                els.monthFilter.value = "all";
                if (els.indicatorFilter) {
                    els.indicatorFilter.value = "all";
                }
                updateCategoryButtons();
                render();
            });
        }

        if (els.themeToggle) {
            els.themeToggle.addEventListener("click", function () {
                var theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
                setTheme(theme);
            });
        }

        window.addEventListener("resize", scheduleStickyOffsetUpdate);
    }

    function bootWithRows(sourceRows, sourceMeta) {
        meta = sourceMeta || {};
        data = sourceRows.map(expandRawRow).map(normalizeEntry).filter(Boolean);

        setupFilters();
        updateCategoryButtons();
        updateViewToggleText();
        render();
    }

    bindEvents();
    initTheme();

    if (els.statsCount) {
        els.statsCount.textContent = "MEMUAT...";
    }

    loadDataSource()
        .then(function (source) {
            bootWithRows(source.rows || [], source.meta || {});
        })
        .catch(function (err) {
            console.error("Gagal memuat dataset", err);
            bootWithRows([], {});
        });
})();
