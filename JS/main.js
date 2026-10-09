// main.js

var t = (key, vars = {}, fallback = "") => {
    if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
        return window.APP_I18N.t(key, vars, fallback);
    }
    return fallback || key;
};

let activeUser = (localStorage.getItem("userName") || "").trim();
if (!activeUser) {
    activeUser = t("common.guest", {}, "ゲスト");
    localStorage.setItem("userName", activeUser);
    console.warn("userName が未設定のため、ゲストユーザで main.html を開きます。");
}

let activeTheme = (localStorage.getItem("searchTitle") || "").trim();
if (!activeTheme) {
    activeTheme = t("defaults.unsetTheme", {}, "未設定のテーマ");
    localStorage.setItem("searchTitle", activeTheme);
    console.warn("searchTitle が未設定のため、未設定テーマで main.html を開きます。");
}

// 1. レイアウト設定
const KEYWORD_PANEL_WIDTH_PERCENT = 15;
var config = {
  // グローバル設定: 閉じる/最大化/ポップアウトアイコンをすべて表示
  settings: {
      showCloseIcon: true,
      showMaximiseIcon: true, 
      showPopoutIcon: true
  },
  
  // 上段にキーワード生成とマップ、下段に横幅全体の探究プロセスマップ
  content: [{
      type: 'column',
      content: [
          {
              type: 'row',
              height: 30,
              content: [
                  {
                      type: 'column',
                      width: KEYWORD_PANEL_WIDTH_PERCENT,
                      content: [{
                          type: 'component',
                          componentName: 'leftNavi',
                          closable: true,
                          header: { show: false }
                      }]
                  },
                  {
                      type: 'column',
                      width: 100 - KEYWORD_PANEL_WIDTH_PERCENT,
                      content: [{
                          type: 'component',
                          componentName: 'mainContents',
                          closable: true,
                          header: { show: false }
                      }]
                  }
              ]
          },
          {
              type: 'component',
              componentName: 'extraContent',
              height: 70,
              closable: true,
              header: { show: false }
          }
      ]
  }]
};

// 2. レイアウトのインスタンス化 (Golden Layout コンテナを指定)
// jQueryを使って #golden-layout-container を指定します
var myLayout = new GoldenLayout( config, $('#golden-layout-container') );

// 3. コンポーネントの登録
// index.htmlの非表示エリアからコンテンツを取り出し、GLコンテナに移動します。
myLayout.registerComponent( 'leftNavi', function( container, componentState ){
// #left-navi-content の中身をコンテナに移動
var content = $('#left-navi-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'mainContents', function( container, componentState ){
// #main-contents-content の中身をコンテナに移動
var content = $('#main-contents-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'rightNavi', function( container, componentState ){
// #right-navi-content の中身をコンテナに移動
var content = $('#right-navi-content').children();
container.getElement().append( content );
});

myLayout.registerComponent( 'extraContent', function( container, componentState ){
// #extra-content-content の中身をコンテナに移動
var content = $('#extra-content-content').children();
container.getElement().append( content );
});

// 4. レイアウトの初期化と起動
myLayout.init();

function notifyVisualResize() {
    if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event("app-layout-resized"));
    }
}

function updateLayoutSize() {
    var container = document.getElementById("golden-layout-container");
    if (!container) return;

    var width = container.clientWidth;
    var height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    if (typeof myLayout.updateSize === "function") {
        myLayout.updateSize(width, height);
    }

    notifyVisualResize();
}

let resizeTimer = null;
window.addEventListener("resize", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateLayoutSize, 120);
});

window.addEventListener("orientationchange", function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateLayoutSize, 120);
});

function logLayoutAction(message) {
    if (typeof window.addSystemLog === "function") {
        window.addSystemLog(message);
    }
}

function getKeywordWorkspaceRow() {
    const workspace = myLayout.root.contentItems[0];
    return workspace?.contentItems.find(item => item.isRow) || null;
}

function getLayoutColumns(row) {
    if (!row || !Array.isArray(row.contentItems) || row.contentItems.length < 2) {
        return { leftCol: null, rightCol: null };
    }
    return {
        leftCol: row.contentItems[0],
        rightCol: row.contentItems[1],
    };
}

function applySideViewState(row, shouldOpen) {
    const columns = getLayoutColumns(row);
    if (!columns.leftCol || !columns.rightCol) return false;

    columns.leftCol.config.width = shouldOpen ? KEYWORD_PANEL_WIDTH_PERCENT : 0;
    columns.rightCol.config.width = shouldOpen ? 100 - KEYWORD_PANEL_WIDTH_PERCENT : 100;
    row.callDownwards('setSize');
    updateLayoutSize();

    $('#createHypothesisBtn').removeAttr('hidden').removeClass('is-hidden');

    return true;
}

