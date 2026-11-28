'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

// 读取脚本并去掉 UserScript 元数据头，得到 IIFE 主体
const SCRIPT = fs
    .readFileSync(path.join(__dirname, '..', 'southplus-batch-open.user.js'), 'utf8')
    .replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

// 构造一个结构接近 phpwind 板块/搜索列表页的 HTML fixture
function buildThreadHtml(rows) {
    const trs = rows.map(function (r) {
        const suffix = r.fpage ? '-fpage-' + r.fpage : '';
        const read = 'read.php?tid-' + r.tid + suffix + '.html';
        return '<tr align="center" class="tr3 t_one">' +
            '<td><a title="打开新窗口" href="' + read + '" target="_blank"><img src="images/topicnew.gif"></a></td>' +
            '<td style="text-align:left;line-height:23px;" id="td_' + r.tid + '">' +
            '<h3><a href="' + read + '" id="a_ajax_' + r.tid + '"><b><font color="#000">' + r.title + '</font></b></a></h3>' +
            '</td>' +
            '<td class="tal y-style"><a href="u.php">作者</a></td>' +
            '<td class="tal y-style f10"><span class="s8">1</span> / 100</td>' +
            '<td class="tal y-style"><a href="read.php?tid-' + r.tid + '-page-e' + suffix + '.html#a">2026-01-01</a></td>' +
            '</tr>';
    }).join('\n');

    return '<!DOCTYPE html><html><head>' +
        '<title>实用动画| 免空资源区 - 南+ South Plus</title>' +
        '<base id="headbase" href="//south-plus.net/">' +
        '</head><body>' +
        '<div class="t z"><table id="ajaxtable"><tbody style="table-layout:fixed;">' +
        '<tr></tr><tr class="tr2"><td></td><td>文章</td><td>作者</td><td>回复/人气</td><td>最后发表</td></tr>' +
        trs +
        '</tbody></table></div>' +
        '</body></html>';
}

function makeWindow(url, html) {
    const vc = new VirtualConsole(); // 吞掉 jsdom 解析页面 CSS 的告警
    const dom = new JSDOM(html, {
        url: url,
        runScripts: 'outside-only',
        pretendToBeVisual: true,
        virtualConsole: vc
    });
    const w = dom.window;
    w.unsafeWindow = w;
    const opened = [];
    w.GM_openInTab = function (u) { opened.push(u); };
    return { w: w, opened: opened };
}

function run(w) {
    w.eval(SCRIPT);
    // jsdom outside-only 模式下 readyState 停留于 loading，手动触发 DOMContentLoaded
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
}

test('thread.php 板块列表页注入复选框与工具栏', function () {
    const rows = [{ tid: 1001, title: '帖子A' }, { tid: 1002, title: '帖子B' }, { tid: 1003, title: '帖子C' }];
    const { w } = makeWindow('https://south-plus.net/thread.php?fid-4.html', buildThreadHtml(rows));
    run(w);

    assert.strictEqual(w.document.querySelectorAll('input.sp-check').length, 3);
    assert.ok(w.document.getElementById('sp-select-unread'));
    assert.ok(w.document.getElementById('sp-deselect-all'));
    assert.ok(w.document.getElementById('sp-open-selected'));
    // 回归：thread.php 不得被误判为 read.php（否则不会注入样式与按钮）
    assert.ok(w.document.getElementById('sp-batch-open-style'));
});

test('search.php 搜索结果页同样注入', function () {
    const rows = [{ tid: 2001, title: '搜索结果1' }, { tid: 2002, title: '搜索结果2' }];
    const { w } = makeWindow('https://south-plus.net/search.php?step=2&key=MMD', buildThreadHtml(rows));
    run(w);

    assert.strictEqual(w.document.querySelectorAll('input.sp-check').length, 2);
    assert.ok(w.document.getElementById('sp-open-selected'));
});

test('带 -fpage 的链接也能正确提取 tid', function () {
    const rows = [{ tid: 3001, title: '带fpage', fpage: 3 }];
    const { w } = makeWindow('https://south-plus.net/thread.php?fid-4.html', buildThreadHtml(rows));
    run(w);

    const box = w.document.querySelector('input.sp-check');
    assert.ok(box);
    assert.strictEqual(box.dataset.tid, '3001');
});

test('已读帖子置灰、复选框禁用且默认不勾选', function () {
    const rows = [{ tid: 4001, title: '已读' }, { tid: 4002, title: '未读' }];
    const { w } = makeWindow('https://south-plus.net/thread.php?fid-4.html', buildThreadHtml(rows));
    w.localStorage.setItem('southplus_read_threads', JSON.stringify(['4001']));
    run(w);

    const readBox = w.document.querySelector('input.sp-check[data-tid="4001"]');
    const unreadBox = w.document.querySelector('input.sp-check[data-tid="4002"]');
    assert.ok(readBox.disabled);
    assert.strictEqual(readBox.checked, false);
    assert.strictEqual(unreadBox.disabled, false);
    assert.ok(readBox.closest('tr').classList.contains('sp-read'));
});

test('read.php 页面打开即记录已读', function () {
    const readHtml = '<!DOCTYPE html><html><head><title>帖子 - 南+ South Plus</title></head><body></body></html>';
    const { w } = makeWindow('https://south-plus.net/read.php?tid-5001.html', readHtml);
    run(w);

    const stored = JSON.parse(w.localStorage.getItem('southplus_read_threads') || '[]');
    assert.ok(stored.includes('5001'));
});

test('按钮行为：批量选择 / 取消选择 / 打开已选', async function () {
    const rows = [{ tid: 6001, title: 'A' }, { tid: 6002, title: 'B' }, { tid: 6003, title: 'C' }];
    const { w, opened } = makeWindow('https://south-plus.net/thread.php?fid-4.html', buildThreadHtml(rows));
    run(w);

    // 批量选择未选页面
    w.document.getElementById('sp-select-unread').dispatchEvent(new w.Event('click'));
    assert.strictEqual(w.document.querySelectorAll('input.sp-check:checked').length, 3);

    // 取消选择
    w.document.getElementById('sp-deselect-all').dispatchEvent(new w.Event('click'));
    assert.strictEqual(w.document.querySelectorAll('input.sp-check:checked').length, 0);

    // 手动勾选两个后打开
    w.document.querySelector('input.sp-check[data-tid="6001"]').checked = true;
    w.document.querySelector('input.sp-check[data-tid="6002"]').checked = true;
    w.document.getElementById('sp-open-selected').dispatchEvent(new w.Event('click'));

    // 打开标签页有约 350ms 间隔，等待执行完成
    await new Promise(function (r) { setTimeout(r, 900); });
    assert.strictEqual(opened.length, 2);
    assert.ok(opened.some(function (u) { return u.includes('tid-6001'); }));
    assert.ok(opened.some(function (u) { return u.includes('tid-6002'); }));

    // 打开后标记为已读并置灰
    const stored = JSON.parse(w.localStorage.getItem('southplus_read_threads') || '[]');
    assert.ok(stored.includes('6001'));
    assert.ok(stored.includes('6002'));
    assert.ok(w.document.querySelector('input.sp-check[data-tid="6001"]').disabled);
});
