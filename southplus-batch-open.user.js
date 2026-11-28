// ==UserScript==
// @name         South Plus 批量打开 & 已读记录
// @namespace    https://south-plus.net/
// @version      1.2.2
// @description  在 south-plus.net 板块列表页 / 搜索结果页为每个帖子名左侧添加复选框，支持批量勾选/打开，并用 localStorage 记录已读帖子（已读帖子灰显且默认不勾选）
// @author       Paccu
// @match        http://south-plus.net/thread.php*
// @match        https://south-plus.net/thread.php*
// @match        http://www.south-plus.net/thread.php*
// @match        https://www.south-plus.net/thread.php*
// @match        http://south-plus.net/read.php*
// @match        https://south-plus.net/read.php*
// @match        http://www.south-plus.net/read.php*
// @match        https://www.south-plus.net/read.php*
// @match        http://south-plus.net/search.php*
// @match        https://south-plus.net/search.php*
// @match        http://www.south-plus.net/search.php*
// @match        https://www.south-plus.net/search.php*
// @include      *://*/thread.php*
// @include      *://*/read.php*
// @include      *://*/search.php*
// @run-at       document-idle
// @grant        GM_openInTab
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    var STORAGE_KEY = 'southplus_read_threads';
    var _initialized = false;

    // ---------- 存储（优先页面 localStorage，失败时回退 unsafeWindow / 内存） ----------
    var _memoryStore = new Set();

    function getStorage() {
        try {
            if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
        } catch (e) {}
        try {
            if (typeof unsafeWindow !== 'undefined' && unsafeWindow.localStorage) return unsafeWindow.localStorage;
        } catch (e) {}
        return null;
    }

    function loadReadTids() {
        var store = getStorage();
        if (!store) return new Set(_memoryStore);
        try {
            var raw = store.getItem(STORAGE_KEY);
            if (!raw) return new Set();
            var arr = JSON.parse(raw);
            return new Set(Array.isArray(arr) ? arr.filter(function (x) { return typeof x === 'string'; }) : []);
        } catch (e) {
            return new Set();
        }
    }

    function persistReadTids(set) {
        var store = getStorage();
        var arr = Array.from(set);
        if (store) {
            try {
                store.setItem(STORAGE_KEY, JSON.stringify(arr));
            } catch (e) {
                _memoryStore = new Set(arr);
            }
        } else {
            _memoryStore = new Set(arr);
        }
    }

    function buildReadUrl(tid) {
        try {
            return new URL('read.php?tid-' + tid + '.html', location.href).href;
        } catch (e) {
            return (location.origin || (location.protocol + '//' + location.host)) + '/read.php?tid-' + tid + '.html';
        }
    }

    function openTab(url) {
        if (typeof GM_openInTab === 'function') {
            GM_openInTab(url, { active: false, insert: true, setParent: true });
        } else {
            window.open(url, '_blank');
        }
    }

    // ---------- 页面类型判断 ----------
    function pageScriptName() {
        var p = location.pathname || '';
        var m = p.match(/\/([^/]+)$/);
        return m ? m[1].toLowerCase() : '';
    }
    function isReadPage() {
        return pageScriptName() === 'read.php';
    }
    function isListPage() {
        var n = pageScriptName();
        return n === 'thread.php' || n === 'search.php';
    }

    // ---------- 确认是南+论坛（支持镜像域名） ----------
    function isSouthPlusForum() {
        var t = document.title || '';
        if (t.indexOf('South Plus') !== -1 || t.indexOf('南+') !== -1) return true;
        var base = document.querySelector('base#headbase');
        var href = base ? (base.getAttribute('href') || '') : '';
        return /plus/i.test(href);
    }

    // ---------- read.php 页面：打开即记录已读 ----------
    function markCurrentPageReadIfNeeded() {
        if (!isReadPage()) return;
        var m = location.href.match(/tid-(\d+)/);
        if (!m) return;
        var set = loadReadTids();
        if (!set.has(m[1])) {
            set.add(m[1]);
            persistReadTids(set);
        }
    }

    // ---------- 注入样式 ----------
    function injectStyle() {
        var css = [
            '.sp-check-label { display:inline-block; margin:0 6px 0 0; vertical-align:middle; }',
            '.sp-check { cursor:pointer; width:15px; height:15px; vertical-align:middle; accent-color:#3b82f6; }',
            'tr.sp-read { background:#d6d6d6 !important; }',
            '.z tr.sp-read:hover { background:#d6d6d6 !important; }',
            'tr.sp-read td { background:transparent !important; }',
            'tr.sp-read h3 a, tr.sp-read h3 font { color:#999 !important; }',
            '.sp-check.sp-check-read { accent-color:#9ca3af; filter:grayscale(1); opacity:.55; cursor:pointer; }',
            '.sp-toolbar { position:fixed; bottom:12px; z-index:2147483647; display:flex; align-items:center; gap:8px; background:#ffffff; border:1px solid #dddddd; border-radius:8px; padding:8px 12px; box-shadow:0 2px 12px rgba(0,0,0,.18); font-family:Arial,"Microsoft YaHei",sans-serif; }',
            '.sp-toolbar-left { left:12px; }',
            '.sp-toolbar-right { right:12px; }',
            '.sp-btn { cursor:pointer; border:1px solid #dddddd; background:#f5f5f5; color:#333; padding:6px 14px; border-radius:6px; font-size:13px; }',
            '.sp-btn:hover { background:#e8e8e8; }',
            '.sp-btn-primary { background:#2563eb; border-color:#2563eb; color:#fff; font-weight:bold; }',
            '.sp-btn-primary:hover { background:#1d4ed8; }',
            '.sp-count { color:#666; font-size:12px; margin-left:4px; }'
        ].join('\n');
        var style = document.createElement('style');
        style.id = 'sp-batch-open-style';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ---------- 从帖子行中提取规范 tid ----------
    function extractTid(row) {
        var anchors = row.querySelectorAll('a[href]');
        for (var i = 0; i < anchors.length; i++) {
            var m = anchors[i].getAttribute('href').match(/read\.php\?tid-(\d+)\.html/);
            if (m) return m[1];
        }
        for (var j = 0; j < anchors.length; j++) {
            var m2 = anchors[j].getAttribute('href').match(/read\.php\?tid-(\d+)/);
            if (m2) return m2[1];
        }
        return null;
    }

    // ---------- 定位标题单元格（兼容板块列表与搜索结果的列差异） ----------
    function findTitleCell(row) {
        var td = row.querySelector('td[id^="td_"]');
        if (td) return td;
        var a = row.querySelector('a[id^="a_ajax_"]');
        if (a && a.closest) {
            var cell = a.closest('td, th');
            if (cell) return cell;
        }
        if (row.cells && row.cells.length > 1) return row.cells[1];
        return null;
    }

    function markRowRead(row, box) {
        row.classList.add('sp-read');
        if (box) {
            box.checked = false;
            box.classList.add('sp-check-read');
        }
    }

    function processThreadRow(row) {
        if (row.dataset.spProcessed === '1') return;
        row.dataset.spProcessed = '1';

        var tid = extractTid(row);
        if (!tid) return;

        var titleCell = findTitleCell(row);
        if (!titleCell) return;

        var label = document.createElement('label');
        label.className = 'sp-check-label';
        var box = document.createElement('input');
        box.type = 'checkbox';
        box.className = 'sp-check';
        box.dataset.tid = tid;
        box.title = '选择该帖子';
        label.appendChild(box);
        titleCell.insertBefore(label, titleCell.firstChild);

        box.addEventListener('change', updateCount);
        if (loadReadTids().has(tid)) {
            markRowRead(row, box);
        }
    }

    function scanThreads() {
        // 板块列表（#ajaxtable）与搜索结果页（无 id 的「主题列表」表格）的结果行 class 均为 tr3
        var rows = document.querySelectorAll('tr.tr3');
        for (var i = 0; i < rows.length; i++) {
            processThreadRow(rows[i]);
        }
        updateCount();
    }

    function updateCount() {
        var boxes = document.querySelectorAll('input.sp-check');
        var selected = 0;
        var unread = 0;
        for (var i = 0; i < boxes.length; i++) {
            if (boxes[i].checked) selected++;
            if (!boxes[i].classList.contains('sp-check-read')) unread++;
        }
        var el = document.getElementById('sp-count');
        if (el) el.textContent = '已选 ' + selected + ' / 未读 ' + unread;
    }

    // ---------- 工具栏 ----------
    function buildToolbar() {
        var left = document.createElement('div');
        left.className = 'sp-toolbar sp-toolbar-left';
        left.innerHTML =
            '<button type="button" class="sp-btn" id="sp-select-unread">批量选择未选页面</button>' +
            '<button type="button" class="sp-btn" id="sp-deselect-all">取消选择</button>' +
            '<span class="sp-count" id="sp-count">已选 0</span>';

        var right = document.createElement('div');
        right.className = 'sp-toolbar sp-toolbar-right';
        right.innerHTML =
            '<button type="button" class="sp-btn sp-btn-primary" id="sp-open-selected">打开已选页面</button>';

        document.body.appendChild(left);
        document.body.appendChild(right);

        document.getElementById('sp-select-unread').addEventListener('click', function () {
            // 只自动勾选未读帖子，已读帖子默认不自动勾选
            var boxes = document.querySelectorAll('input.sp-check:not(.sp-check-read)');
            for (var i = 0; i < boxes.length; i++) {
                if (!boxes[i].checked) boxes[i].checked = true;
            }
            updateCount();
        });

        document.getElementById('sp-deselect-all').addEventListener('click', function () {
            var boxes = document.querySelectorAll('input.sp-check');
            for (var i = 0; i < boxes.length; i++) {
                boxes[i].checked = false;
            }
            updateCount();
        });

        document.getElementById('sp-open-selected').addEventListener('click', function () {
            var checked = Array.prototype.slice.call(document.querySelectorAll('input.sp-check:checked'));
            if (checked.length === 0) return;

            var tids = [];
            for (var i = 0; i < checked.length; i++) {
                if (checked[i].dataset.tid) tids.push(checked[i].dataset.tid);
            }
            if (tids.length === 0) return;

            // 立即记录为已读并持久化
            var set = loadReadTids();
            for (var j = 0; j < tids.length; j++) {
                set.add(tids[j]);
            }
            persistReadTids(set);

            // 逐个打开（间隔避免被浏览器拦截/过载）
            for (var k = 0; k < tids.length; k++) {
                (function (tid, index) {
                    setTimeout(function () {
                        openTab(buildReadUrl(tid));
                    }, index * 350);
                })(tids[k], k);
            }

            // 更新 UI：置灰并取消勾选
            for (var n = 0; n < checked.length; n++) {
                markRowRead(checked[n].closest('tr'), checked[n]);
            }
            updateCount();
        });
    }

    // ---------- 初始化 ----------
    function init() {
        if (_initialized) return;
        _initialized = true;

        if (!isSouthPlusForum()) return;

        if (isReadPage()) {
            markCurrentPageReadIfNeeded();
            return;
        }
        if (!isListPage()) return;
        // 板块列表有 #ajaxtable；搜索结果页无该 id，但存在 tr3 结果行
        if (!document.getElementById('ajaxtable') && !document.querySelector('tr.tr3')) return;

        injectStyle();
        buildToolbar();
        scanThreads();
        console.log('[SouthPlus批量打开] 已注入复选框与工具栏');

        // 监听可能由 AJAX 动态插入的帖子行
        var tbody = document.querySelector('#ajaxtable tbody');
        if (tbody && window.MutationObserver) {
            var observer = new MutationObserver(function () {
                scanThreads();
            });
            observer.observe(tbody, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