function updateSideViewButtonLabel(isOpen) {
    const button = document.getElementById("showLeftBtn");
    if (!button) return;
    button.textContent = isOpen
        ? "キーワード生成を隠す"
        : "キーワード生成を表示";
}

document.addEventListener("DOMContentLoaded", function () {
    if (typeof window.addSystemLog === "function") {
        const userName = (localStorage.getItem("userName") || "").trim() || t("common.unset", {}, "未設定");
        const titleFromStorage = (localStorage.getItem("searchTitle") || "").trim();
        const titleFromInput = (document.getElementById("myTitle")?.value || "").trim();
        const title = titleFromInput || titleFromStorage || t("common.unset", {}, "未設定");
        window.addSystemLog(
            t(
                "logs.systemStart",
                { userName, title },
                `システム起動: main.html を開きました (ユーザ: ${userName}, タイトル: ${title})`
            )
        );
    }
});

// 5. キーワード提示エリアの表示を切り替える
$(function(){
    var row = null;
    var isSideViewOpen = true;
    updateSideViewButtonLabel(isSideViewOpen);
    updateLayoutSize();
    myLayout.on('initialised', function(){
        // 初期化後に row を取得し、サイズ再計算
        row = getKeywordWorkspaceRow();
        if (row) {
            row.callDownwards('setSize');
        }
        updateLayoutSize();
        updateSideViewButtonLabel(isSideViewOpen);
    });

    window.addEventListener("app-language-changed", function () {
        updateSideViewButtonLabel(isSideViewOpen);
    });

    // 再表示時も初期表示と同じ幅へ戻す
    $('#showLeftBtn').on('click', function(){
        if (!row) {
            row = getKeywordWorkspaceRow();
        }
        if (!row) return;

        if (!isSideViewOpen) {
            if (applySideViewState(row, true)) {
                isSideViewOpen = true;
                updateSideViewButtonLabel(isSideViewOpen);
                logLayoutAction(t("logs.showSideView", {}, "画面: 左サイドビュー表示"));
            }
            return;
        }

        if (applySideViewState(row, false)) {
            isSideViewOpen = false;
            updateSideViewButtonLabel(isSideViewOpen);
            logLayoutAction(t("logs.hideSideView", {}, "画面: 左サイドビューを閉じる"));
        }
    });
});

// Enlarge existing Golden Layout items without moving or recreating editor DOM.
let enlargedMapItem = null;
window.toggleWorkspaceMap = function (componentName) {
    const component = myLayout.root.getItemsByFilter(item => item.config.componentName === componentName)[0];
    if (!component) return;
    const item = component.parent && component.parent.isStack ? component.parent : component;
    if (enlargedMapItem && enlargedMapItem !== item && enlargedMapItem.isMaximised) enlargedMapItem.toggleMaximise();
    item.toggleMaximise();
    enlargedMapItem = item.isMaximised ? item : null;
    document.querySelectorAll('[data-map-expand]').forEach(button => {
        const expanded = button.dataset.mapExpand === componentName && !!enlargedMapItem;
        button.textContent = expanded ? '元の配置に戻す' : '拡大表示';
        button.setAttribute('aria-pressed', String(expanded));
    });
    requestAnimationFrame(updateLayoutSize);
};
document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-map-expand]');
    if (button) window.toggleWorkspaceMap(button.dataset.mapExpand);
});
document.addEventListener('keydown', event => {
    const drawer = document.getElementById('hypothesisWorkspaceDrawer');
    if(event.key === 'Escape' && drawer?.open) { drawer.open = false; return; }
    if (event.key === 'Escape' && enlargedMapItem?.isMaximised && !document.getElementById('hypothesisWorkspaceDrawer')?.open) {
        const name = enlargedMapItem.contentItems[0]?.config.componentName;
        if (name) window.toggleWorkspaceMap(name);
    }
});


function toggleWorkspaceDrawer(drawer) {
    const opened = drawer.open;
    const layout = document.getElementById('golden-layout-container');
    if (layout) layout.inert = opened;
    const summary = drawer.querySelector('summary');
    summary.textContent = opened ? '仮説構造化を閉じる · Escでも戻れます' : drawer.dataset.title;
    drawer.setAttribute('role', opened ? 'dialog' : 'group');
    if (opened) drawer.setAttribute('aria-modal', 'true');
    else drawer.removeAttribute('aria-modal');
    summary.focus();
    window.dispatchEvent(new CustomEvent('workspace-drawer-changed', {detail:{id:drawer.id,open:opened}}));
    requestAnimationFrame(notifyVisualResize);
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.workspace-map-drawer').forEach(drawer => {
        drawer.addEventListener('toggle', () => toggleWorkspaceDrawer(drawer));
        if(drawer.open) toggleWorkspaceDrawer(drawer);
    });
});
